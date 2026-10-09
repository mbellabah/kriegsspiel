import { Unit, ManeuverOrder, Vector2D, OperationalGraphic, TroopFilterType, TargetReferencePoint, Faction, EnemyIntel, ERA_WEAPON_PROFILES } from '../types/game';
import { SimulationState, BattleEngine, ENEMY_INTEL_MAX_AGE } from './simulation';
import { GZD, SQUARE, eastingKm, northingKm } from './grid';
import { SETTLEMENTS, HEIGHTS } from '../data/gazetteer';
import {
  MAP,
  FONT,
  font,
  haloText,
  drawUnitSymbol,
  tracePathFrame,
  frameExtents,
  combatEffectiveness,
  conditionColor,
  designationFor,
  higherFormationFor,
  DIAMOND_R,
  FRAME_W,
  SymbolIdentity,
} from './natoSymbols';

export interface SmokeParticle {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  maxAlpha: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  isBlackpowder?: boolean;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  rotation?: number; // Camera rotation in radians (0 = North up)
}

export interface DraftingManeuver {
  startUnit: Unit;
  currentTarget: Vector2D;
  waypoints?: Vector2D[];
  curveOffset?: number; // Perpendicular bend
  curveControl?: Vector2D;
  finalHeading?: number;
  dragStartPoint?: Vector2D; // Initial right-click location for arraying
  targetUnitId?: string;
  selectedUnits?: Unit[]; // All units included in a multi-unit formation drag
  isFreehandPath?: boolean; // User holding Option/Alt to draw exact path
}

