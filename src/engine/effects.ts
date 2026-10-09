import { Unit } from '../types/game';
import { SimulationState } from './simulation';

// Real-time combat effects. Driven by wall-clock time so they look the same at any frame rate,
// keep animating out while paused, and never spawn new fire unless the battle is running.

type Impact = SimulationState['artilleryImpacts'][number];

interface Puff { x: number; y: number; vx: number; vy: number; t0: number; dur: number; r0: number; r1: number; a: number; rgb: string }
interface Flash { x: number; y: number; t0: number; dur: number; r: number; rgb: string }
interface Streak { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; w: number; rgb: string }
interface Ring { x: number; y: number; t0: number; dur: number; r: number; rgb: string; w: number }
interface Debris { x: number; y: number; vx: number; vy: number; t0: number; dur: number }
// A round in flight is not drawn; it only delays the detonation by its time of flight.
interface Shell { t0: number; tof: number; impact: Impact }
interface Pending { at: number; impact: Impact }

const WIND = { x: 7, y: -2.5 }; // px/s drift for smoke (light westerly)
const MAX_PARTICLES = 900;

export class EffectsSystem {
  private puffs: Puff[] = [];
  private flashes: Flash[] = [];
  private streaks: Streak[] = [];
  private rings: Ring[] = [];
  private debris: Debris[] = [];
  private shells: Shell[] = [];
  private pending: Pending[] = [];
  private seenImpacts = new Set<string>();
  private landed = new Set<string>();
  private nextVolleyAt = new Map<string, number>();
  private lastNow = 0;

  update(state: SimulationState, now: number) {
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;

    this.ingestImpacts(state, now);
    if (state.isRunning) this.spawnDirectFire(state, now);

    // Shells arriving / scheduled impacts
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      if (now - s.t0 >= s.tof) {
        this.detonate(s.impact, now);
        this.shells.splice(i, 1);
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (now >= this.pending[i].at) {
        this.detonate(this.pending[i].impact, now);
        this.pending.splice(i, 1);
      }
    }

    // Integrate moving particles
    for (const p of this.puffs) {
      p.x += (p.vx + WIND.x) * dt;
      p.y += (p.vy + WIND.y) * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
    }
    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - 4 * dt;
      d.vy *= 1 - 4 * dt;
    }

    const alive = <T extends { t0: number; dur: number }>(arr: T[]) => arr.filter((p) => now - p.t0 < p.dur);
    this.puffs = alive(this.puffs);
    this.flashes = alive(this.flashes);
    this.streaks = alive(this.streaks);
    this.rings = alive(this.rings);
    this.debris = alive(this.debris);

    const total = this.puffs.length + this.debris.length;
    if (total > MAX_PARTICLES) this.puffs.splice(0, total - MAX_PARTICLES);
  }

  // ------------------------------------------------------------------ spawning

  private ingestImpacts(state: SimulationState, now: number) {
    if (this.seenImpacts.size > 2000) {
      this.seenImpacts.clear();
      this.landed.clear();
    }
    for (const imp of state.artilleryImpacts) {
      if (this.seenImpacts.has(imp.id)) continue;
      this.seenImpacts.add(imp.id);
      // Ignore stale impacts (initial load, timeline scrub)
      if (state.timeMinutes - imp.timeMinutes > 0.2 || imp.timeMinutes > state.timeMinutes) {
        this.landed.add(imp.id);
        continue;
      }

      const battery = imp.sourceUnitId ? state.units.find((u) => u.id === imp.sourceUnitId) : undefined;
      if (battery) {
        const dist = Math.hypot(imp.x - battery.position.x, imp.y - battery.position.y);
        const tof = 350 + dist * 1.6; // ms; longer shots fly longer
        const muzzle = this.frontOf(battery, 8);
        this.muzzleBlast(muzzle.x, muzzle.y, Math.atan2(imp.y - muzzle.y, imp.x - muzzle.x), now, true);
        this.shells.push({ t0: now, tof, impact: imp });
      } else {
        // Ricochets and secondary detonations follow the primary round
        this.pending.push({ at: now + (imp.isRicochet ? 650 + (imp.skipCount || 1) * 160 : 120), impact: imp });
      }
    }
  }

  private spawnDirectFire(state: SimulationState, now: number) {
    const speedFactor = Math.sqrt(Math.max(0.5, state.speedMultiplier));
    for (const u of state.units) {
      const firing =
        u.status === 'engaging' &&
        u.ammo > 0 &&
        !(u.type === 'artillery' && u.currentOrder?.type === 'bombard' && u.currentOrder.status === 'executing');
      if (!firing) {
        this.nextVolleyAt.delete(u.id);
        continue;
      }
      const due = this.nextVolleyAt.get(u.id);
      if (due === undefined) {
        this.nextVolleyAt.set(u.id, now + Math.random() * 600);
        continue;
      }
      if (now < due) continue;

      if (u.type === 'artillery') {
        this.directGunFire(u, now, !!u.canisterActive);
        this.nextVolleyAt.set(u.id, now + (1400 + Math.random() * 900) / speedFactor);
      } else {
        this.volley(u, now);
        this.nextVolleyAt.set(u.id, now + (700 + Math.random() * 900) / speedFactor);
      }
    }
  }

  private frontOf(u: Unit, ahead: number, lateral = 0) {
    const c = Math.cos(u.heading);
    const s = Math.sin(u.heading);
    return { x: u.position.x + c * ahead - s * lateral, y: u.position.y + s * ahead + c * lateral };
  }

  // Ripple of musket fire along the front rank, with tracers and white powder smoke
  private volley(u: Unit, now: number) {
    const frontage = u.formation === 'line' ? 30 : u.formation === 'column' ? 9 : 18;
    const depthHalf = u.formation === 'column' ? 11 : 4;
    const n = u.formation === 'line' ? 7 : 4;
    const reach = Math.min(90, (u.range || 100) * 0.85);
    for (let i = 0; i < n; i++) {
      const lat = (i / (n - 1) - 0.5) * frontage + (Math.random() - 0.5) * 2;
      const p = this.frontOf(u, depthHalf + 2, lat);
      const t = now + i * 28 + Math.random() * 40;
      const ang = u.heading + (Math.random() - 0.5) * 0.18;
      this.flashes.push({ x: p.x, y: p.y, t0: t, dur: 130, r: 2.4, rgb: '255, 200, 70' });
      const len = reach * (0.55 + Math.random() * 0.45);
      this.streaks.push({
        x0: p.x, y0: p.y,
        x1: p.x + Math.cos(ang) * len, y1: p.y + Math.sin(ang) * len,
        t0: t, dur: 220, w: 0.9, rgb: '226, 118, 22',
      });
      this.puffs.push({
        x: p.x + Math.cos(u.heading) * 2, y: p.y + Math.sin(u.heading) * 2,
        vx: Math.cos(u.heading) * 6, vy: Math.sin(u.heading) * 6,
        t0: t, dur: 3000 + Math.random() * 1600, r0: 2, r1: 8 + Math.random() * 4, a: 0.42, rgb: '146, 142, 134',
      });
    }
  }

  private directGunFire(u: Unit, now: number, canister: boolean) {
    const p = this.frontOf(u, 8, (Math.random() - 0.5) * 16);
    this.muzzleBlast(p.x, p.y, u.heading, now, false);
    if (canister) {
      for (let k = 0; k < 9; k++) {
        const ang = u.heading + (Math.random() - 0.5) * 0.5;
        const len = 45 + Math.random() * 40;
        this.streaks.push({
          x0: p.x, y0: p.y, x1: p.x + Math.cos(ang) * len, y1: p.y + Math.sin(ang) * len,
          t0: now, dur: 160, w: 0.8, rgb: '214, 120, 30',
        });
      }
    } else {
      const len = Math.min(140, (u.range || 120) * 0.6);
      this.streaks.push({
        x0: p.x, y0: p.y,
        x1: p.x + Math.cos(u.heading) * len, y1: p.y + Math.sin(u.heading) * len,
        t0: now, dur: 220, w: 1.4, rgb: '120, 80, 40',
      });
    }
  }

  private muzzleBlast(x: number, y: number, heading: number, now: number, heavy: boolean) {
    this.flashes.push({ x, y, t0: now, dur: heavy ? 160 : 120, r: heavy ? 5 : 3.5, rgb: '255, 200, 80' });
    this.rings.push({ x, y, t0: now, dur: 380, r: heavy ? 16 : 10, rgb: '120, 110, 95', w: 1 });
    for (let k = 0; k < (heavy ? 4 : 3); k++) {
      const a = heading + (Math.random() - 0.5) * 0.9;
      const sp = 10 + Math.random() * 14;
      this.puffs.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t0: now + k * 30, dur: 3800 + Math.random() * 1800, r0: 3, r1: heavy ? 13 + Math.random() * 5 : 9, a: 0.36, rgb: '140, 136, 128',
      });
    }
  }

  /** True while a round is still in the air: its crater should not be drawn yet. */
  isInFlight(id: string) {
    return this.seenImpacts.has(id) && !this.landed.has(id);
  }

  private detonate(imp: Impact, now: number) {
    this.landed.add(imp.id);
    const R = imp.radius || 30;
    if (imp.isSmoke) {
      for (let k = 0; k < 7; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * R * 0.5;
        this.puffs.push({
          x: imp.x + Math.cos(a) * d, y: imp.y + Math.sin(a) * d, vx: 0, vy: 0,
          t0: now + k * 60, dur: 9000, r0: 6, r1: R * 0.75, a: 0.3, rgb: '205, 205, 200',
        });
      }
      return;
    }

    if (imp.isRicochet) {
      const h = imp.velocityHeading ?? 0;
      for (let k = 0; k < 5; k++) {
        const a = h + (Math.random() - 0.5) * 0.8;
        const sp = 40 + Math.random() * 40;
        this.debris.push({ x: imp.x, y: imp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: now, dur: 500 });
      }
      this.puffs.push({ x: imp.x, y: imp.y, vx: Math.cos(h) * 12, vy: Math.sin(h) * 12, t0: now, dur: 2200, r0: 2, r1: 8, a: 0.32, rgb: '150, 120, 90' });
      return;
    }

    const big = imp.isCaissonDetonation ? 1.8 : imp.isGrandBattery ? 1.2 : 1;
    this.flashes.push({ x: imp.x, y: imp.y, t0: now, dur: 140, r: 7 * big, rgb: '255, 244, 200' });
    this.flashes.push({ x: imp.x, y: imp.y, t0: now, dur: 320, r: 11 * big, rgb: '232, 110, 40' });
    this.rings.push({ x: imp.x, y: imp.y, t0: now, dur: 520, r: R * 0.9 * big, rgb: '120, 60, 30', w: 1.6 });
    for (let k = 0; k < 10 * big; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 90;
      this.debris.push({ x: imp.x, y: imp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: now, dur: 450 + Math.random() * 300 });
    }
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2;
      this.puffs.push({
        x: imp.x + Math.cos(a) * 3, y: imp.y + Math.sin(a) * 3,
        vx: Math.cos(a) * 14, vy: Math.sin(a) * 14,
        t0: now + 40 + k * 50, dur: 3200 + Math.random() * 1600, r0: 4, r1: (10 + Math.random() * 6) * big, a: 0.4, rgb: '110, 90, 70',
      });
    }
  }

  // ------------------------------------------------------------------ drawing

  draw(ctx: CanvasRenderingContext2D, now: number) {
    ctx.save();

    // Smoke & dust (beneath bright effects)
    for (const p of this.puffs) {
      const t = (now - p.t0) / p.dur;
      if (t < 0) continue;
      const ease = 1 - Math.pow(1 - t, 2);
      const r = p.r0 + (p.r1 - p.r0) * ease;
      const a = p.a * (t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92);
      ctx.fillStyle = `rgba(${p.rgb}, ${a * 0.55})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Debris
    ctx.fillStyle = 'rgba(70, 50, 35, 0.85)';
    for (const d of this.debris) {
      const t = (now - d.t0) / d.dur;
      if (t < 0) continue;
      ctx.globalAlpha = 1 - t;
      ctx.fillRect(d.x - 0.8, d.y - 0.8, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    // Shockwave / blast rings
    for (const r of this.rings) {
      const t = (now - r.t0) / r.dur;
      if (t < 0) continue;
      ctx.strokeStyle = `rgba(${r.rgb}, ${0.55 * (1 - t)})`;
      ctx.lineWidth = r.w * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.25 + 0.75 * (1 - Math.pow(1 - t, 3))), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Tracers: a short bright segment travelling along the line of fire
    ctx.lineCap = 'round';
    for (const s of this.streaks) {
      const t = (now - s.t0) / s.dur;
      if (t < 0) continue;
      const head = Math.min(1, t * 1.25);
      const tail = Math.max(0, head - 0.35);
      ctx.strokeStyle = `rgba(${s.rgb}, ${0.9 * (1 - t * 0.5)})`;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.x0 + (s.x1 - s.x0) * tail, s.y0 + (s.y1 - s.y0) * tail);
      ctx.lineTo(s.x0 + (s.x1 - s.x0) * head, s.y0 + (s.y1 - s.y0) * head);
      ctx.stroke();
    }

    // Flashes on top
    for (const f of this.flashes) {
      const t = (now - f.t0) / f.dur;
      if (t < 0) continue;
      ctx.fillStyle = `rgba(${f.rgb}, ${1 - t})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.6 + 0.4 * t), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  clear() {
    this.puffs = [];
    this.flashes = [];
    this.streaks = [];
    this.rings = [];
    this.debris = [];
    this.shells = [];
    this.pending = [];
    this.nextVolleyAt.clear();
  }
}