export class SandtableRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _engine?: BattleEngine;
  public get engine(): BattleEngine | undefined {
    return this._engine;
  }
  public set engine(eng: BattleEngine | undefined) {
    if (this._engine !== eng) {
      this._engine = eng;
      this.cachedIndexContours = null;
      this.cachedBaseMapCanvas = null;
    }
  }

  private smokeParticles: SmokeParticle[] = [];
  private animFrame: number = 0;
  private zoom: number = 1;
  public showRangeRings: boolean = false;
  public showCorpsOverlay: boolean = false;
  public hoveredCorps: string | null = null;
  public hoveredTrpId: string | null = null;
  public draggingTrpId: string | null = null;
  public targetingState: { active: boolean; batteryUnitId?: string; currentMousePos?: Vector2D } = { active: false };
  public showArtilleryKillzones: boolean = true;
  public showLineOfSight: boolean = true;
  private viewshed: { key: string; canvas: HTMLCanvasElement; x: number; y: number; r: number } | null = null;
  private _showTopography: boolean = true;
  public get showTopography(): boolean {
    return this._showTopography;
  }
  public set showTopography(val: boolean) {
    if (this._showTopography !== val) {
      this._showTopography = val;
      this.cachedBaseMapCanvas = null;
    }
  }
  public symbology: 'tactical' | 'nato' = 'nato';
  public activeFilter: TroopFilterType = 'all';
  public mapTheme: 'classic' | 'dark' | 'slate' = 'classic';
  private fowCanvas: HTMLCanvasElement | null = null;
  private fowCtx: CanvasRenderingContext2D | null = null;
  private cachedIntermediateContours: Path2D | null = null;
  private cachedIndexContours: Path2D | null = null;
  private cachedContourLabels: { x: number; y: number; angle: number; level: number }[] = [];
  private cachedBaseMapCanvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;

    // Canvas text is rasterised into the cached base map once; redraw it when web fonts arrive
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        this.cachedBaseMapCanvas = null;
      });
    }
  }

  public render(
    state: SimulationState,
    camera: Camera,
    drawingOrder: DraftingManeuver | null,
    hoveredUnitId: string | null
  ) {
    const { ctx, canvas } = this;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.animFrame++;
    this.zoom = camera.zoom > 0 ? camera.zoom : 1;

    // Ensure physical canvas backing store matches CSS dimensions * DPR (avoids getBoundingClientRect layout thrashing)
    const cssW = canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 2400);
    const cssH = canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 1500);
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply HiDPI scale
    ctx.scale(dpr, dpr);

    // High quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Camera Transform (Centered) - integer snapped to prevent fractional subpixel blur
    const screenW = canvas.width / dpr;
    const screenH = canvas.height / dpr;
    ctx.translate(Math.round(screenW / 2), Math.round(screenH / 2));
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // =========================================================================
    // WEST POINT MILITARY ATLAS / NAPOLEON-EMPIRE 1805 AUSTERLITZ CARTOGRAPHY
    // =========================================================================

    // 1. Base Map Paper Background (Clean outer void fill beyond 2400x1500)
    ctx.fillStyle = '#e6e6e2';
    ctx.fillRect(-2000, -2000, 6400, 5500);

    // 2. Pre-rendered Master Cartography (Instant GPU texture blit)
    this.initBaseMapCache();
    if (this.cachedBaseMapCanvas) {
      ctx.drawImage(this.cachedBaseMapCanvas, 0, 0, 2400, 1500);
    }

    // 1 km grid, drawn live so it stays a crisp 1 px line at every zoom
    ctx.save();
    ctx.strokeStyle = MAP.grid;
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let gx = 200; gx < 2400; gx += 200) {
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, 1500);
    }
    for (let gy = 200; gy < 1500; gy += 200) {
      ctx.moveTo(0, gy);
      ctx.lineTo(2400, gy);
    }
    ctx.stroke();
    ctx.restore();

    // 2.5 Dynamic Shattered Ice Cracks (Artillery impacts on Satschan Pond)
    if (state.iceCracks && state.iceCracks.length > 0) {
      ctx.save();
      ctx.scale(1.5, 1.5);
      this.renderDynamicIceCracks(ctx, state);
      ctx.restore();
    }

    // 6.5 Dynamic Terrain (Trenches/Fieldworks)
    this.renderDynamicTerrain(ctx, state);



    // 8.5 NATO Operational Graphics & Control Measures (Phase Lines, OBJs, FSCL, TRPs)
    if (state.showOperationalGraphics) {
      if (state.operationalGraphics) {
        this.renderOperationalGraphics(ctx, state.operationalGraphics, state.playerFaction);
      }
      if (state.targetReferencePoints) {
        this.renderTargetReferencePoints(ctx, state.targetReferencePoints);
      }
    }


    // 10. Active Orders & User Maneuver Caliper
    this.renderActiveOrders(ctx, state.activeOrders, state.units, state.playerFaction);
    if (drawingOrder) {
      this.renderDraftingArrow(ctx, drawingOrder);
    }

    // 10.5 Line of sight from the selected unit (dead ground shaded)
    if (this.showLineOfSight) this.renderLineOfSight(ctx, state);

    // 11. Weapon Range Rings (Musket & Artillery CFF) & Active Targeting Overlay
    this.renderWeaponRanges(ctx, state, hoveredUnitId);

    // 11.5 Tactical Fog of War Reconnaissance Shroud
    if (state.fogOfWarEnabled) {
      this.renderFogOfWarShroud(ctx, state);
    }

    // 11.8 Corps highlight (hover in the order of battle)
    this.renderCorpsOverlay(ctx, state);

    // 12. Military Unit Chits (Royal Blue French vs Red Allied)
    this.renderMilitaryUnits(ctx, state, hoveredUnitId);

    // 12.5 Artillery Impacts (CFF Explosions)
    this.renderArtilleryImpacts(ctx, state);

    // 13. Gunpowder smoke, muzzle flashes and tracers
    this.updateAndRenderEffects(ctx, state);

    ctx.restore();

    ctx.save();
    ctx.scale(dpr, dpr);
    this.renderGridEdgeLabels(ctx, camera, screenW, screenH);
    this.renderMapFurniture(ctx, screenH);
    ctx.restore();
  }

  private renderDynamicTerrain(ctx: CanvasRenderingContext2D, state: SimulationState) {
    ctx.save();
    for (const feature of state.terrain) {
      if (feature.type === 'trench') {
        // Draw jagged zigzag line for fieldworks
        const cx = feature.center.x;
        const cy = feature.center.y;
        
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        
        // Simple zigzag across 30px width
        ctx.moveTo(cx - 15, cy - 5);
        ctx.lineTo(cx - 5, cy + 5);
        ctx.lineTo(cx + 5, cy - 5);
        ctx.lineTo(cx + 15, cy + 5);
        
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private computeArtilleryKillzoneMetrics(
    state: SimulationState,
    battery: Unit,
    dest: Vector2D,
    observerUnitId?: string,
    isSmokeMission?: boolean
  ) {
    const dx = dest.x - battery.position.x;
    const dy = dest.y - battery.position.y;
    const dist = Math.hypot(dx, dy);
    const heading = Math.atan2(dy, dx);

    const hasTRP = !!state.targetReferencePoints?.some(
      (t) => Math.hypot(t.position.x - dest.x, t.position.y - dest.y) <= 30
    );
    const trpDiscount = hasTRP ? 0.35 : 1.0;

    let hasFO = false;
    if (observerUnitId) {
      const obs = state.units.find((u) => u.id === observerUnitId);
      if (obs && obs.status !== 'shattered') {
        const obsDist = Math.hypot(obs.position.x - dest.x, obs.position.y - dest.y);
        if (obsDist <= (obs.range || 100) * 1.5) {
          hasFO = true;
        }
      }
    }
    const foDiscount = hasFO ? 0.25 : 1.0;

    const blastRadius = isSmokeMission ? 48 : 32; // 32px ~ 160m lethal radius
    const scatterRadius = Math.max(6, (10 + dist * 0.16) * trpDiscount * foDiscount);
    const totalKillzoneRadius = scatterRadius + blastRadius;

    const destElev = this.engine ? this.engine.getElevation(dest) : 200;
    const terrain = this.engine ? this.engine.getTerrainAt(dest) : undefined;
    const isWaterOrMarsh = destElev <= 180 || terrain?.type === 'lake' || terrain?.type === 'marsh';
    const isSolidRoundShot = (state.era || 'napoleonic') === 'napoleonic' || (state.era || 'napoleonic') === 'blackpowder';
    const canRicochet = isSolidRoundShot && !isWaterOrMarsh && destElev >= 190 && !isSmokeMission;

    // Check friendly threats in killzone
    const friendlyThreats: Unit[] = [];
    for (const u of state.units) {
      if (u.faction === battery.faction && u.status !== 'shattered' && u.id !== battery.id) {
        const d = Math.hypot(u.position.x - dest.x, u.position.y - dest.y);
        if (d <= totalKillzoneRadius) {
          friendlyThreats.push(u);
        } else if (canRicochet) {
          const fdx = u.position.x - dest.x;
          const fdy = u.position.y - dest.y;
          const forward = fdx * Math.cos(heading) + fdy * Math.sin(heading);
          const lateral = Math.abs(-fdx * Math.sin(heading) + fdy * Math.cos(heading));
          if (forward > 0 && forward <= 65 && lateral <= 24) {
            friendlyThreats.push(u);
          }
        }
      }
    }

    // Check enemy targets in killzone
    const enemyTargets: Unit[] = [];
    for (const u of state.units) {
      if (u.faction !== battery.faction && u.status !== 'shattered') {
        const d = Math.hypot(u.position.x - dest.x, u.position.y - dest.y);
        if (d <= totalKillzoneRadius) {
          enemyTargets.push(u);
        }
      }
    }

    return {
      dist,
      heading,
      blastRadius,
      scatterRadius,
      totalKillzoneRadius,
      canRicochet,
      hasTRP,
      hasFO,
      destElev,
      friendlyThreats,
      enemyTargets,
    };
  }

  public renderArtilleryKillzoneFootprint(
    ctx: CanvasRenderingContext2D,
    state: SimulationState,
    battery: Unit,
    dest: Vector2D,
    observerUnitId?: string,
    isLiveTargeting: boolean = false,
    isSmokeMission: boolean = false
  ) {
    const m = this.computeArtilleryKillzoneMetrics(state, battery, dest, observerUnitId, isSmokeMission);
    const hazard = m.friendlyThreats.length > 0;
    const rgb = hazard ? '217, 119, 6' : battery.faction === state.playerFaction ? '11, 94, 168' : '194, 39, 45';
    const hair = 1 / this.zoom;
    const ls = this.symbolScale();

    ctx.save();
    // Gun-target line
    ctx.strokeStyle = `rgba(${rgb}, ${isLiveTargeting ? 0.8 : 0.45})`;
    ctx.lineWidth = hair;
    ctx.setLineDash([5 * hair, 4 * hair]);
    ctx.beginPath();
    ctx.moveTo(battery.position.x, battery.position.y);
    ctx.lineTo(dest.x, dest.y);
    ctx.stroke();

    // Target area (dispersion + burst) and burst radius
    ctx.fillStyle = `rgba(${rgb}, ${isLiveTargeting ? 0.08 : 0.05})`;
    ctx.beginPath();
    ctx.arc(dest.x, dest.y, m.totalKillzoneRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${rgb}, 0.7)`;
    ctx.beginPath();
    ctx.arc(dest.x, dest.y, m.blastRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Aim point
    ctx.beginPath();
    ctx.moveTo(dest.x - 5 * hair, dest.y);
    ctx.lineTo(dest.x + 5 * hair, dest.y);
    ctx.moveTo(dest.x, dest.y - 5 * hair);
    ctx.lineTo(dest.x, dest.y + 5 * hair);
    ctx.stroke();

    // Ricochet danger for solid shot on firm ground
    if (m.canRicochet) {
      ctx.save();
      ctx.translate(dest.x, dest.y);
      ctx.rotate(m.heading);
      ctx.strokeStyle = `rgba(${rgb}, 0.4)`;
      ctx.setLineDash([3 * hair, 3 * hair]);
      ctx.beginPath();
      ctx.moveTo(m.blastRadius * 0.8, -m.blastRadius * 0.5);
      ctx.lineTo(m.blastRadius + 60, -12);
      ctx.moveTo(m.blastRadius * 0.8, m.blastRadius * 0.5);
      ctx.lineTo(m.blastRadius + 60, 12);
      ctx.stroke();
      ctx.restore();
    }

    if (isLiveTargeting || hazard) {
      ctx.font = font(600, 7 * ls);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = hazard
        ? `Friendly units in target area (${m.friendlyThreats.length})`
        : `${isSmokeMission ? 'Smoke' : 'Fire mission'} · ${Math.round(m.dist * 5).toLocaleString()} m · ±${Math.round(m.scatterRadius * 5)} m${m.hasFO ? ' · observed' : ''}`;
      haloText(ctx, label, dest.x, dest.y - m.totalKillzoneRadius - 3 * hair, `rgb(${rgb})`, 2.6 * ls);
    }
    ctx.restore();
  }

  private renderArtilleryImpacts(ctx: CanvasRenderingContext2D, state: SimulationState) {
    ctx.save();

    // 1. ACTIVE ARTILLERY BOMBARDMENT KILLZONES
    if (this.showArtilleryKillzones) {
      const activeBombards = state.activeOrders.filter((o) => {
        if (o.type !== 'bombard' || o.status !== 'executing') return false;
        const u = state.units.find((unit) => unit.id === o.unitId);
        return u && u.status !== 'shattered' && u.strength > 0;
      });

      for (const order of activeBombards) {
        const battery = state.units.find((u) => u.id === order.unitId);
        if (!battery || battery.faction !== state.playerFaction) continue;
        this.renderArtilleryKillzoneFootprint(
          ctx,
          state,
          battery,
          order.destination,
          order.observerUnitId,
          false,
          order.isSmokeMission
        );
      }
    }

    // 2. CLEAN NATO BALLISTIC ARTILLERY IMPACT SYMBOLOGY & PERSISTENT CRATERS
    for (const impact of state.artilleryImpacts) {
      const age = state.timeMinutes - impact.timeMinutes;
      if (age > 1.2 || age < 0) continue;

      ctx.save();
      ctx.translate(impact.x, impact.y);

      // Phase 1: Active Detonation (first 0.25 battle minutes / 15 seconds)
      if (age <= 0.25) {
        const progress = age / 0.25; // 0 to 1

        if (impact.isSmoke) {
          // Tactical Smoke Screen Billow
          const smokeRadius = impact.radius * (0.35 + progress * 0.75);
          ctx.fillStyle = `rgba(226, 232, 240, ${Math.max(0, 0.40 * (1 - progress * 0.6))})`;
          ctx.beginPath();
          ctx.arc(0, 0, smokeRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = `rgba(148, 163, 184, ${Math.max(0, 0.65 * (1 - progress))})`;
          ctx.lineWidth = 1.0;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, smokeRadius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.font = 'bold 7px Arial, sans-serif';
          ctx.fillStyle = '#475569';
          ctx.textAlign = 'center';
          ctx.fillText('SMOKE SCREEN', 0, -smokeRadius - 3);
          ctx.restore();
          continue;
        }

        if (impact.isRicochet) {
          // Grazing ricochet impact (solid shot skipping across plateau)
          if (impact.velocityHeading !== undefined) {
            ctx.save();
            ctx.rotate(impact.velocityHeading);
            ctx.fillStyle = `rgba(180, 83, 9, ${Math.max(0, 0.50 * (1 - progress))})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, impact.radius * 0.9, impact.radius * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          const skipRadius = impact.radius * (0.3 + progress * 0.7);
          ctx.strokeStyle = `rgba(245, 158, 11, ${Math.max(0, 0.85 * (1 - progress))})`;
          ctx.lineWidth = Math.max(0.6, 1.4 * (1 - progress));
          ctx.beginPath();
          ctx.arc(0, 0, skipRadius, 0, Math.PI * 2);
          ctx.stroke();

          // Dust spray
          ctx.fillStyle = `rgba(217, 119, 6, ${Math.max(0, 0.75 * (1 - progress))})`;
          for (let s = 0; s < 8; s++) {
            const spAng = (impact.velocityHeading || 0) + (s - 3.5) * 0.22;
            const spDist = skipRadius * (0.5 + (s % 3) * 0.25);
            ctx.beginPath();
            ctx.arc(Math.cos(spAng) * spDist, Math.sin(spAng) * spDist, 1.1, 0, Math.PI * 2);
            ctx.fill();
          }

          if (progress < 0.5) {
            const tagAlpha = 1 - progress / 0.5;
            ctx.font = 'bold 6px "Courier New", monospace';
            ctx.fillStyle = `rgba(217, 119, 6, ${0.9 * tagAlpha})`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`RICOCHET #${impact.skipCount || 1} (GRAZE)`, 0, -skipRadius - 2);
          }

          ctx.restore();
          continue;
        }

        // Primary Expanding Shockwave
        const shockRadius = impact.radius * (0.2 + progress * 0.9);
        ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, 0.85 * (1 - progress))})`;
        ctx.lineWidth = Math.max(0.8, 1.8 * (1 - progress));
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(0, 0, shockRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary Concentric Echo Ring
        const innerEchoRadius = shockRadius * 0.55;
        ctx.strokeStyle = `rgba(245, 158, 11, ${Math.max(0, 0.65 * (1 - progress))})`;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, innerEchoRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Epicenter Flash
        if (progress < 0.3) {
          const flashAlpha = 1 - progress / 0.3;
          ctx.strokeStyle = `rgba(255, 255, 255, ${flashAlpha})`;
          ctx.lineWidth = 1.2;
          const crossLen = 6;
          ctx.beginPath();
          ctx.moveTo(-crossLen, 0); ctx.lineTo(crossLen, 0);
          ctx.moveTo(0, -crossLen); ctx.lineTo(0, crossLen);
          ctx.stroke();

          ctx.fillStyle = `rgba(254, 240, 138, ${flashAlpha})`;
          ctx.beginPath();
          ctx.arc(0, 0, 2.0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Shrapnel Dispersion Dots
        ctx.fillStyle = `rgba(180, 83, 9, ${Math.max(0, 0.75 * (1 - progress))})`;
        for (let s = 0; s < 12; s++) {
          const ang = s * 2.39996;
          const d = shockRadius * (0.3 + (s % 4) * 0.16);
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, 1.0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Caisson Detonation Violent Fiery Ring
        if (impact.isCaissonDetonation) {
          ctx.save();
          ctx.strokeStyle = `rgba(234, 88, 12, ${Math.max(0, 0.9 * (1 - progress))})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, shockRadius * 1.35, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Micro Tag
        if (progress < 0.5) {
          const tagAlpha = 1 - progress / 0.5;
          ctx.font = 'bold 6.5px "Courier New", monospace';
          ctx.fillStyle = impact.isCaissonDetonation
            ? `rgba(234, 88, 12, ${tagAlpha})`
            : impact.isGrandBattery
            ? `rgba(185, 28, 28, ${tagAlpha})`
            : `rgba(220, 38, 38, ${0.9 * tagAlpha})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          const label = impact.isCaissonDetonation
            ? '⚡ CAISSON DETONATION'
            : impact.isGrandBattery
            ? 'MASSED TOT BARRAGE'
            : impact.isCounterBattery
            ? 'COUNTER-BATTERY HIT'
            : 'IMP SALVO';
          ctx.fillText(label, 0, -shockRadius - 3);
        }

        // Blackpowder cordite mist
        if (progress > 0.1) {
          const mistProgress = (progress - 0.1) / 0.9;
          const mistAlpha = Math.max(0, 0.16 * (1 - mistProgress));
          const mistRadius = impact.radius * (0.35 + mistProgress * 0.45);
          ctx.fillStyle = `rgba(240, 240, 245, ${mistAlpha})`;
          ctx.beginPath();
          ctx.arc(0, -mistProgress * 4, mistRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Phase 2: Persistent Scorched Crater & Churned Ground (0.25 to 1.2 minutes)
        // Visually reveals where artillery shells and explosives have been landing!
        const fade = Math.max(0, 1 - (age - 0.25) / 0.95);

        if (impact.isSmoke) {
          // Dissipating smoke haze
          const smokeRadius = impact.radius * (0.75 + (1 - fade) * 0.35);
          ctx.fillStyle = `rgba(226, 232, 240, ${0.12 * fade})`;
          ctx.beginPath();
          ctx.arc(0, 0, smokeRadius, 0, Math.PI * 2);
          ctx.fill();
        } else if (impact.isRicochet) {
          // Skid furrow gouge
          if (impact.velocityHeading !== undefined) {
            ctx.save();
            ctx.rotate(impact.velocityHeading);
            ctx.fillStyle = `rgba(78, 52, 46, ${0.35 * fade})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, impact.radius * 0.7, impact.radius * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } else {
          // Blackened explosive crater pit
          const craterRadius = Math.max(2.5, impact.radius * 0.26);

          // Outer scorched dirt halo
          ctx.fillStyle = `rgba(24, 18, 12, ${0.35 * fade})`;
          ctx.beginPath();
          ctx.arc(0, 0, craterRadius * 1.5, 0, Math.PI * 2);
          ctx.fill();

          // Dark crater pit
          ctx.fillStyle = `rgba(12, 10, 8, ${0.55 * fade})`;
          ctx.beginPath();
          ctx.arc(0, 0, craterRadius, 0, Math.PI * 2);
          ctx.fill();

          // Jagged crater lip
          ctx.strokeStyle = `rgba(55, 40, 25, ${0.40 * fade})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // Faint ember speckle during early crater phase
          if (age < 0.6) {
            const emberFade = (1 - (age - 0.25) / 0.35);
            ctx.fillStyle = `rgba(217, 119, 6, ${0.45 * emberFade})`;
            ctx.beginPath();
            ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();
    }
    ctx.restore();
  }

  // =========================================================================
  // DYNAMIC ARTILLERY SHATTERED ICE CRACKS
  // =========================================================================
  private renderDynamicIceCracks(ctx: CanvasRenderingContext2D, state: SimulationState) {
    if (!state?.iceCracks || state.iceCracks.length === 0) return;
    ctx.save();
    for (const crack of state.iceCracks) {
      const cx = crack.x / 1.5;
      const cy = crack.y / 1.5;
      const cr = (crack.radius || 30) / 1.5;

      // Dark freezing water hole
      ctx.fillStyle = '#090d16';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const r = cr * (0.5 + (Math.sin(a * 3) * 0.2 + 0.3));
        const jx = cx + Math.cos(a) * r;
        const jy = cy + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(jx, jy);
        else ctx.lineTo(jx, jy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Radiating spiderweb fracture needles
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 0.75;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (cr * 0.4), cy + Math.sin(a) * (cr * 0.4));
        ctx.lineTo(cx + Math.cos(a) * (cr * 1.5), cy + Math.sin(a) * (cr * 1.5));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private renderBaseParchment(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = MAP.paper;
    ctx.fillRect(0, 0, 2400, 1500);
  }

  // Sheet neatline (the 1 km grid itself is drawn live each frame)
  private renderNeatline(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = MAP.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, 2398.5, 1498.5);
    ctx.restore();
  }

  // =========================================================================
  // MASTER BASE MAP CACHE
  // Static cartography is rasterised once at 2x into an offscreen canvas so it stays crisp
  // when zoomed and costs a single drawImage per frame.
  // =========================================================================
  private static readonly BASE_SCALE = 2;

  private initBaseMapCache() {
    if (this.cachedBaseMapCanvas || typeof document === 'undefined') return;

    const K = SandtableRenderer.BASE_SCALE;
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = 2400 * K;
    baseCanvas.height = 1500 * K;
    const bCtx = baseCanvas.getContext('2d');
    if (!bCtx) return;

    bCtx.imageSmoothingEnabled = true;
    bCtx.imageSmoothingQuality = 'high';
    bCtx.scale(K, K);

    this.renderBaseParchment(bCtx);

    // Legacy cartography is authored in 1600x1000 space
    bCtx.save();
    bCtx.scale(1.5, 1.5);
    this.renderReliefAndContours(bCtx);
    this.renderWoodlands(bCtx);
    this.renderHistoricalTerrainFeatures(bCtx);
    this.renderHydrology(bCtx);
    this.renderRoads(bCtx);
    this.renderSettlements(bCtx);
    this.renderSpotHeights(bCtx);
    bCtx.restore();

    this.renderNeatline(bCtx);

    this.cachedBaseMapCanvas = baseCanvas;
  }

  // =========================================================================
  // RELIEF: analytic hillshade + hypsometric tint + 10m contours (index every 50m)
  // =========================================================================
  private initTopographyCache() {
    if (this.cachedIndexContours || typeof document === 'undefined' || !this.engine) return;
    const engine = this.engine;

    // Sample grid over the 1600x1000 cartography space (2px per sample)
    const W = 800;
    const H = 500;
    const dx = 1600 / (W - 1);
    const dy = 1000 / (H - 1);

    const raw = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        raw[j * W + i] = engine.getElevationSmooth({ x: i * dx * 1.5, y: j * dy * 1.5 });
      }
    }

    // Light separable box blur softens seams where the analytic landforms blend
    const z = raw.slice();
    const tmp = new Float32Array(W * H);
    const R = 2;
    for (let pass = 0; pass < 1; pass++) {
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          let sum = 0, n = 0;
          for (let u = -R; u <= R; u++) {
            const ii = i + u;
            if (ii < 0 || ii >= W) continue;
            sum += z[j * W + ii];
            n++;
          }
          tmp[j * W + i] = sum / n;
        }
      }
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          let sum = 0, n = 0;
          for (let v = -R; v <= R; v++) {
            const jj = j + v;
            if (jj < 0 || jj >= H) continue;
            sum += tmp[jj * W + i];
            n++;
          }
          z[j * W + i] = sum / n;
        }
      }
    }

    // Marching squares contours
    const interPath = new Path2D();
    const indexPath = new Path2D();
    const labelCandidates: { x: number; y: number; angle: number; level: number }[] = [];
    const levels: number[] = [];
    for (let v = 180; v <= 320; v += 10) levels.push(v);

    for (let j = 0; j < H - 1; j++) {
      const y0 = j * dy;
      const y1 = y0 + dy;
      for (let i = 0; i < W - 1; i++) {
        const x0 = i * dx;
        const x1 = x0 + dx;
        const z00 = z[j * W + i];
        const z10 = z[j * W + i + 1];
        const z11 = z[(j + 1) * W + i + 1];
        const z01 = z[(j + 1) * W + i];
        const lo = Math.min(z00, z10, z11, z01);
        const hi = Math.max(z00, z10, z11, z01);

        for (const v of levels) {
          if (v < lo || v > hi) continue;
          const mask = (z00 >= v ? 1 : 0) | (z10 >= v ? 2 : 0) | (z11 >= v ? 4 : 0) | (z01 >= v ? 8 : 0);
          if (mask === 0 || mask === 15) continue;
          const isIndex = v % 50 === 0;
          const p = isIndex ? indexPath : interPath;

          const xTop = x0 + ((v - z00) / (z10 - z00 || 1e-6)) * dx;
          const yRight = y0 + ((v - z10) / (z11 - z10 || 1e-6)) * dy;
          const xBottom = x0 + ((v - z01) / (z11 - z01 || 1e-6)) * dx;
          const yLeft = y0 + ((v - z00) / (z01 - z00 || 1e-6)) * dy;

          let ax = 0, ay = 0, bx = 0, by = 0;
          switch (mask) {
            case 1: case 14: ax = x0; ay = yLeft; bx = xTop; by = y0; break;
            case 2: case 13: ax = xTop; ay = y0; bx = x1; by = yRight; break;
            case 4: case 11: ax = x1; ay = yRight; bx = xBottom; by = y1; break;
            case 8: case 7: ax = xBottom; ay = y1; bx = x0; by = yLeft; break;
            case 3: case 12: ax = x0; ay = yLeft; bx = x1; by = yRight; break;
            case 6: case 9: ax = xTop; ay = y0; bx = xBottom; by = y1; break;
            case 5:
              p.moveTo(x0, yLeft); p.lineTo(xTop, y0);
              ax = xBottom; ay = y1; bx = x1; by = yRight; break;
            case 10:
              p.moveTo(xTop, y0); p.lineTo(x1, yRight);
              ax = x0; ay = yLeft; bx = xBottom; by = y1; break;
          }
          p.moveTo(ax, ay);
          p.lineTo(bx, by);

          if (isIndex && (i + j) % 7 === 0) {
            labelCandidates.push({ x: (ax + bx) / 2, y: (ay + by) / 2, angle: Math.atan2(by - ay, bx - ax), level: v });
          }
        }
      }
    }

    // Greedy label placement: spread index-contour labels, away from edges and each other
    const chosen: { x: number; y: number; angle: number; level: number }[] = [];
    for (const c of labelCandidates) {
      if (c.x < 60 || c.x > 1540 || c.y < 50 || c.y > 950) continue;
      let ok = true;
      for (const o of chosen) {
        const d = Math.hypot(o.x - c.x, o.y - c.y);
        if (d < 70 || (o.level === c.level && d < 230)) { ok = false; break; }
      }
      if (ok) chosen.push(c);
      if (chosen.length >= 28) break;
    }

    this.cachedIntermediateContours = interPath;
    this.cachedIndexContours = indexPath;
    this.cachedContourLabels = chosen;
  }

  private renderReliefAndContours(ctx: CanvasRenderingContext2D) {
    if (!this.showTopography) return;
    this.initTopographyCache();

    ctx.save();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.cachedIntermediateContours) {
      ctx.strokeStyle = MAP.contour;
      ctx.lineWidth = 0.7;
      ctx.stroke(this.cachedIntermediateContours);
    }
    if (this.cachedIndexContours) {
      ctx.strokeStyle = MAP.contourIndex;
      ctx.lineWidth = 1.25;
      ctx.stroke(this.cachedIndexContours);
    }

    // Index contour values, set along the line and kept upright
    ctx.font = font(500, 6.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.cachedContourLabels) {
      let a = l.angle;
      if (a > Math.PI / 2) a -= Math.PI;
      if (a < -Math.PI / 2) a += Math.PI;
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(a);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(251, 251, 248, 0.95)';
      ctx.lineWidth = 3;
      ctx.strokeText(String(l.level), 0, 0);
      ctx.fillStyle = MAP.contourLabel;
      ctx.fillText(String(l.level), 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // Named spot heights (triangulation points)
  private renderSpotHeights(ctx: CanvasRenderingContext2D) {
    const spots = HEIGHTS;
    ctx.save();
    for (const sp of spots) {
      ctx.fillStyle = MAP.ink;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - 3.2);
      ctx.lineTo(sp.x + 3, sp.y + 2);
      ctx.lineTo(sp.x - 3, sp.y + 2);
      ctx.closePath();
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(500, 6.5, FONT.carto, true);
      haloText(ctx, sp.name, sp.x + 5, sp.y - 1, '#44403c', 2.4);
      ctx.font = font(500, 6.5);
      haloText(ctx, String(sp.elev), sp.x + 5, sp.y + 7, MAP.contourLabel, 2.2);
    }
    ctx.restore();
  }

    // =========================================================================
  // HISTORICAL TERRAIN FEATURES & FORTIFIED REDOUBTS
  // =========================================================================
  private renderHistoricalTerrainFeatures(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Santon redoubt: earthwork line with ticks on the outer (enemy) face
    ctx.save();
    ctx.translate(890, 155);
    ctx.strokeStyle = MAP.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 20, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let a = Math.PI * 0.85; a <= Math.PI * 2.15; a += 0.18) {
      ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
      ctx.lineTo(Math.cos(a) * 23.5, Math.sin(a) * 23.5);
    }
    ctx.stroke();
    ctx.font = font(500, 6, FONT.label, true);
    ctx.textAlign = 'center';
    haloText(ctx, 'Redoubt', 0, -27, MAP.inkMuted, 2);
    ctx.restore();

    // Sokolnitz pheasantry: walled enclosure with the manor house
    ctx.strokeStyle = MAP.ink;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(645, 645, 66, 54);
    ctx.fillStyle = MAP.building;
    ctx.fillRect(659, 657, 14, 9);

    // Gullies (Puntowitz, Kobelnitz)
    ctx.strokeStyle = 'rgba(150, 85, 35, 0.75)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(840, 470);
    ctx.bezierCurveTo(790, 465, 735, 450, 685, 440);
    ctx.moveTo(835, 590);
    ctx.bezierCurveTo(780, 570, 735, 535, 695, 500);
    ctx.stroke();

    ctx.restore();
  }


  // =========================================================================
  // 3. WOODLANDS & FORESTS (NATO STANAG 3677 Organic Canopy & Military Tint)
  // =========================================================================
  private renderWoodlands(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Helper: Render organic woodland polygon with natural scalloped treeline canopy
    const drawScallopedForest = (
      pts: Array<{ x: number; y: number }>,
      fillColor: string = 'rgba(138, 176, 130, 0.42)',
      strokeColor: string = '#2d5a27',
      isWalled: boolean = false
    ) => {
      if (pts.length < 3) return;

      ctx.beginPath();
      if (isWalled) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
      } else {
        for (let i = 0; i < pts.length; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % pts.length];
          const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const steps = Math.max(3, Math.round(dist / 11));
          const nx = -(p2.y - p1.y) / dist;
          const ny = (p2.x - p1.x) / dist;

          for (let s = 0; s < steps; s++) {
            const tA = s / steps;
            const tB = (s + 1) / steps;
            const ax = p1.x + tA * (p2.x - p1.x);
            const ay = p1.y + tA * (p2.y - p1.y);
            const bx = p1.x + tB * (p2.x - p1.x);
            const by = p1.y + tB * (p2.y - p1.y);
            const midX = (ax + bx) / 2 + nx * 2.2;
            const midY = (ay + by) / 2 + ny * 2.2;

            if (s === 0 && i === 0) ctx.moveTo(ax, ay);
            ctx.quadraticCurveTo(midX, midY, bx, by);
          }
        }
        ctx.closePath();
      }

      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    };

    // 1. Historical Woodland Parcels
    const forestParcels = [
      {
        name: 'BOSENITZ WOODS',
        label: '[WOODS] BOSENITZ',
        labelPos: { x: 770, y: 125 },
        points: [
          { x: 695, y: 95 }, { x: 765, y: 80 }, { x: 845, y: 90 },
          { x: 855, y: 145 }, { x: 795, y: 165 }, { x: 705, y: 155 }
        ],
        type: 'deciduous'
      },
      {
        name: 'GIRZIKOWITZ COPSE',
        label: '[WOODS] GIRZIKOWITZ',
        labelPos: { x: 845, y: 290 },
        points: [
          { x: 805, y: 260 }, { x: 875, y: 255 }, { x: 890, y: 310 }, { x: 820, y: 320 }
        ],
        type: 'deciduous'
      },
      {
        name: 'KOBELNITZ SCARP WOODS',
        label: '[WOODS] KOBELNITZ',
        labelPos: { x: 705, y: 495 },
        points: [
          { x: 665, y: 455 }, { x: 725, y: 445 }, { x: 740, y: 520 }, { x: 680, y: 535 }
        ],
        type: 'mixed'
      },
      {
        name: 'SOKOLNITZ PHEASANTRY',
        label: '[GAME PRESERVE] SOKOLNITZ PHEASANTRY',
        labelPos: { x: 678, y: 708 },
        points: [
          { x: 645, y: 645 }, { x: 711, y: 645 }, { x: 711, y: 699 }, { x: 645, y: 699 }
        ],
        type: 'walled_preserve'
      },
      {
        name: 'HOSTIERADEK PINE COPSE',
        label: '[PINE COPSE] HOSTIERADEK',
        labelPos: { x: 985, y: 715 },
        points: [
          { x: 940, y: 685 }, { x: 1015, y: 675 }, { x: 1035, y: 735 }, { x: 960, y: 745 }
        ],
        type: 'coniferous'
      },
      {
        name: 'AUJEST SOUTHERN WOODS',
        label: '[WOODS] AUJEST',
        labelPos: { x: 890, y: 790 },
        points: [
          { x: 850, y: 760 }, { x: 915, y: 755 }, { x: 935, y: 815 }, { x: 865, y: 825 }
        ],
        type: 'deciduous'
      },
      {
        name: 'STARÉ VINOHRADY VINEYARDS',
        label: '[VINEYARDS] STARÉ VINOHRADY',
        labelPos: { x: 1065, y: 390 },
        points: [
          { x: 1015, y: 355 }, { x: 1095, y: 345 }, { x: 1110, y: 410 }, { x: 1030, y: 425 }
        ],
        type: 'orchard'
      },
      {
        name: 'TELNITZ WILLOW MARSH',
        label: '[WILLOW GROVE] TELNITZ',
        labelPos: { x: 615, y: 805 },
        points: [
          { x: 585, y: 770 }, { x: 635, y: 765 }, { x: 645, y: 830 }, { x: 595, y: 835 }
        ],
        type: 'willow'
      },
    ];

    for (const f of forestParcels) {
      // Flat woodland tint with a clean edge, as on 1:50,000 military sheets
      drawScallopedForest(f.points, MAP.woods, MAP.woodsEdge, true);

      if (f.type !== 'orchard') continue;
      // Vineyard / orchard symbol rows
      ctx.fillStyle = 'rgba(70, 110, 50, 0.7)';
      const minX = Math.min(...f.points.map((p) => p.x));
      const maxX = Math.max(...f.points.map((p) => p.x));
      const minY = Math.min(...f.points.map((p) => p.y));
      const maxY = Math.max(...f.points.map((p) => p.y));
      for (let sx = minX + 8; sx < maxX - 4; sx += 8) {
        for (let sy = minY + 8; sy < maxY - 4; sy += 9) {
          let inside = false;
          for (let i = 0, j = f.points.length - 1; i < f.points.length; j = i++) {
            const xi = f.points[i].x, yi = f.points[i].y;
            const xj = f.points[j].x, yj = f.points[j].y;
            const intersect = ((yi > sy) !== (yj > sy)) && (sx < (xj - xi) * (sy - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          if (inside) {
            ctx.fillRect(sx - 0.7, sy - 0.7, 1.4, 1.4);
          }
        }
      }


    }

    ctx.restore();
  }



  // =========================================================================
  // 4. HYDROLOGY (RIVERS, LAKES, MARSHES & CAUSEWAYS - NATO STANAG 3677)
  // Deep Prussian/indigo flowlines, soft hydrographic wash, frozen ponds
  // =========================================================================
  // Stroke a polyline as a smooth curve through segment midpoints
  private smoothPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
      return;
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  private renderHydrology(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const riverNavy = MAP.water;
    const riverCasing = MAP.water;
    const hydrographicFill = MAP.waterFill;

    // 1. Frozen Ponds: Satschan & Menitz Basin (174 - 176m)
    // Satschan Pond Frosted Ice Sheet (Soft hydrographic vignette & fine military casing)
    ctx.fillStyle = MAP.waterFill;
    ctx.strokeStyle = riverCasing;
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo(560, 890);
    ctx.bezierCurveTo(650, 860, 745, 875, 750, 930);
    ctx.bezierCurveTo(730, 985, 620, 1000, 545, 955);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();


    // Menitz Pond Frosted Ice Sheet
    ctx.fillStyle = MAP.waterFill;
    ctx.strokeStyle = riverCasing;
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo(765, 935);
    ctx.bezierCurveTo(835, 925, 875, 975, 850, 1000);
    ctx.lineTo(765, 1000);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mönitz Earthen Causeway (Dam defile between Satschan & Menitz Ponds)
    ctx.save();
    ctx.fillStyle = '#d7cbb5';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(746, 928);
    ctx.lineTo(764, 928);
    ctx.lineTo(764, 1000);
    ctx.lineTo(746, 1000);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Causeway slope ticks
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 0.6;
    for (let cy = 934; cy < 1000; cy += 8) {
      ctx.beginPath();
      ctx.moveTo(746, cy); ctx.lineTo(742, cy);
      ctx.moveTo(764, cy); ctx.lineTo(768, cy);
      ctx.stroke();
    }

    ctx.font = font(500, 5.5, FONT.carto, true);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(755, 975);
    ctx.rotate(-Math.PI / 2);
    haloText(ctx, 'Mönitz causeway', 0, 2, '#44403c', 2);
    ctx.restore();
    ctx.restore();

    // Lake ice labels
    ctx.font = font(500, 9, FONT.carto, true);
    ctx.textAlign = 'center';
    haloText(ctx, 'Satschan Pond', 650, 930, '#1d4f86', 2.4);
    ctx.font = font(500, 6.5, FONT.carto, true);
    haloText(ctx, '(frozen)', 650, 940, '#1d4f86', 2.2);
    ctx.font = font(500, 8, FONT.carto, true);
    haloText(ctx, 'Menitz Pond', 812, 970, '#1d4f86', 2.4);

    // 2. Mill Ponds (Puntowitz, Kobelnitz, Sokolnitz Mill Ponds)
    ctx.fillStyle = hydrographicFill;
    ctx.strokeStyle = riverNavy;
    ctx.lineWidth = 0.7;

    const millPonds = [
      { x: 700, y: 500, rx: 11, ry: 7, rot: 0.3, name: 'Puntowitz Mill' },
      { x: 690, y: 540, rx: 14, ry: 9, rot: -0.2, name: 'Kobelnitz Mill' },
      { x: 680, y: 575, rx: 12, ry: 8, rot: 0.1, name: 'Sokolnitz Mill' },
      { x: 440, y: 725, rx: 15, ry: 10, rot: -0.3, name: 'Turas Pond' },
      { x: 1260, y: 780, rx: 16, ry: 11, rot: 0.2, name: 'Birnbaum Pond' },
    ];
    for (const p of millPonds) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, p.rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 3. Rivers & Streams (NATO Flowlines with Natural Meanders)
    ctx.strokeStyle = riverNavy;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Schwarza River (Major Western Barrier - Double Cased)
    ctx.beginPath();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = riverCasing;
    ctx.moveTo(235, 0);
    ctx.bezierCurveTo(220, 145, 185, 370, 170, 565);
    ctx.bezierCurveTo(155, 725, 130, 855, 105, 1000);
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#bcd7ef';
    ctx.moveTo(235, 0);
    ctx.bezierCurveTo(220, 145, 185, 370, 170, 565);
    ctx.bezierCurveTo(155, 725, 130, 855, 105, 1000);
    ctx.stroke();

    // Goldbach Brook (Central Tactical Defense Line)
    ctx.beginPath();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = riverNavy;
    ctx.moveTo(705, 0);
    ctx.bezierCurveTo(700, 110, 680, 240, 675, 355);
    ctx.bezierCurveTo(680, 435, 715, 500, 700, 580);
    ctx.bezierCurveTo(680, 660, 630, 740, 615, 810);
    ctx.bezierCurveTo(600, 870, 570, 935, 550, 1000);
    ctx.stroke();

    // Littawa River (Eastern Boundary)
    ctx.beginPath();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = riverNavy;
    ctx.moveTo(1560, 0);
    ctx.bezierCurveTo(1530, 190, 1510, 355, 1485, 515);
    ctx.bezierCurveTo(1460, 680, 1395, 825, 1330, 1000);
    ctx.stroke();

    // Tributary Streams & Ravine Drainage
    const tributaries = [
      [{ x: 705, y: 80 }, { x: 830, y: 110 }, { x: 980, y: 105 }],
      [{ x: 175, y: 450 }, { x: 290, y: 480 }, { x: 425, y: 460 }],
      [{ x: 675, y: 355 }, { x: 590, y: 390 }, { x: 560, y: 465 }],
      [{ x: 700, y: 500 }, { x: 780, y: 490 }, { x: 860, y: 520 }],
      [{ x: 690, y: 540 }, { x: 750, y: 550 }, { x: 830, y: 580 }],
      [{ x: 1150, y: 510 }, { x: 1230, y: 550 }, { x: 1340, y: 580 }, { x: 1485, y: 555 }],
    ];

    ctx.lineWidth = 0.75;
    ctx.strokeStyle = MAP.water;
    for (const trib of tributaries) {
      ctx.beginPath();
      this.smoothPath(ctx, trib);
      ctx.stroke();
    }

    // 4. Standard NATO Bridges (STANAG 3677 cased brackets ][ )
    const stoneBridges = [
      { x: 685, y: 440, angle: 0.1, id: 'BR-1', name: 'PUNTOWITZ' },
      { x: 695, y: 500, angle: 0.2, id: 'BR-2', name: 'KOBELNITZ' },
      { x: 660, y: 645, angle: -0.1, id: 'BR-3', name: 'SOKOLNITZ' },
    ];

    for (const b of stoneBridges) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);

      ctx.strokeStyle = MAP.ink;
      ctx.lineWidth = 1;

      // West bank bracket [
      ctx.beginPath();
      ctx.moveTo(-8, -5); ctx.lineTo(-8, 5);
      ctx.moveTo(-8, -5); ctx.lineTo(-11, -5);
      ctx.moveTo(-8, 5); ctx.lineTo(-11, 5);
      ctx.stroke();

      // East bank bracket ]
      ctx.beginPath();
      ctx.moveTo(8, -5); ctx.lineTo(8, 5);
      ctx.moveTo(8, -5); ctx.lineTo(11, -5);
      ctx.moveTo(8, 5); ctx.lineTo(11, 5);
      ctx.stroke();

      // Stone abutment fill
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(-7, -3, 14, 6);


      ctx.restore();
    }

    // 5. Standard NATO Ford Symbol (Telnitz)
    ctx.save();
    ctx.translate(615, 810);
    ctx.rotate(-0.2);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 2]);

    ctx.beginPath();
    ctx.moveTo(-10, -3); ctx.lineTo(10, -3);
    ctx.moveTo(-10, 3); ctx.lineTo(10, 3);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.font = font(500, 6, FONT.carto, true);
    ctx.textAlign = 'center';
    haloText(ctx, 'Ford 0.4m', 0, -7, '#1d4f86', 2);
    ctx.restore();

    // 6. Authentic NATO Wetland Marsh Symbols (_\\|/_ )
    const wetlandTufts = [
      { x: 200, y: 300 }, { x: 230, y: 360 }, { x: 190, y: 420 },
      { x: 670, y: 620 }, { x: 650, y: 720 }, { x: 630, y: 780 },
      { x: 600, y: 840 }, { x: 570, y: 900 }, { x: 810, y: 790 },
      { x: 840, y: 810 }, { x: 820, y: 830 },
    ];
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 0.85;
    for (const wt of wetlandTufts) {
      ctx.beginPath();
      ctx.moveTo(wt.x - 3.5, wt.y); ctx.lineTo(wt.x + 3.5, wt.y);
      ctx.moveTo(wt.x - 2, wt.y - 2.5); ctx.lineTo(wt.x - 2, wt.y);
      ctx.moveTo(wt.x, wt.y - 3.5); ctx.lineTo(wt.x, wt.y);
      ctx.moveTo(wt.x + 2, wt.y - 2.5); ctx.lineTo(wt.x + 2, wt.y);
      ctx.stroke();
    }

    // River Names
    ctx.fillStyle = '#1d4f86';
    ctx.font = font(500, 10, FONT.carto, true);

    ctx.save();
    ctx.translate(180, 720);
    ctx.rotate(-Math.PI / 2.3);
    ctx.fillText('Schwarza R.', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(535, 850);
    ctx.rotate(-Math.PI / 2.5);
    ctx.fillText('Goldbach Brook', 0, 0);
    ctx.restore();

    ctx.fillText('Littawa R.', 1490, 370);

    ctx.restore();
  }



  // =========================================================================
  // 5. ROAD NETWORK (NATO STANAG 3677 All-Weather Highways, Secondary Roads & Tracks)
  // =========================================================================
  private renderRoads(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // 1. Primary All-Weather Highway (MSR-1: Olmütz Highway / Route Impériale)
    // Double-cased route with heavy dark slate borders and NATO primary red core
    ctx.beginPath();
    ctx.moveTo(65, 175);
    ctx.bezierCurveTo(290, 160, 580, 185, 870, 190);
    ctx.bezierCurveTo(1130, 185, 1340, 130, 1550, 50);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = '#d7301f';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Route shield and milestones
    ctx.save();
    ctx.font = font(600, 7);
    ctx.textAlign = 'left';
    haloText(ctx, 'MSR 1 · TO OLMÜTZ →', 1380, 50, '#44403c', 2.4);
    ctx.restore();

    // 2. Secondary All-Weather Highway (Vienna Highway)
    ctx.beginPath();
    ctx.moveTo(50, 1000);
    ctx.bezierCurveTo(80, 900, 100, 775, 100, 580);
    ctx.bezierCurveTo(100, 385, 160, 225, 225, 145);

    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.strokeStyle = '#f2a33a';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 3. Secondary All-Weather Improved Roads (STANAG 3677 Double-Line Cased)
    const secondaryRoads = [
      [
        { x: 250, y: 110 }, { x: 420, y: 440 }, { x: 520, y: 480 },
        { x: 710, y: 380 }, { x: 800, y: 440 }, { x: 915, y: 520 },
        { x: 1150, y: 510 }, { x: 1540, y: 420 },
      ],
      [
        { x: 800, y: 440 }, { x: 640, y: 660 }, { x: 610, y: 810 },
        { x: 870, y: 745 }, { x: 980, y: 700 }, { x: 1150, y: 510 },
      ],
      [
        { x: 105, y: 885 }, { x: 290, y: 900 }, { x: 610, y: 810 }, { x: 730, y: 935 },
      ],
      [
        { x: 1320, y: 105 }, { x: 1300, y: 260 }, { x: 1540, y: 420 },
      ],
      [
        { x: 1220, y: 160 }, { x: 1220, y: 320 }, { x: 915, y: 520 },
      ],
    ];

    // Outer casing
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1.8;
    for (const r of secondaryRoads) {
      ctx.beginPath();
      this.smoothPath(ctx, r);
      ctx.stroke();
    }

    // Inner white core
    ctx.strokeStyle = '#fbfbf8';
    ctx.lineWidth = 0.9;
    for (const r of secondaryRoads) {
      ctx.beginPath();
      this.smoothPath(ctx, r);
      ctx.stroke();
    }

    // 4. Unpaved Country Tracks & Farm Lanes (STANAG 3677 Dashed Earth Tracks)
    const farmTracks = [
      [{ x: 890, y: 175 }, { x: 920, y: 190 }, { x: 960, y: 220 }],
      [{ x: 720, y: 250 }, { x: 720, y: 195 }],
      [{ x: 690, y: 490 }, { x: 760, y: 440 }, { x: 840, y: 410 }, { x: 1060, y: 390 }],
      [{ x: 915, y: 520 }, { x: 1000, y: 460 }, { x: 1060, y: 390 }],
      [{ x: 870, y: 745 }, { x: 810, y: 840 }, { x: 755, y: 935 }],
    ];

    ctx.strokeStyle = 'rgba(30, 30, 30, 0.75)';
    ctx.lineWidth = 0.6;
    ctx.setLineDash([4, 2.5]);
    for (const t of farmTracks) {
      ctx.beginPath();
      this.smoothPath(ctx, t);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.restore();
  }



  // =========================================================================
  // 6. TOWNS & VILLAGES (NATO STANAG 3677 Urban Morphology & Tactical Structures)
  // Individual building footprints, walled churchyards, chateaus, and mills
  // =========================================================================
  private renderSettlements(ctx: CanvasRenderingContext2D) {
    ctx.save();

    const settlements = SETTLEMENTS;

    for (const s of settlements) {
      ctx.save();
      ctx.translate(s.x, s.y);

      // Deterministic per-village generator so the layout is stable between sessions
      let seed = 0;
      for (const ch of s.name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const major = !!s.isMajor;
      const isTacticalGarrison = ['Sokolnitz', 'Telnitz', 'Kobelnitz', 'Puntowitz', 'Pratzen', 'Bosenitz'].includes(s.name);
      const len = major ? 46 : isTacticalGarrison ? 30 : 24; // main street length
      const streetAngle = rand() * Math.PI;
      const ca = Math.cos(streetAngle);
      const sa = Math.sin(streetAngle);
      const along = (t: number, off: number) => ({ x: ca * t - sa * off, y: sa * t + ca * off });

      // Built-up area tint: a soft lozenge around the streets
      ctx.fillStyle = MAP.builtUp;
      ctx.beginPath();
      const halfW = major ? 16 : 8;
      for (let k = 0; k <= 16; k++) {
        const th = (k / 16) * Math.PI * 2;
        const r = 1 + (rand() - 0.5) * 0.18;
        const p = along(Math.cos(th) * (len / 2 + 4) * r, Math.sin(th) * (halfW + 4) * r);
        if (k === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();

      // Buildings lining the main street (and a cross street in towns)
      ctx.fillStyle = MAP.building;
      const placeRow = (t0: number, t1: number, off: number, angle: number) => {
        const c = Math.cos(angle);
        const sn = Math.sin(angle);
        for (let t = t0; t < t1; t += 3.2 + rand() * 2.2) {
          if (rand() < 0.15) continue;
          const w = 2 + rand() * 1.8;
          const h = 1.6 + rand() * 1.4;
          const side = off + (off > 0 ? h / 2 : -h / 2);
          const cx = c * t - sn * side;
          const cy = sn * t + c * side;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.restore();
        }
      };
      placeRow(-len / 2, len / 2, 2.2, streetAngle);
      placeRow(-len / 2, len / 2, -2.2, streetAngle);
      if (major) {
        placeRow(-len / 2.4, len / 2.4, 9, streetAngle);
        placeRow(-len / 2.4, len / 2.4, -9, streetAngle);
        placeRow(-len / 3, len / 3, 2.2, streetAngle + Math.PI / 2);
        placeRow(-len / 3, len / 3, -2.2, streetAngle + Math.PI / 2);
      }

      // Church: small circle with cross
      if (s.hasChurch || major) {
        const c = along(len * 0.12, 0);
        ctx.strokeStyle = MAP.building;
        ctx.lineWidth = 0.6;
        ctx.fillStyle = MAP.paper;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - 4.2);
        ctx.lineTo(c.x, c.y - 1.8);
        ctx.moveTo(c.x - 1.1, c.y - 3.3);
        ctx.lineTo(c.x + 1.1, c.y - 3.3);
        ctx.stroke();
      }

      // Name: towns larger; tactically significant villages in bold
      const labelY = -Math.max(Math.abs(sa) * len / 2, halfW) - 6;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (major) {
        ctx.font = font(700, 9.5);
        haloText(ctx, s.name.toUpperCase(), 0, labelY - 2, MAP.ink, 3);
      } else {
        ctx.font = font(isTacticalGarrison ? 700 : 500, isTacticalGarrison ? 7 : 6.5);
        haloText(ctx, s.name, 0, labelY, MAP.ink, 2.6);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  

  // =========================================================================
  // 8. HEX GRID (OPTIONAL WARGAME MODE)

  // =========================================================================
  // 9. HISTORICAL TACTICAL MANEUVER ARROWS
  // Dashed red Allied flank attack & blue French counter-attack vectors

  // =========================================================================
  // TOTAL WAR CURVED MANEUVER ARROW RENDERING ENGINE
  // Multi-point splines, marching chevrons, destination ghost formations & flight metrics
  // =========================================================================
  private renderTotalWarArrow(
    ctx: CanvasRenderingContext2D,
    start: Vector2D,
    end: Vector2D,
    waypoints: Vector2D[] | undefined,
    curveControl: Vector2D | undefined,
    color: string,
    isExecuting: boolean,
    ghostUnit?: Unit,
    finalHeading?: number,
    showMetrics?: boolean,
    isDelivering?: boolean
  ) {
    ctx.save();

    // 1. Build smooth curve points
    let points: Vector2D[] = [];
    if (waypoints && waypoints.length >= 1) {
      const lastWp = waypoints[waypoints.length - 1];
      const distToEnd = Math.hypot(lastWp.x - end.x, lastWp.y - end.y);
      points = distToEnd < 15 ? [start, ...waypoints] : [start, ...waypoints, end];
    } else if (curveControl) {
      // Sample quadratic Bezier curve
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const inv = 1 - t;
        const x = inv * inv * start.x + 2 * inv * t * curveControl.x + t * t * end.x;
        const y = inv * inv * start.y + 2 * inv * t * curveControl.y + t * t * end.y;
        points.push({ x, y });
      }
    } else {
      points = [start, end];
    }

    if (points.length < 2) {
      ctx.restore();
      return;
    }

    // Calculate total path distance (1 px = 5 meters, 200 px = 1 km)
    let totalDist = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalDist += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    }
    const distMeters = Math.round(totalDist * 5);
    const marchMins = Math.max(1, Math.round(distMeters / 60));

    // 2. Direction of movement: solid when executing, dashed while the order is still with the courier
    const hair = 1 / this.zoom;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6 * hair;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isDelivering) {
      ctx.setLineDash([5 * hair, 4 * hair]);
      ctx.globalAlpha = 0.6;
    } else if (!isExecuting) {
      ctx.setLineDash([8 * hair, 4 * hair]);
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // 5. Military Arrowhead at Destination (proportional, neat dart)
    const lastP = points[points.length - 1];
    const prevP = points[points.length - 2];
    const finalAngle = Math.atan2(lastP.y - prevP.y, lastP.x - prevP.x);
    const arrowLen = 9 * hair * Math.max(1, this.zoom * 0.8);

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(lastP.x, lastP.y);
    ctx.lineTo(
      lastP.x - arrowLen * Math.cos(finalAngle - Math.PI / 6),
      lastP.y - arrowLen * Math.sin(finalAngle - Math.PI / 6)
    );
    ctx.lineTo(
      lastP.x - (arrowLen * 0.45) * Math.cos(finalAngle),
      lastP.y - (arrowLen * 0.45) * Math.sin(finalAngle)
    );
    ctx.lineTo(
      lastP.x - arrowLen * Math.cos(finalAngle + Math.PI / 6),
      lastP.y - arrowLen * Math.sin(finalAngle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 6. Total War Ghost Unit Silhouette at Destination
    if (ghostUnit) {
      const heading = finalHeading !== undefined ? finalHeading : finalAngle;
      const gw = ghostUnit.width || 50;
      const gh = ghostUnit.depth || 16;

      ctx.save();
      ctx.translate(lastP.x, lastP.y);
      ctx.rotate(heading);

      ctx.fillStyle = 'rgba(11, 94, 168, 0.08)';
      ctx.strokeStyle = color;
      ctx.lineWidth = hair;
      ctx.setLineDash([3 * hair, 2 * hair]);
      ctx.beginPath();
      ctx.rect(-gw / 2, -gh / 2, gw, gh);
      ctx.fill();
      ctx.stroke();

      // Front direction arrow
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(gw / 2 + 2, 0);
      ctx.lineTo(gw / 2 - 2, -2);
      ctx.lineTo(gw / 2 - 2, 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // 7. Tactical Distance & Flight Tag
    if (showMetrics && totalDist > 40) {
      const midIdx = Math.floor(points.length / 2);
      const midPt = points[midIdx];

      ctx.save();
      const tag = `${distMeters.toLocaleString()} m · ~${marchMins} min`;
      ctx.font = font(600, 7.5 * this.symbolScale());
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      haloText(ctx, tag, midPt.x, midPt.y - 4 * hair, MAP.ink, 2.6 * this.symbolScale());
      ctx.restore();
    }

    ctx.restore();
  }

  // Active Orders Drawing
  private renderActiveOrders(ctx: CanvasRenderingContext2D, orders: ManeuverOrder[], units: Unit[], playerFaction: string) {
    for (const order of orders) {
      const unit = units.find((u) => u.id === order.unitId);
      if (!unit || unit.faction !== playerFaction) continue; // HIDE ENEMY INTENT!

      // Do not render remnant trajectories for shattered/dead units or completed orders
      if (unit.status === 'shattered' || unit.strength <= 0) continue;
      if (order.status === 'completed' || order.status === 'cancelled') continue;

      const isDelivering = order.status === 'delivering';
      
      if (order.type === 'bombard') {
        const isCounterBattery = !!order.isCounterBattery;
        const isGrandBattery = !!order.isGrandBattery || !!unit.isGrandBatteryLeader || !!unit.grandBatteryGroupId;

        // Draw CFF Targeting Line (clean, slim military trajectory)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(unit.position.x, unit.position.y);
        ctx.lineTo(order.destination.x, order.destination.y);
        ctx.strokeStyle = isCounterBattery
          ? 'rgba(185, 28, 28, 0.90)'
          : isGrandBattery
          ? 'rgba(180, 83, 9, 0.90)'
          : isDelivering
          ? 'rgba(234, 88, 12, 0.35)'
          : 'rgba(234, 88, 12, 0.85)';
        ctx.lineWidth = isGrandBattery ? 1.5 : 1.0;
        ctx.setLineDash(isDelivering ? [2, 4] : isGrandBattery ? [4, 2] : [3, 3]);
        ctx.stroke();
        
        // Target reticle
        ctx.beginPath();
        ctx.arc(order.destination.x, order.destination.y, isGrandBattery ? 8 : 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(order.destination.x, order.destination.y, 1, 0, Math.PI * 2);
        ctx.stroke();

        if (isCounterBattery) {
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = '#dc2626';
          ctx.textAlign = 'center';
          ctx.fillText('CB MISSION', order.destination.x, order.destination.y - 10);
        } else if (isGrandBattery) {
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = '#b45309';
          ctx.textAlign = 'center';
          ctx.fillText('GRAND BATTERY TOT', order.destination.x, order.destination.y - 12);
        }
        ctx.restore();

        // Render C2 Forward Observer Link if directed by spotter unit
        if (order.observerUnitId) {
          const obs = units.find((u) => u.id === order.observerUnitId);
          if (obs && obs.status !== 'shattered') {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(obs.position.x, obs.position.y);
            ctx.lineTo(order.destination.x, order.destination.y);
            ctx.strokeStyle = '#0284c7'; // Cyan for C2 Link
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();

            const midX = (obs.position.x + order.destination.x) / 2;
            const midY = (obs.position.y + order.destination.y) / 2;
            ctx.font = 'bold 8px monospace';
            ctx.fillStyle = '#0369a1';
            ctx.textAlign = 'center';
            ctx.fillText('C2 LINK: FO SPOTTER', midX, midY - 4);
            ctx.restore();
          }
        }
        continue;
      }

      if (order.type === 'volley') {
        // Render battalion mass volley holding perimeter
        ctx.save();
        const threshold = order.holdFireThreshold || 65;
        ctx.beginPath();
        ctx.arc(unit.position.x, unit.position.y, threshold, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();

        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#b45309';
        ctx.textAlign = 'center';
        ctx.fillText(`VOLLEY ZONE (${Math.round(threshold * 5)}m)`, unit.position.x, unit.position.y - threshold - 4);
        ctx.restore();
        continue;
      }

      if (order.type === 'suppress') {
        // Render continuous covering fire lane
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(unit.position.x, unit.position.y);
        ctx.lineTo(order.destination.x, order.destination.y);
        ctx.strokeStyle = 'rgba(194, 65, 12, 0.85)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 3]);
        ctx.stroke();

        // Target bracket
        ctx.beginPath();
        ctx.arc(order.destination.x, order.destination.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#c2410c';
        ctx.stroke();

        const midX = (unit.position.x + order.destination.x) / 2;
        const midY = (unit.position.y + order.destination.y) / 2;
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#c2410c';
        ctx.textAlign = 'center';
        ctx.fillText('COVERING FIRE LANE', midX, midY - 4);
        ctx.restore();
        continue;
      }

      if (order.type === 'entrench') {
        // No arrow for entrenchment
        continue;
      }

      const color = MAP.friendLine;

      this.renderTotalWarArrow(
        ctx,
        unit.position,
        order.destination,
        order.waypoints,
        order.curveControl,
        color,
        order.status === 'executing',
        unit,
        order.finalHeading,
        false,
        isDelivering || order.status === 'standby'
      );

      // Render tactical badge for Standby, Timed Mission, Contingency, or Subordinate Initiative
      if (order.status === 'standby' || order.endTime !== undefined || order.condition || order.source === 'subordinate') {
        ctx.save();
        const badgeX = order.destination.x;
        const badgeY = order.destination.y - 20;

        let badgeText = '';
        let badgeColor = '#111111';

        if (order.source === 'subordinate') {
          badgeText = `Initiative: ${order.type}`;
          badgeColor = '#92400e';
        } else if (order.status === 'standby') {
          const h = Math.floor((order.startTime || 0) / 60) + 7;
          const m = Math.floor((order.startTime || 0) % 60);
          badgeText = `At ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          badgeColor = '#92400e';
        } else if (order.endTime !== undefined) {
          const h = Math.floor(order.endTime / 60) + 7;
          const m = Math.floor(order.endTime % 60);
          badgeText = `Until ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          badgeColor = '#1e40af';
        } else if (order.condition) {
          badgeText = `If ${order.condition.description.toLowerCase()}`;
          badgeColor = '#6b21a8';
        }

        ctx.font = font(600, 7 * this.symbolScale());
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        haloText(ctx, badgeText, badgeX, badgeY + 1, badgeColor, 2.6 * this.symbolScale());
        ctx.restore();
      }
    }
  }

  private renderGhostNatoChit(
    ctx: CanvasRenderingContext2D,
    pos: Vector2D,
    heading: number,
    unit: Unit,
    _color: string
  ) {
    const s = this.symbolScale();
    const { lw, lh } = this.footprintSize(unit);

    // Planned footprint & facing at the destination
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(heading);
    ctx.strokeStyle = 'rgba(11, 94, 168, 0.8)';
    ctx.lineWidth = 1 / this.zoom;
    ctx.setLineDash([3 / this.zoom, 2 / this.zoom]);
    ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(11, 94, 168, 0.8)';
    ctx.beginPath();
    ctx.moveTo(lw / 2 + 4, 0);
    ctx.lineTo(lw / 2, -2.6);
    ctx.lineTo(lw / 2, 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Planned position: APP-6 dashed (anticipated) frame
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(s, s);
    ctx.globalAlpha = 0.75;
    drawUnitSymbol(ctx, unit, 'friend', { dashed: true, fill: 'rgba(128, 224, 255, 0.55)', showEchelon: false });
    ctx.font = font(600, 7.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    haloText(ctx, designationFor(unit), FRAME_W / 2 + 3, 0, MAP.ink);
    ctx.restore();
  }

  private renderDraftingArrow(ctx: CanvasRenderingContext2D, drawingOrder: DraftingManeuver) {
    const { startUnit, currentTarget, waypoints, curveOffset, curveControl, finalHeading, dragStartPoint, selectedUnits, isFreehandPath } = drawingOrder;
    const color = MAP.friendLine;

    // FREEHAND CUSTOM MARCH PATH (Option/Alt + Drag)
    if (isFreehandPath && waypoints && waypoints.length > 0) {
      ctx.save();
      const pathColor = startUnit.faction === 'french' ? '#2563eb' : '#dc2626';

      // 1. Path Ribbon
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([6, 3]);

      ctx.beginPath();
      ctx.moveTo(startUnit.position.x, startUnit.position.y);
      for (const pt of waypoints) {
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineTo(currentTarget.x, currentTarget.y);
      ctx.stroke();

      // 2. Waypoint markers
      ctx.fillStyle = pathColor;
      for (let i = 0; i < waypoints.length; i++) {
        const pt = waypoints[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Arrowhead and distance badge at current target
      const lastPt = waypoints.length > 0 ? waypoints[waypoints.length - 1] : startUnit.position;
      const endHeading = Math.atan2(currentTarget.y - lastPt.y, currentTarget.x - lastPt.x);
      
      // Calculate total drawn distance
      let totalDist = Math.hypot(waypoints[0].x - startUnit.position.x, waypoints[0].y - startUnit.position.y);
      for (let i = 0; i < waypoints.length - 1; i++) {
        totalDist += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
      }
      totalDist += Math.hypot(currentTarget.x - lastPt.x, currentTarget.y - lastPt.y);

      const badgeText = `Route · ${Math.round(totalDist * 5).toLocaleString()} m · ${waypoints.length} waypoints`;
      ctx.font = font(600, 7.5 * this.symbolScale());
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      haloText(ctx, badgeText, currentTarget.x, currentTarget.y - 17 / this.zoom, MAP.ink, 2.6 * this.symbolScale());

      // Ghost unit at endpoint
      const endHeadingFinal = finalHeading !== undefined ? finalHeading : endHeading;
      this.renderGhostNatoChit(ctx, currentTarget, endHeadingFinal, startUnit, color);
      ctx.restore();
      return;
    }

    // MULTI-UNIT GROUP ARRAY PREVIEW
    if (selectedUnits && selectedUnits.length > 1 && dragStartPoint) {
      const unitsToRender = selectedUnits.filter((u) => u.status !== 'shattered');
      const n = unitsToRender.length;
      const dx = currentTarget.x - dragStartPoint.x;
      const dy = currentTarget.y - dragStartPoint.y;
      const lineLen = Math.hypot(dx, dy);

      const heading = finalHeading !== undefined 
        ? finalHeading 
        : Math.atan2(dy, dx) - Math.PI / 2;

      // Draw each unit's leader line and ghost chit
      unitsToRender.forEach((u, idx) => {
        let dest: Vector2D;
        if (lineLen < 15) {
          dest = { x: dragStartPoint.x + (idx - (n - 1) / 2) * 45, y: dragStartPoint.y };
        } else {
          const t = (idx + 0.5) / n;
          dest = {
            x: dragStartPoint.x + dx * t,
            y: dragStartPoint.y + dy * t,
          };
        }

        // Clean dashed leader line from current unit pos to designated slot
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(u.position.x, u.position.y);
        ctx.lineTo(dest.x, dest.y);
        ctx.stroke();
        ctx.restore();

        // Render Ghost NATO counter at designated slot
        this.renderGhostNatoChit(ctx, dest, heading, u, color);
      });

      // Circular wheeling pivot guide at anchor
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.arc(dragStartPoint.x, dragStartPoint.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Frontage deployment guideline along frontage
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(dragStartPoint.x, dragStartPoint.y);
      ctx.lineTo(currentTarget.x, currentTarget.y);
      ctx.stroke();

      // Frontage end caps
      const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
      const capLen = 7;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(dragStartPoint.x - Math.cos(perpAngle)*capLen, dragStartPoint.y - Math.sin(perpAngle)*capLen);
      ctx.lineTo(dragStartPoint.x + Math.cos(perpAngle)*capLen, dragStartPoint.y + Math.sin(perpAngle)*capLen);
      ctx.moveTo(currentTarget.x - Math.cos(perpAngle)*capLen, currentTarget.y - Math.sin(perpAngle)*capLen);
      ctx.lineTo(currentTarget.x + Math.cos(perpAngle)*capLen, currentTarget.y + Math.sin(perpAngle)*capLen);
      ctx.stroke();

      // Center facing direction arrow
      const midX = (dragStartPoint.x + currentTarget.x) / 2;
      const midY = (dragStartPoint.y + currentTarget.y) / 2;
      const faceLen = 22;
      const fx = midX + Math.cos(heading) * faceLen;
      const fy = midY + Math.sin(heading) * faceLen;

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      // Arrowhead
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(fx, fy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Metrics badge
      const deg = Math.round((heading * 180 / Math.PI + 360) % 360);
      const metricsText = `Line · ${Math.round(lineLen * 5).toLocaleString()} m front · ${n} units · facing ${String(deg).padStart(3, '0')}°`;
      ctx.font = font(600, 7.5 * this.symbolScale());
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      haloText(ctx, metricsText, midX, midY - 16 / this.zoom, MAP.ink, 2.6 * this.symbolScale());
      ctx.restore();
      return;
    }

    // SINGLE UNIT ARRAYING OR MANEUVER ARROW
    if (dragStartPoint) {
      // Single unit right-click drag sets destination and facing directly towards cursor
      const destination = dragStartPoint;
      const dx = currentTarget.x - dragStartPoint.x;
      const dy = currentTarget.y - dragStartPoint.y;
      const dragDist = Math.hypot(dx, dy);
      const heading = dragDist > 10 ? Math.atan2(dy, dx) : (finalHeading !== undefined ? finalHeading : startUnit.heading);

      // Path from current pos to destination
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(startUnit.position.x, startUnit.position.y);
      ctx.lineTo(destination.x, destination.y);
      ctx.stroke();

      // Circular wheeling compass dial & facing vector
      if (dragDist > 10) {
        // Dial ring
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(destination.x, destination.y, 22, 0, Math.PI * 2);
        ctx.stroke();

        // Direction vector
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.0;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(destination.x, destination.y);
        ctx.lineTo(currentTarget.x, currentTarget.y);
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(currentTarget.x, currentTarget.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Orientation tag
        const deg = Math.round(((heading * 180) / Math.PI + 360) % 360);
        const tag = `Facing ${String(deg).padStart(3, '0')}°`;
        ctx.font = font(600, 7.5 * this.symbolScale());
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        haloText(ctx, tag, destination.x, destination.y - 24 / this.zoom, MAP.ink, 2.6 * this.symbolScale());
      }
      ctx.restore();

      // Ghost unit at destination
      this.renderGhostNatoChit(ctx, destination, heading, startUnit, color);
      return;
    }

    // LEFT-CLICK DRAG: Maneuver sweep arrow
    const destination = currentTarget;
    let activeControl = curveControl;
    if (!activeControl && curveOffset) {
      const midX = (startUnit.position.x + destination.x) / 2;
      const midY = (startUnit.position.y + destination.y) / 2;
      const dx = destination.x - startUnit.position.x;
      const dy = destination.y - startUnit.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const perpX = -dy / dist;
        const perpY = dx / dist;
        activeControl = { x: midX + perpX * curveOffset, y: midY + perpY * curveOffset };
      }
    }

    this.renderTotalWarArrow(
      ctx,
      startUnit.position,
      destination,
      waypoints,
      activeControl,
      color,
      false,
      startUnit,
      finalHeading,
      true
    );
  }

  // =========================================================================
  // 11. WEAPON RANGES & ACTIVE TARGETING OVERLAYS
  // Renders musket volley ranges (infantry), canister & bombardment radii (artillery)
  // =========================================================================
  private renderWeaponRanges(
    ctx: CanvasRenderingContext2D,
    state: SimulationState,
    hoveredUnitId: string | null
  ) {
    const selectedIds = state.selectedUnitIds?.length ? state.selectedUnitIds : (state.selectedUnitId ? [state.selectedUnitId] : []);
    
    // Determine which units get range rings
    const unitsToDisplay = state.units.filter((u) => {
      if (u.status === 'shattered') return false;
      if (this.showRangeRings) return u.faction === state.playerFaction || u.detectionState === 'identified';
      return selectedIds.includes(u.id) || u.id === hoveredUnitId;
    });

    const hair = 1 / this.zoom;
    const labelSize = 7.5 * this.symbolScale();
    const eraProfile = ERA_WEAPON_PROFILES[state.era || 'napoleonic'] || ERA_WEAPON_PROFILES.napoleonic;

    for (const unit of unitsToDisplay) {
      if (unit.firepower <= 0) continue;
      const isFriendly = unit.faction === state.playerFaction;
      const emphasized = selectedIds.includes(unit.id) || unit.id === hoveredUnitId;
      const rgb = isFriendly ? '11, 94, 168' : '194, 39, 45';
      const a = emphasized ? 0.75 : 0.28;

      ctx.save();
      ctx.translate(unit.position.x, unit.position.y);
      ctx.lineWidth = emphasized ? 1.4 * hair : hair;

      if (unit.type === 'artillery') {
        // Range fan: the sector the battery is laid on (towards its current target, else its
        // facing), bounded by left and right limits, with arcs at canister and maximum range
        const canisterRadius = 120;
        const maxRange = unit.range || 350;
        const target = unit.currentOrder?.type === 'bombard' ? unit.currentOrder.destination : null;
        const laying = target ? Math.atan2(target.y - unit.position.y, target.x - unit.position.x) : unit.heading;
        const half = Math.PI / 4;
        const left = laying - half;
        const right = laying + half;
        const stroke = `rgba(${rgb}, ${emphasized ? 0.85 : 0.45})`;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, maxRange, left, right);
        ctx.closePath();
        ctx.fillStyle = `rgba(${rgb}, ${emphasized ? 0.06 : 0.025})`;
        ctx.fill();

        ctx.strokeStyle = stroke;
        ctx.setLineDash([5 * hair, 4 * hair]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(left) * maxRange, Math.sin(left) * maxRange);
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(right) * maxRange, Math.sin(right) * maxRange);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.lineWidth = (emphasized ? 1.6 : 1.1) * hair;
        ctx.beginPath();
        ctx.arc(0, 0, maxRange, left, right);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, canisterRadius, left, right);
        ctx.stroke();

        if (emphasized) {
          const metres = (px: number) => `${(px * 5).toLocaleString('en-GB').replace(',', '\u2009')} m`;
          ctx.font = font(600, labelSize);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tag = (r: number, text: string) =>
            haloText(ctx, text, Math.cos(laying) * (r + 7 * hair), Math.sin(laying) * (r + 7 * hair), `rgb(${rgb})`);
          tag(maxRange, `${eraProfile.rangeLabels.indirectFire} ${metres(maxRange)}`);
          tag(canisterRadius, `${eraProfile.rangeLabels.pointDefense} ${metres(canisterRadius)}`);
          ctx.font = font(700, labelSize);
          haloText(ctx, 'L', Math.cos(left) * (maxRange + 8 * hair), Math.sin(left) * (maxRange + 8 * hair), `rgb(${rgb})`);
          haloText(ctx, 'R', Math.cos(right) * (maxRange + 8 * hair), Math.sin(right) * (maxRange + 8 * hair), `rgb(${rgb})`);
        }
      } else {
        const range = unit.range || 100;
        ctx.strokeStyle = `rgba(${rgb}, ${a * 0.7})`;
        ctx.setLineDash([4 * hair, 4 * hair]);
        ctx.beginPath();
        ctx.arc(0, 0, range, 0, Math.PI * 2);
        ctx.stroke();

        // Forward arc of fire (±60° about facing)
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${rgb}, ${emphasized ? 0.9 : 0.4})`;
        ctx.lineWidth = (emphasized ? 2 : 1.2) * hair;
        ctx.beginPath();
        ctx.arc(0, 0, range, unit.heading - Math.PI / 3, unit.heading + Math.PI / 3);
        ctx.stroke();

        if (emphasized) {
          ctx.fillStyle = `rgba(${rgb}, 0.05)`;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, range, unit.heading - Math.PI / 3, unit.heading + Math.PI / 3);
          ctx.closePath();
          ctx.fill();

          ctx.font = font(600, labelSize);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tagR = range + 9 * hair;
          haloText(ctx, `${eraProfile.rangeLabels.directFire} · ${range * 5}m`, Math.cos(unit.heading) * tagR, Math.sin(unit.heading) * tagR, `rgb(${rgb})`);
        }
      }

      ctx.restore();
    }

    // 3. LIVE CALL-FOR-FIRE (CFF) TARGETING OVERLAY
    if (this.targetingState.active && this.targetingState.batteryUnitId && this.targetingState.currentMousePos) {
      const battery = state.units.find((u) => u.id === this.targetingState.batteryUnitId);
      const mousePos = this.targetingState.currentMousePos;
      if (battery) {
        const dist = Math.hypot(mousePos.x - battery.position.x, mousePos.y - battery.position.y);
        const maxRange = battery.range || 350;
        const inRange = dist <= maxRange;
        const los = this.engine ? this.engine.checkLineOfSight(battery.position, mousePos) : { inDefilade: false, occludingElevation: 0, occludingPoint: undefined };
        const inDefilade = los.inDefilade;

        ctx.save();
        // If target is in defilade, render the occluding crest obstruction point
        if (inDefilade && los.occludingPoint) {
          ctx.save();
          ctx.translate(los.occludingPoint.x, los.occludingPoint.y);
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.font = 'bold 7px Arial, sans-serif';
          ctx.fillStyle = '#b91c1c';
          ctx.textAlign = 'center';
          ctx.fillText(`▲ CREST OCCLUSION (+${Math.round(los.occludingElevation)}m)`, 0, -8);
          ctx.restore();
        }

        // If out of range, show planned firing position waypoint
        if (!inRange) {
          const angle = Math.atan2(mousePos.y - battery.position.y, mousePos.x - battery.position.x);
          const advancePt = {
            x: mousePos.x - Math.cos(angle) * (maxRange * 0.85),
            y: mousePos.y - Math.sin(angle) * (maxRange * 0.85),
          };
          ctx.strokeStyle = '#22c55e';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.arc(advancePt.x, advancePt.y, 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = 'bold 7px Arial, sans-serif';
          ctx.fillStyle = '#15803d';
          ctx.fillText('DEPLOY HERE', advancePt.x, advancePt.y - 8);
        }

        // Dynamic Tactical Artillery Killzone footprint at cursor
        this.renderArtilleryKillzoneFootprint(
          ctx,
          state,
          battery,
          mousePos,
          battery.observerForBatteryId,
          true,
          false
        );

        ctx.restore();
      }
    }

    // 4. Engagements needing reinforcement: thin dashed ring and a small label
    if (state.activeEngagements && state.activeEngagements.length > 0) {
      const hair = 1 / this.zoom;
      const ls = this.symbolScale();
      for (const eng of state.activeEngagements) {
        if (!eng.needsReinforcements) continue;
        const { x, y } = eng.sectorLocation;
        const radius = 34;
        ctx.save();
        ctx.strokeStyle = 'rgba(194, 39, 45, 0.75)';
        ctx.lineWidth = 1.4 * hair;
        ctx.setLineDash([5 * hair, 4 * hair]);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = font(600, 7.5 * ls);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        haloText(ctx, `${eng.name.split(' ')[0]} · reinforce`, x, y - radius - 2 * hair, '#8f1d22', 2.6 * ls);
        ctx.restore();
      }
    }
  }

  // =========================================================================
  // 11.5 NATO OPERATIONAL GRAPHICS (PHASE LINES, OBJECTIVES, FSCL)
  // =========================================================================
  /** Points spaced along a polyline (world units), with the local direction of the line. */
  private pointsAlong(points: Vector2D[], spacing: number, offset: number) {
    const out: { x: number; y: number; angle: number }[] = [];
    let next = offset;
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      while (next <= walked + len) {
        const t = (next - walked) / len;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle });
        next += spacing;
      }
      walked += len;
    }
    return out;
  }

  /** Text laid along a line, kept upright, on a paper gap so the line appears broken around it. */
  private lineLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, angle: number, color: string, size: number, gap: boolean) {
    let a = angle;
    if (a > Math.PI / 2) a -= Math.PI;
    if (a < -Math.PI / 2) a += Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.font = font(700, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (gap) {
      const w = ctx.measureText(text).width + size * 0.9;
      ctx.fillStyle = MAP.paper;
      ctx.fillRect(-w / 2, -size * 0.62, w, size * 1.24);
      ctx.fillStyle = color;
      ctx.fillText(text, 0, size * 0.04);
    } else {
      haloText(ctx, text, 0, 0, color, size * 0.4);
    }
    ctx.restore();
  }

  // Control measures per APP-6: boundaries (solid, echelon in a gap, formations either side), phase
  // lines (solid, named at intervals), FSCL, objectives. Only the player's own overlay is shown.
  private renderOperationalGraphics(ctx: CanvasRenderingContext2D, graphics: OperationalGraphic[], playerFaction: Faction) {
    const hair = 1 / this.zoom;
    const ls = this.symbolScale();
    const size = 8 * ls;
    const spacing = 650;
    ctx.save();
    ctx.lineJoin = 'round';
    for (const g of graphics) {
      if (g.faction && g.faction !== playerFaction) continue;
      if (g.type === 'boundary' && !this.showCorpsOverlay) continue;

      if (g.type === 'phase_line' || g.type === 'fscl' || g.type === 'boundary') {
        if (g.points.length < 2) continue;
        const color = g.type === 'fscl' ? '#c2410c' : MAP.ink;
        ctx.strokeStyle = color;
        ctx.lineWidth = (g.type === 'boundary' ? 1.7 : 1.4) * hair;
        ctx.beginPath();
        ctx.moveTo(g.points[0].x, g.points[0].y);
        for (let i = 1; i < g.points.length; i++) ctx.lineTo(g.points[i].x, g.points[i].y);
        ctx.stroke();

        for (const at of this.pointsAlong(g.points, spacing, spacing / 2)) {
          if (g.type === 'boundary') {
            this.lineLabel(ctx, g.echelon || 'XX', at.x, at.y, at.angle, color, size, true);
            // Formations on either side: left of the line's direction is north for a west-east boundary
            const off = size * 1.35;
            const nx = Math.sin(at.angle);
            const ny = -Math.cos(at.angle);
            if (g.leftUnit) this.lineLabel(ctx, g.leftUnit, at.x + nx * off, at.y + ny * off, at.angle, color, size, false);
            if (g.rightUnit) this.lineLabel(ctx, g.rightUnit, at.x - nx * off, at.y - ny * off, at.angle, color, size, false);
          } else {
            const label = g.role ? `${g.name} (${g.role})` : g.name;
            this.lineLabel(ctx, label, at.x, at.y, at.angle, color, size, true);
          }
        }
      } else if (g.type === 'objective') {
        const pt = g.points[0];
        if (!pt) continue;
        // Objective: closed, slightly irregular outline with the name inside
        const r = 46;
        ctx.strokeStyle = MAP.ink;
        ctx.lineWidth = 1.5 * hair;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const t = (k / 24) * Math.PI * 2;
          const rr = r * (1 + 0.08 * Math.sin(t * 3 + pt.x * 0.01) + 0.05 * Math.cos(t * 5));
          const x = pt.x + Math.cos(t) * rr * 1.25;
          const y = pt.y + Math.sin(t) * rr;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.font = font(700, size);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        haloText(ctx, g.name, pt.x, pt.y - r + 12 * ls, MAP.ink, 3 * ls);
      }
    }
    ctx.restore();
  }

  // =========================================================================
  // 11.6 TARGET REFERENCE POINTS (TRPs)
  // =========================================================================
  private renderTargetReferencePoints(ctx: CanvasRenderingContext2D, trps: TargetReferencePoint[]) {
    const s = this.symbolScale();
    ctx.save();
    for (const trp of trps) {
      const { x, y } = trp.position;
      const isHovered = this.hoveredTrpId === trp.id;
      const isDragging = this.draggingTrpId === trp.id;
      const color = isDragging || isHovered ? '#0b5ea8' : MAP.ink;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);

      if (isDragging || isHovered) {
        ctx.fillStyle = 'rgba(11, 94, 168, 0.1)';
        ctx.strokeStyle = 'rgba(11, 94, 168, 0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash(isDragging ? [3, 2] : []);
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Point graphic: open circle with cross ticks
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.moveTo(-9, 0); ctx.lineTo(-4.5, 0);
      ctx.moveTo(4.5, 0); ctx.lineTo(9, 0);
      ctx.moveTo(0, -9); ctx.lineTo(0, -4.5);
      ctx.moveTo(0, 4.5); ctx.lineTo(0, 9);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(700, 6.5);
      haloText(ctx, trp.code, 8, -5, color);
      if (isHovered || isDragging) {
        ctx.font = font(500, 6.5);
        haloText(ctx, trp.name, 8, 4, MAP.inkMuted, 2.2);
      }
      if (isDragging) {
        ctx.font = font(500, 6.5, FONT.mono);
        haloText(ctx, `${Math.round(x)}, ${Math.round(y)}`, 8, 12, '#0b5ea8', 2.2);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // =========================================================================
  // 11.8 NATO CORPS BOUNDARIES & COMMAND AND CONTROL (C2) LINKS
  // Operational staff graphics showing Corps groupings, C2 HQ-to-subordinate
  // links, and dynamic hover highlighting with convex hull perimeters.
  // =========================================================================
  // 11.8 CORPS HIGHLIGHT
  // Hovering a corps in the order of battle brackets its formations on the map. Corps sectors
  // themselves are shown by the boundaries in the control-measures overlay.
  // =========================================================================
  private renderCorpsOverlay(ctx: CanvasRenderingContext2D, state: SimulationState) {
    if (!this.hoveredCorps) return;
    const corps = this.hoveredCorps.toLowerCase();
    const hair = 1 / this.zoom;
    ctx.save();
    ctx.lineWidth = 1.6 * hair;
    ctx.setLineDash([3 * hair, 3 * hair]);
    for (const u of state.units) {
      if (u.status === 'shattered' || u.strength <= 0 || u.corps?.toLowerCase() !== corps) continue;
      if (state.fogOfWarEnabled && u.faction !== state.playerFaction && u.detectionState !== 'identified') continue;
      ctx.strokeStyle = u.faction === state.playerFaction ? MAP.friendLine : MAP.hostileLine;
      ctx.beginPath();
      ctx.arc(u.position.x, u.position.y, 20 * this.symbolScale(), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // =========================================================================
  // 11.5 TACTICAL FOG OF WAR RECONNAISSANCE SHROUD
  // Soft atmospheric staff mist with line-of-sight vision apertures around troops
  // =========================================================================
  // Fog of war: a quarter-resolution mask (edges are soft anyway), rebuilt at most ~8 times a second
  private fowLastBuild = 0;
  private renderFogOfWarShroud(ctx: CanvasRenderingContext2D, state: SimulationState) {
    const Q = 0.25;
    if (!this.fowCanvas) {
      this.fowCanvas = document.createElement('canvas');
      this.fowCanvas.width = 2400 * Q;
      this.fowCanvas.height = 1500 * Q;
      this.fowCtx = this.fowCanvas.getContext('2d');
      this.fowLastBuild = 0;
    }
    const fCtx = this.fowCtx;
    if (!fCtx) return;

    const now = performance.now();
    if (now - this.fowLastBuild > 120) {
      this.fowLastBuild = now;
      fCtx.setTransform(Q, 0, 0, Q, 0, 0);
      fCtx.globalCompositeOperation = 'source-over';
      fCtx.clearRect(0, 0, 2400, 1500);
      fCtx.fillStyle = 'rgba(222, 222, 218, 0.78)';
      fCtx.fillRect(0, 0, 2400, 1500);
      fCtx.globalCompositeOperation = 'destination-out';
      for (const unit of state.units) {
        if (unit.faction !== state.playerFaction || unit.status === 'shattered' || unit.strength <= 0) continue;
        const r = this.engine ? this.engine.getUnitVisionRadius(unit) : 160;
        const grad = fCtx.createRadialGradient(unit.position.x, unit.position.y, r * 0.7, unit.position.x, unit.position.y, r);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        fCtx.fillStyle = grad;
        fCtx.beginPath();
        fCtx.arc(unit.position.x, unit.position.y, r, 0, Math.PI * 2);
        fCtx.fill();
      }
      fCtx.globalCompositeOperation = 'source-over';
    }

    ctx.drawImage(this.fowCanvas, 0, 0, 2400, 1500);
  }

  // Viewshed of the selected unit: points within its vision range that the terrain hides from it
  // (same line-of-sight test as fog of war), drawn as shaded dead ground. Cached until the unit moves.
  private renderLineOfSight(ctx: CanvasRenderingContext2D, state: SimulationState) {
    if (!this.engine || !state.selectedUnitId) return;
    const unit = state.units.find((u) => u.id === state.selectedUnitId);
    if (!unit || unit.status === 'shattered' || unit.faction !== state.playerFaction) return;

    const r = this.engine.getUnitVisionRadius(unit);
    const key = `${unit.id}:${Math.round(unit.position.x / 4)}:${Math.round(unit.position.y / 4)}:${Math.round(r)}`;
    if (!this.viewshed || this.viewshed.key !== key) {
      const step = 8;
      const n = Math.ceil((r * 2) / step);
      const canvas = this.viewshed?.canvas ?? document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      const c = canvas.getContext('2d');
      if (!c) return;
      const img = c.createImageData(n, n);
      const ox = unit.position.x - r;
      const oy = unit.position.y - r;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const px = ox + (i + 0.5) * step;
          const py = oy + (j + 0.5) * step;
          const d = Math.hypot(px - unit.position.x, py - unit.position.y);
          if (d > r || d < 50) continue;
          if (this.engine.checkLineOfSight(unit.position, { x: px, y: py }).inDefilade) {
            const o = (j * n + i) * 4;
            img.data[o] = 70;
            img.data[o + 1] = 66;
            img.data[o + 2] = 80;
            img.data[o + 3] = 95;
          }
        }
      }
      c.putImageData(img, 0, 0);
      this.viewshed = { key, canvas, x: ox, y: oy, r };
    }

    const v = this.viewshed;
    const hair = 1 / this.zoom;
    ctx.save();
    ctx.beginPath();
    ctx.arc(unit.position.x, unit.position.y, v.r, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(v.canvas, v.x, v.y, v.r * 2, v.r * 2);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(11, 94, 168, 0.55)';
    ctx.lineWidth = hair;
    ctx.setLineDash([6 * hair, 4 * hair]);
    ctx.beginPath();
    ctx.arc(unit.position.x, unit.position.y, v.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font(600, 7 * this.symbolScale());
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    haloText(ctx, `Observation ${Math.round(v.r * 5).toLocaleString()} m · shaded: dead ground`, unit.position.x, unit.position.y - v.r - 3 * hair, '#0b5ea8', 2.6 * this.symbolScale());
    ctx.restore();
  }

  // Counter-scale for upright symbols & labels: legible when zoomed out, restrained when zoomed in
  private symbolScale(): number {
    return Math.min(1.7, Math.max(0.45, Math.pow(this.zoom, -0.62)));
  }

  /** Probable enemy course of action: dashed red arrow along the last observed direction of march. */
  private renderProbableCourse(ctx: CanvasRenderingContext2D, from: Vector2D, heading: number, length: number, alpha: number) {
    const hair = 1 / this.zoom;
    const ex = from.x + Math.cos(heading) * length;
    const ey = from.y + Math.sin(heading) * length;
    const head = 9 * this.symbolScale();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = MAP.hostileLine;
    ctx.fillStyle = MAP.hostileLine;
    ctx.lineWidth = 1.6 * hair;
    ctx.setLineDash([7 * hair, 4 * hair]);
    ctx.beginPath();
    ctx.moveTo(from.x + Math.cos(heading) * 14 * this.symbolScale(), from.y + Math.sin(heading) * 14 * this.symbolScale());
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(heading) * head, ey + Math.sin(heading) * head);
    ctx.lineTo(ex + Math.cos(heading + 2.6) * head * 0.8, ey + Math.sin(heading + 2.6) * head * 0.8);
    ctx.lineTo(ex + Math.cos(heading - 2.6) * head * 0.8, ey + Math.sin(heading - 2.6) * head * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Lost contact (situation template): a suspected (dashed) symbol at the last known position, an
   * uncertainty circle that grows with the time since it was seen, the time of the last sighting,
   * and the probable course if it was on the move. Fades as the report ages.
   */
  private renderLostContact(ctx: CanvasRenderingContext2D, state: SimulationState, unit: Unit, report: EnemyIntel) {
    const age = Math.max(0, state.timeMinutes - report.seenAt);
    const fade = 1 - 0.65 * Math.min(1, age / ENEMY_INTEL_MAX_AGE);
    const hair = 1 / this.zoom;
    const s = this.symbolScale();
    const { x, y } = report.position;

    // Ground the formation has probably covered since: well under a march rate on average, as
    // formations spend most of the day halted, deploying or fighting
    const radius = Math.min(220, 12 + age * 5);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(194, 39, 45, 0.04)';
    ctx.strokeStyle = 'rgba(194, 39, 45, 0.7)';
    ctx.lineWidth = hair;
    ctx.setLineDash([4 * hair, 4 * hair]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (report.moving) this.renderProbableCourse(ctx, report.position, report.heading, Math.max(50, Math.min(180, radius)), fade);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = fade;
    if (report.level === 'identified') {
      ctx.save();
      ctx.globalAlpha = fade * 0.75;
      drawUnitSymbol(ctx, unit, 'hostile', { dashed: true });
      ctx.restore();
      if (this.zoom >= 0.55) {
        ctx.font = font(600, 7.5);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        haloText(ctx, designationFor(unit), DIAMOND_R + 3, 2.5, MAP.inkMuted);
      }
    } else {
      tracePathFrame(ctx, 'hostile');
      ctx.fillStyle = 'rgba(255, 128, 128, 0.25)';
      ctx.fill();
      ctx.setLineDash([2.5, 2]);
      ctx.strokeStyle = MAP.hostileLine;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = font(700, 10);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = MAP.hostileLine;
      ctx.fillText('?', 0, 0.5);
    }
    const clock = 7 * 60 + Math.floor(report.seenAt);
    const hhmm = `${String(Math.floor(clock / 60)).padStart(2, '0')}${String(clock % 60).padStart(2, '0')}`;
    ctx.font = font(600, 6.2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    haloText(ctx, `LAST SEEN ${hhmm}`, 0, DIAMOND_R + 2, MAP.hostileLine);
    ctx.restore();
  }

  // Contact marker: APP-6 dashed (suspect) hostile frame for unidentified fog-of-war contacts
  private renderContactDiamond(ctx: CanvasRenderingContext2D, unit: Unit, isHovered: boolean) {
    const s = this.symbolScale();
    ctx.save();
    ctx.translate(unit.position.x, unit.position.y);
    ctx.scale(s, s);

    tracePathFrame(ctx, 'hostile');
    ctx.fillStyle = 'rgba(255, 128, 128, 0.35)';
    ctx.fill();
    ctx.setLineDash([2.5, 2]);
    ctx.strokeStyle = isHovered ? MAP.select : MAP.hostileLine;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = font(700, 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = MAP.hostileLine;
    ctx.fillText('?', 0, 0.5);

    ctx.font = font(600, 6.5);
    ctx.textBaseline = 'top';
    const tag = unit.estimatedStrength ? `CONTACT · ${unit.estimatedStrength}` : 'CONTACT';
    haloText(ctx, tag, 0, DIAMOND_R + 2, MAP.hostileLine);
    ctx.restore();
  }

  // =========================================================================
  // 12. MILITARY UNITS — APP-6 symbology on a light topographic sheet
  // Pass 1: true-scale formation footprints (rotated with heading)
  // Pass 2: upright, zoom-compensated symbols with designation, bars and one status chip
  // =========================================================================
  private renderMilitaryUnits(
    ctx: CanvasRenderingContext2D,
    state: SimulationState,
    hoveredUnitId: string | null
  ) {
    const visible: { unit: Unit; matchesFilter: boolean }[] = [];
    const contacts: Unit[] = [];
    const lostContacts: { unit: Unit; report: EnemyIntel }[] = [];

    for (const unit of state.units) {
      if (unit.status === 'shattered' || unit.strength <= 0) continue;

      if (state.fogOfWarEnabled && unit.faction !== state.playerFaction) {
        if (unit.detectionState === 'hidden') {
          const report = state.enemyIntel?.[unit.id];
          if (report) lostContacts.push({ unit, report });
          continue;
        }
        if (unit.detectionState === 'contact') {
          contacts.push(unit);
          continue;
        }
      }

      let matchesFilter = true;
      if (this.activeFilter !== 'all') {
        if (this.activeFilter === 'french' || this.activeFilter === 'allies') {
          matchesFilter = unit.faction === this.activeFilter;
        } else if (unit.faction !== state.playerFaction) {
          matchesFilter = false;
        } else if (this.activeFilter === 'infantry') {
          matchesFilter = unit.type === 'infantry' || unit.type === 'guard';
        } else {
          matchesFilter = unit.type === this.activeFilter;
        }
      }
      visible.push({ unit, matchesFilter });
    }

    const isSelected = (u: Unit) => !!state.selectedUnitIds?.includes(u.id) || u.id === state.selectedUnitId;

    // Formations that have detached part of their strength carry the (−) amplifier
    this.reducedUnitIds.clear();
    for (const u of state.units) {
      const cut = u.id.lastIndexOf('_det_');
      if (cut > 0 && u.status !== 'shattered') this.reducedUnitIds.add(u.id.slice(0, cut));
    }

    // Pass 1 — footprints & combat effects (world scale)
    for (const { unit, matchesFilter } of visible) {
      ctx.save();
      ctx.globalAlpha = matchesFilter ? 1 : 0.25;
      this.renderUnitFootprint(ctx, unit, unit.faction === state.playerFaction);
      ctx.restore();
    }

    // Enemy situation: last known positions of lost contacts, then current unidentified contacts
    for (const { unit, report } of lostContacts) {
      this.renderLostContact(ctx, state, unit, report);
    }
    for (const unit of contacts) {
      const report = state.enemyIntel?.[unit.id];
      if (report?.moving) this.renderProbableCourse(ctx, unit.position, unit.heading, 70, 1);
      this.renderContactDiamond(ctx, unit, hoveredUnitId === unit.id);
    }

    // Pass 2 — symbols. Selected & hovered draw last so they sit on top of neighbours.
    const rank = (u: Unit) => (isSelected(u) ? 2 : u.id === hoveredUnitId ? 1 : 0);
    visible.sort((a, b) => rank(a.unit) - rank(b.unit));
    for (const { unit, matchesFilter } of visible) {
      this.renderUnitSymbol(ctx, state, unit, matchesFilter, isSelected(unit), unit.id === hoveredUnitId);
    }
  }

  private reducedUnitIds = new Set<string>();

  private footprintSize(unit: Unit): { lw: number; lh: number } {
    if (unit.type === 'headquarters') return { lw: 12, lh: 8 };
    if (unit.type === 'artillery') return { lw: 28, lh: 12 };
    switch (unit.formation) {
      case 'line': return { lw: 34, lh: 6 };
      case 'column': return { lw: 10, lh: 22 };
      case 'square': return { lw: 18, lh: 18 };
      default: return { lw: 24, lh: 8 };
    }
  }

  private renderUnitFootprint(ctx: CanvasRenderingContext2D, unit: Unit, isFriendly: boolean) {
    const line = isFriendly ? MAP.friendLine : MAP.hostileLine;
    const { lw, lh } = this.footprintSize(unit);
    const hair = 1 / this.zoom;
    const now = performance.now();

    ctx.translate(unit.position.x, unit.position.y);
    ctx.rotate(unit.heading);

    // Formation footprint — actual frontage & depth on the ground
    ctx.fillStyle = isFriendly ? 'rgba(11, 94, 168, 0.16)' : 'rgba(194, 39, 45, 0.16)';
    ctx.strokeStyle = isFriendly ? 'rgba(11, 94, 168, 0.55)' : 'rgba(194, 39, 45, 0.55)';
    ctx.lineWidth = hair;
    ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
    ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);

    // Facing tick on the front edge
    ctx.fillStyle = line;
    ctx.beginPath();
    ctx.moveTo(lw / 2 + 4, 0);
    ctx.lineTo(lw / 2, -2.6);
    ctx.lineTo(lw / 2, 2.6);
    ctx.closePath();
    ctx.fill();

    // Field fortification (holding): APP-6 style toothed line along the front
    if (unit.status === 'holding' || unit.status === 'entrenching') {
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = Math.max(hair, 1);
      const fx = lw / 2 + 2;
      const span = Math.max(lh / 2 + 3, 8);
      ctx.beginPath();
      ctx.moveTo(fx, -span);
      ctx.lineTo(fx, span);
      for (let y = -span + 2; y <= span - 1; y += 4) {
        ctx.moveTo(fx, y);
        ctx.lineTo(fx + 2.5, y + 1);
      }
      ctx.stroke();
    }

    // Skirmish screen: dotted picket line ahead of the formation
    if (unit.isSkirmishScreenActive) {
      const sx = lw / 2 + 14;
      const span = Math.max(lh / 2 + 6, 12);
      ctx.fillStyle = 'rgba(13, 148, 136, 0.85)';
      for (let y = -span; y <= span; y += 5) {
        ctx.beginPath();
        ctx.arc(sx, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sustainment radius
    if (unit.type === 'supply') {
      ctx.strokeStyle = 'rgba(21, 128, 61, 0.45)';
      ctx.lineWidth = hair;
      ctx.setLineDash([6 / this.zoom, 5 / this.zoom]);
      ctx.beginPath();
      ctx.arc(0, 0, unit.supplyRadius || 180, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Direct fire sector while engaging
    if (unit.status === 'engaging' && unit.ammo > 0) {
      const fx = lw / 2 + 1;
      const rng = Math.min(85, unit.range || 100);
      const half = 0.3;
      ctx.fillStyle = 'rgba(234, 88, 12, 0.045)';
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.3)';
      ctx.lineWidth = hair;
      ctx.beginPath();
      ctx.moveTo(fx, -lh / 4);
      ctx.arc(fx, 0, rng, -half, half);
      ctx.lineTo(fx, lh / 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Frontline volley pulse with short tracers. The tracer pattern is fixed for each volley
      // cycle (seeded), rather than re-randomised every frame, so it reads as fire, not flicker.
      const phase = now + unit.id.charCodeAt(0) * 120;
      const pulse = 0.5 + 0.5 * Math.sin(phase / 140);
      ctx.strokeStyle = `rgba(254, 240, 138, ${0.75 * pulse})`;
      ctx.lineWidth = 1.5;
      const span = Math.max(lh, 14); // match the original chit-height firing front
      ctx.beginPath();
      ctx.moveTo(fx + 1, -span / 2);
      ctx.lineTo(fx + 1, span / 2);
      ctx.stroke();
      if (pulse > 0.6) {
        let seed = (Math.floor(phase / (Math.PI * 280)) * 2654435761 + unit.id.length * 97) >>> 0;
        const rnd = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        ctx.strokeStyle = `rgba(254, 240, 138, ${0.9 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let ty = -span * 0.35; ty <= span * 0.35; ty += 6) {
          const startDist = fx + 3 + rnd() * 6;
          const tracerLen = 6 + rnd() * 8;
          ctx.moveTo(startDist, ty);
          ctx.lineTo(startDist + tracerLen, ty);
        }
        ctx.stroke();
      }
    }

    // Charge: chevrons surging forward
    if (unit.status === 'charging') {
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 1.4;
      const off = ((now / 60) % 10) * 0.6;
      for (let i = 0; i < 2; i++) {
        const cx = lw / 2 + 5 + i * 5 + off;
        ctx.beginPath();
        ctx.moveTo(cx, -5);
        ctx.lineTo(cx + 4, 0);
        ctx.lineTo(cx, 5);
        ctx.stroke();
      }
    }
  }

  private unitStatusChip(unit: Unit): { text: string; color: string } | null {
    const ratioAmmo = unit.ammo / Math.max(1, unit.maxAmmo);
    if (unit.status === 'routing') return { text: 'ROUTING', color: '#b91c1c' };
    if (unit.status === 'melee') return { text: 'MELEE', color: '#7f1d1d' };
    if (unit.status === 'charging') return { text: 'CHARGING', color: '#c2410c' };
    if (unit.status === 'wavering' || (unit.morale <= 50 && unit.morale > 25)) return { text: 'WAVERING', color: '#b45309' };
    if (unit.ammo !== undefined && unit.ammo <= 0) return { text: 'NO AMMO', color: '#7f1d1d' };
    if (unit.isEncircled) return { text: 'ISOLATED', color: '#b91c1c' };
    if (unit.isEnfiladed) return { text: 'ENFILADED', color: '#b91c1c' };
    if (unit.currentOrder?.type === 'bombard' && unit.currentOrder.status === 'executing') return { text: 'FIRE MISSION', color: '#c2410c' };
    if (unit.canisterActive) return { text: 'CANISTER', color: '#c2410c' };
    if (unit.status === 'entrenching') return { text: 'DIGGING IN', color: '#78716c' };
    if (unit.currentOrder?.status === 'delivering') return { text: 'ORDER EN ROUTE', color: '#1d4ed8' };
    if (unit.ammo !== undefined && ratioAmmo < 0.2) return { text: 'LOW AMMO', color: '#b45309' };
    if (unit.isResupplying) return { text: 'RESUPPLY', color: '#15803d' };
    if (unit.isForcedMarch) return { text: 'FORCED MARCH', color: '#78716c' };
    if (unit.isWadingRiver) return { text: 'FORDING', color: '#2f6fb3' };
    if (unit.isGarrisoned) return { text: 'GARRISON', color: '#15803d' };
    return null;
  }

  private renderUnitSymbol(
    ctx: CanvasRenderingContext2D,
    state: SimulationState,
    unit: Unit,
    matchesFilter: boolean,
    isSelected: boolean,
    isHovered: boolean
  ) {
    const s = this.symbolScale();
    const isFriendly = unit.faction === state.playerFaction;
    const isNatoMode = state.wargameSymbology === 'nato';
    const identity: SymbolIdentity = isNatoMode && !isFriendly ? 'hostile' : 'friend';
    const fill = isNatoMode
      ? undefined
      : unit.faction === 'french' ? '#9fb8f0' : '#f2a7a7';
    const { hw, hh } = frameExtents(identity);
    const emphasis = isSelected || isHovered;
    const now = performance.now();

    ctx.save();
    ctx.translate(unit.position.x, unit.position.y);
    ctx.scale(s, s);
    ctx.globalAlpha = matchesFilter ? 1 : 0.28;

    // Soft offset shadow (cheaper and crisper than shadowBlur)
    ctx.save();
    ctx.translate(0.8, 1.2);
    tracePathFrame(ctx, identity);
    ctx.fillStyle = 'rgba(28, 25, 23, 0.22)';
    ctx.fill();
    ctx.restore();

    drawUnitSymbol(ctx, unit, identity, { fill });

    // Routing: blinking warning outline
    if (unit.status === 'routing' && Math.floor(now / 300) % 2 === 0) {
      ctx.save();
      ctx.scale(1.28, 1.28);
      tracePathFrame(ctx, identity);
      ctx.restore();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Selection brackets / hover outline
    if (emphasis) {
      const bx = hw + 4;
      const by = hh + 4;
      const c = 4.5;
      ctx.strokeStyle = isSelected ? MAP.select : 'rgba(28, 25, 23, 0.65)';
      ctx.lineWidth = isSelected ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.moveTo(-bx, -by + c); ctx.lineTo(-bx, -by); ctx.lineTo(-bx + c, -by);
      ctx.moveTo(bx - c, -by); ctx.lineTo(bx, -by); ctx.lineTo(bx, -by + c);
      ctx.moveTo(bx, by - c); ctx.lineTo(bx, by); ctx.lineTo(bx - c, by);
      ctx.moveTo(-bx + c, by); ctx.lineTo(-bx, by); ctx.lineTo(-bx, by - c);
      ctx.stroke();
    }

    // APP-6 operational condition amplifier: one bar under the frame, green / amber / red / black
    const barW = identity === 'hostile' ? DIAMOND_R * 1.7 : FRAME_W;
    let y = hh + 1.2;
    ctx.fillStyle = conditionColor(combatEffectiveness(unit));
    ctx.fillRect(-barW / 2, y, barW, 2.4);
    ctx.strokeStyle = MAP.ink;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-barW / 2, y, barW, 2.4);
    y += 3.2;

    // Direction of movement (field Q): from the foot of the HQ staff, or the bottom centre of the frame
    if (unit.status === 'marching' || unit.status === 'charging' || unit.status === 'routing') {
      const ox = unit.type === 'headquarters' ? -hw : 0;
      const oy = unit.type === 'headquarters' ? hh + 9 : y;
      const len = 15;
      const ex = ox + Math.cos(unit.heading) * len;
      const ey = oy + Math.sin(unit.heading) * len;
      ctx.strokeStyle = MAP.ink;
      ctx.fillStyle = MAP.ink;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(unit.heading) * 2.5, ey + Math.sin(unit.heading) * 2.5);
      ctx.lineTo(ex + Math.cos(unit.heading + 2.4) * 3.5, ey + Math.sin(unit.heading + 2.4) * 3.5);
      ctx.lineTo(ex + Math.cos(unit.heading - 2.4) * 3.5, ey + Math.sin(unit.heading - 2.4) * 3.5);
      ctx.closePath();
      ctx.fill();
    }

    // Reinforced / reduced (field F): (−) once the formation has detached part of its strength
    if (this.reducedUnitIds.has(unit.id)) {
      ctx.font = font(700, 5.8);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      haloText(ctx, '(−)', hw + 1.5, -hh - 0.5, MAP.ink, 2);
    }

    // Designation (T) and higher formation (M) to the right of the frame
    const showLabels = this.zoom >= 0.55 || emphasis;
    const showDetail = this.zoom >= 1.05 || emphasis;
    if (showLabels) {
      const lx = hw + 3;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(600, 7.5);
      haloText(ctx, designationFor(unit), lx, showDetail ? -0.5 : 2.5, MAP.ink);
      if (showDetail) {
        ctx.font = font(500, 5.8);
        haloText(ctx, higherFormationFor(unit), lx, 6.3, MAP.inkMuted, 2.2);
      }
    }

    // Single highest-priority status chip
    const chip = showLabels ? this.unitStatusChip(unit) : null;
    if (chip) {
      ctx.font = font(700, 5.3);
      const tw = ctx.measureText(chip.text).width;
      const cy = y + 1;
      ctx.fillStyle = chip.color;
      this.roundRect(ctx, -tw / 2 - 2.5, cy, tw + 5, 7, 1.5);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(chip.text, 0, cy + 3.8);
    }

    // SITREP [LOCATE] beacon
    if (unit.id === state.locatedUnitId && state.locatedUnitHighlightUntil && Date.now() < state.locatedUnitHighlightUntil) {
      const t = (now % 1200) / 1200;
      ctx.strokeStyle = `rgba(217, 119, 6, ${1 - t})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + t * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = MAP.select;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -30); ctx.lineTo(0, -19);
      ctx.moveTo(0, 19); ctx.lineTo(0, 30);
      ctx.moveTo(-30, 0); ctx.lineTo(-19, 0);
      ctx.moveTo(19, 0); ctx.lineTo(30, 0);
      ctx.stroke();
    }

    ctx.restore();
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }



  // =========================================================================
  // 13. VISUAL EFFECTS (GENERIC NATO TACTICAL TRACERS, BALLISTIC ORDNANCE & IMPACTS)
  // Clean, military symbology adapted per scenario era (Napoleonic solid roundshot & musket smoke vs Modern NATO ordnance & tracers)
  // =========================================================================
  // 14. AUTHENTIC WEST POINT ATLAS CARTOUCHE & MAP LEGEND
  // Exact layout from media_1789975155849.png
  // MGRS kilometre values pinned to the viewport edges (as on C2 map displays), so the grid
  // can be read at any zoom without hunting for the sheet margin.
  private renderGridEdgeLabels(ctx: CanvasRenderingContext2D, camera: Camera, screenW: number, screenH: number) {
    const z = camera.zoom;
    const toSx = (wx: number) => (wx - camera.x) * z + screenW / 2;
    const toSy = (wy: number) => (wy - camera.y) * z + screenH / 2;
    const top = 40; // below the toolbar
    const bottom = screenH - 30; // above the status bar
    ctx.save();
    ctx.font = font(600, 10, FONT.mono);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (let x = 200; x < 2400; x += 200) {
      const sx = toSx(x);
      if (sx < 30 || sx > screenW - 30) continue;
      haloText(ctx, eastingKm(x), sx, top, MAP.gridLabel, 3);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let y = 200; y < 1500; y += 200) {
      const sy = toSy(y);
      if (sy < top + 16 || sy > bottom) continue;
      haloText(ctx, northingKm(y), 6, sy, MAP.gridLabel, 3);
    }
    ctx.restore();
  }

  private visualProjectiles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    isArtillery?: boolean;
    isCanister?: boolean;
  }[] = [];

  private muzzleFlashes: {
    x: number;
    y: number;
    heading: number;
    life: number;
    maxLife: number;
  }[] = [];

  public spawnSmoke(x: number, y: number, count: number = 2, isHeavy = false) {
    for (let i = 0; i < count; i++) {
      const maxLife = (isHeavy ? 26 : 16) + Math.random() * 8;
      const radius = (isHeavy ? 2.8 : 1.8) + Math.random() * 1.2;
      const alpha = isHeavy ? 0.25 : 0.16;

      this.smokeParticles.push({
        x: x + (Math.random() - 0.5) * (isHeavy ? 6 : 3),
        y: y + (Math.random() - 0.5) * (isHeavy ? 6 : 3),
        radius,
        alpha,
        maxAlpha: alpha,
        vx: 0.02 + (Math.random() - 0.5) * 0.04,
        vy: -0.015 - Math.random() * 0.03,
        life: 0,
        maxLife,
      });
    }
  }

  private lastEffectsTime = 0;

  private updateAndRenderEffects(ctx: CanvasRenderingContext2D, state: SimulationState) {
    // Advance particles in 60 fps "frames" of real time so lifetimes and drift match at any refresh rate
    const nowMs = performance.now();
    const step = this.lastEffectsTime ? Math.min(3, (nowMs - this.lastEffectsTime) / (1000 / 60)) : 1;
    this.lastEffectsTime = nowMs;
    if (state.isRunning) {
      for (const unit of state.units) {
        const isEngaging = unit.status === 'engaging' && unit.ammo !== undefined && unit.ammo > 0;
        const isBombarding = unit.type === 'artillery' && unit.currentOrder?.status === 'executing' && unit.currentOrder.type === 'bombard' && unit.ammo !== undefined && unit.ammo > 0;

        if (isEngaging || isBombarding) {
          const isArtillery = unit.type === 'artillery';
          const fireChance = (isBombarding ? 0.08 : isArtillery ? 0.05 : 0.15) * step;
          
          if (Math.random() < fireChance) {
            // Weapon station coordinates along the unit's front rank
            const w = (unit.width || 50) * 0.6;
            const h = (unit.depth || 16) * 0.6;
            const spread = (Math.random() - 0.5) * w;
            const frontDist = h / 2 + 3;
            
            const px = unit.position.x + Math.cos(unit.heading) * frontDist - Math.sin(unit.heading) * spread;
            const py = unit.position.y + Math.sin(unit.heading) * frontDist + Math.cos(unit.heading) * spread;

            // 1. Realistic small muzzle smoke discharge
            this.spawnSmoke(px, py, isArtillery ? 2 : 1, isArtillery);

            // 2. Subtle micro muzzle flash spark (1-2 frames)
            this.muzzleFlashes.push({
              x: px,
              y: py,
              heading: unit.heading,
              life: 0,
              maxLife: 2,
            });

            // 3. Direct fire: Realistic small micro-tracers (no cartoon balls or parabolic arcs)
            // (Bombardment is visualized cleanly at destination via renderArtilleryImpacts)
            if (!isBombarding) {
              if (isArtillery && unit.canisterActive) {
                // Canister close defense: small fan of subtle micro-flechettes
                for (let k = 0; k < 5; k++) {
                  const spreadAngle = unit.heading + (Math.random() - 0.5) * 0.35;
                  const speed = 9.5 + Math.random() * 2.0;
                  this.visualProjectiles.push({
                    x: px,
                    y: py,
                    vx: Math.cos(spreadAngle) * speed,
                    vy: Math.sin(spreadAngle) * speed,
                    life: 0,
                    maxLife: 6,
                    isArtillery: true,
                    isCanister: true,
                  });
                }
              } else if (isArtillery) {
                // Artillery direct roundshot fire: solid, high-velocity cannon projectile (never musket bullets!)
                const spreadAngle = unit.heading + (Math.random() - 0.5) * 0.04;
                const speed = 12.0 + Math.random() * 2.0;
                this.visualProjectiles.push({
                  x: px,
                  y: py,
                  vx: Math.cos(spreadAngle) * speed,
                  vy: Math.sin(spreadAngle) * speed,
                  life: 0,
                  maxLife: 9,
                  isArtillery: true,
                  isCanister: false,
                });
              } else {
                // Musket volley / direct small arms fire: subtle, razor-thin micro-tracer line
                const spreadAngle = unit.heading + (Math.random() - 0.5) * 0.10;
                const speed = 8.5 + Math.random() * 2.0;
                this.visualProjectiles.push({
                  x: px,
                  y: py,
                  vx: Math.cos(spreadAngle) * speed,
                  vy: Math.sin(spreadAngle) * speed,
                  life: 0,
                  maxLife: 8,
                });
              }
            }
          }
        }
      }
    }

    ctx.save();

    // 1. Subtle, realistic micro muzzle flash sparks
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const mf = this.muzzleFlashes[i];
      mf.life += step;
      if (mf.life >= mf.maxLife) {
        this.muzzleFlashes.splice(i, 1);
        continue;
      }
      const alpha = 1 - mf.life / mf.maxLife;
      ctx.save();
      ctx.translate(mf.x, mf.y);
      ctx.rotate(mf.heading);
      ctx.strokeStyle = `rgba(254, 240, 138, ${0.85 * alpha})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(3.5, 0);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Realistic small direct-fire micro-tracers (razor-thin, fast line ticks - no large balls or circles!)
    for (let i = this.visualProjectiles.length - 1; i >= 0; i--) {
      const p = this.visualProjectiles[i];
      p.life += step;
      p.x += p.vx * step;
      p.y += p.vy * step;

      if (p.life >= p.maxLife) {
        this.visualProjectiles.splice(i, 1);
        continue;
      }

      const alpha = Math.max(0, 0.75 * (1 - p.life / p.maxLife));
      ctx.beginPath();
      if (p.isArtillery && !p.isCanister) {
        // Solid cannon roundshot tracer: longer, heavier stroke
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.65, p.y - p.vy * 0.65);
        ctx.strokeStyle = `rgba(254, 215, 170, ${alpha * 1.1})`;
        ctx.lineWidth = 2.0;
      } else if (p.isCanister) {
        // Canister flechette / pellet spark
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.35, p.y - p.vy * 0.35);
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.lineWidth = 1.1;
      } else {
        // Musket bullet line
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.4, p.y - p.vy * 0.4);
        ctx.strokeStyle = `rgba(254, 240, 138, ${alpha})`;
        ctx.lineWidth = 0.75;
      }
      ctx.stroke();
    }

    // 3. Gunpowder Smoke Puffs Drifting with Wind
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.radius += 0.06 * step;
      p.alpha = p.maxAlpha * (1 - p.life / p.maxLife);

      if (p.life >= p.maxLife) {
        this.smokeParticles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212, 212, 216, ${p.alpha})`;
      ctx.fill();
    }

    ctx.restore();
  }

  // Screen-space map furniture: north arrow and a scale bar that tracks zoom (1px = 5m)
  private renderMapFurniture(ctx: CanvasRenderingContext2D, screenH: number) {
    const x0 = 16;
    const y0 = screenH - 50;
    const metersPerScreenPx = 5 / this.zoom;
    const steps = [100, 200, 250, 500, 1000, 2000];
    let meters = steps[0];
    for (const m of steps) if (m / metersPerScreenPx <= 170) meters = m;
    const len = meters / metersPerScreenPx;

    ctx.save();
    ctx.fillStyle = 'rgba(250, 248, 242, 0.88)';
    ctx.strokeStyle = 'rgba(28, 25, 23, 0.18)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x0 - 8, y0 - 22, Math.max(len + 64, 196), 40, 2);
    ctx.fill();
    ctx.stroke();

    // North arrow
    const nx = x0 + 6;
    ctx.fillStyle = MAP.ink;
    ctx.beginPath();
    ctx.moveTo(nx, y0 - 13);
    ctx.lineTo(nx + 5, y0 + 6);
    ctx.lineTo(nx, y0 + 2);
    ctx.lineTo(nx - 5, y0 + 6);
    ctx.closePath();
    ctx.fill();
    ctx.font = font(700, 8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', nx, y0 + 7);

    // Alternating scale bar
    const sx = x0 + 24;
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      ctx.fillStyle = i % 2 === 0 ? MAP.ink : '#faf8f2';
      ctx.fillRect(sx + (len / segs) * i, y0 - 2, len / segs, 4);
    }
    ctx.strokeStyle = MAP.ink;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(sx, y0 - 2, len, 4);

    ctx.font = font(500, 9, FONT.mono);
    ctx.fillStyle = MAP.ink;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText('0', sx - 2, y0 - 5);
    ctx.textAlign = 'right';
    ctx.fillText(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, sx + len + 2, y0 - 5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = MAP.inkMuted;
    ctx.font = font(500, 8);
    ctx.fillText(`${GZD} ${SQUARE} · 1 km grid · 10 m contours`, sx, y0 + 5);
    ctx.restore();
  }

}
