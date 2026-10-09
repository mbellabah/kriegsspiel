import { describe, expect, it } from 'vitest';
import { createBattle, unit } from './helpers';
import { BASE_TIME_COMPRESSION } from '../engine/simulation';
import type { Unit } from '../types/game';

describe('time compression', () => {
  it('defaults to 10x real time', () => {
    const { engine, state, run } = createBattle();
    expect(state.speedMultiplier * BASE_TIME_COMPRESSION).toBeCloseTo(10);
    engine.setRunning(true);
    run(60);
    expect(state.timeMinutes).toBeCloseTo(10, 0); // 60 real seconds = 10 battle minutes
  });
});

describe('march rates (battle time, column, open ground)', () => {
  // Period rates: infantry ~3-4 km/h, cavalry walk ~6 km/h and gallop in the charge, foot artillery ~3.5 km/h
  const measure = (id: string, type: 'march' | 'charge') => {
    const { engine, state, frame } = createBattle();
    const u = unit(engine, id);
    for (const o of state.units) if (o.id !== u.id) o.position = { x: 2390, y: 1490 };
    u.position = { x: 300, y: 750 };
    u.heading = 0;
    u.formation = 'column';
    if (u.speed === 0) u.speed = 1; // fixed batteries: measure as if limbered
    engine.issueOrder(u.id, { unitId: u.id, type, destination: { x: 2200, y: 750 }, waypoints: [], plannedTime: 0, targetFormation: 'column' });
    engine.setRunning(true);
    while (u.currentOrder?.status !== 'executing') frame();
    for (let i = 0; i < 60; i++) frame();
    const x0 = u.position.x;
    const t0 = state.timeMinutes;
    while (state.timeMinutes - t0 < 5) frame();
    return ((u.position.x - x0) * 5) / 5 * 0.06; // px -> m -> per minute -> km/h
  };

  it.each([
    ['fr_friant', 'march', 2.8, 4.2],
    ['fr_friant', 'charge', 4, 5.5],
    ['fr_nansouty', 'march', 5, 7],
    ['fr_nansouty', 'charge', 15, 25],
    ['fr_artillery_santon', 'march', 2.8, 4.2],
    ['fr_artillery_guard', 'march', 4.5, 7],
  ] as const)('%s %s between %s and %s km/h', (id, type, lo, hi) => {
    const kmh = measure(id, type);
    expect(kmh).toBeGreaterThanOrEqual(lo);
    expect(kmh).toBeLessThanOrEqual(hi);
  });
});

describe('combat stability (no jitter)', () => {
  // Records 10 real seconds of a live battle at 60 fps and counts frame-to-frame reversals
  const observe = (warmupRealSeconds: number) => {
    const { engine, state, run, frame } = createBattle();
    engine.setSpeedMultiplier(1); // 30x, as the measurements were taken
    engine.setRunning(true);
    run(warmupRealSeconds);
    const hist = new Map<string, { x: number; y: number; h: number; s: Unit['status'] }[]>();
    for (let f = 0; f < 600; f++) {
      frame();
      for (const u of state.units) {
        if (u.status === 'shattered') continue;
        const a = hist.get(u.id) || [];
        a.push({ x: u.position.x, y: u.position.y, h: u.heading, s: u.status });
        hist.set(u.id, a);
      }
    }
    let statusFlips = 0;
    let headingReversals = 0;
    let positionReversals = 0;
    for (const [, a] of hist) {
      for (let i = 2; i < a.length; i++) {
        if (a[i].s !== a[i - 1].s) statusFlips++;
        const h1 = a[i - 1].h - a[i - 2].h;
        const h2 = a[i].h - a[i - 1].h;
        if (Math.abs(h1) > 1e-4 && Math.abs(h2) > 1e-4 && h1 * h2 < 0) headingReversals++;
        const d1x = a[i - 1].x - a[i - 2].x, d1y = a[i - 1].y - a[i - 2].y;
        const d2x = a[i].x - a[i - 1].x, d2y = a[i].y - a[i - 1].y;
        if (Math.hypot(d1x, d1y) > 0.02 && Math.hypot(d2x, d2y) > 0.02 && d1x * d2x + d1y * d2y < 0) positionReversals++;
      }
    }
    return { statusFlips, headingReversals, positionReversals };
  };

  // Before the fixes: ~160 status flips at 08:05 and ~1,000 heading reversals later in the day
  it('early contact (08:05)', () => {
    const m = observe(120);
    expect(m.statusFlips).toBeLessThan(20);
    expect(m.headingReversals).toBeLessThan(30);
    expect(m.positionReversals).toBeLessThan(10);
  });

  it('heavy fighting (12:05)', () => {
    const m = observe(600);
    expect(m.statusFlips).toBeLessThan(60);
    expect(m.headingReversals).toBeLessThan(60);
    expect(m.positionReversals).toBeLessThan(20);
  });
});

describe('rewind', () => {
  it('restores the latest snapshot at or before the target and discards the future', () => {
    const { engine, state, runUntil } = createBattle();
    engine.setSpeedMultiplier(1); // 30x: same simulation, fewer frames
    engine.setRunning(true);
    runUntil(90);
    const lossesAt90 = state.frenchLosses + state.alliedLosses;
    engine.scrubToTime(40);

    expect(state.isRunning).toBe(false);
    expect(state.timeMinutes).toBeLessThanOrEqual(40);
    expect(state.timeMinutes).toBeGreaterThan(30); // snapshots every 8 minutes
    expect(state.snapshots.every((s) => s.timeMinutes <= state.timeMinutes)).toBe(true);
    expect(state.artilleryImpacts.every((i) => i.timeMinutes <= state.timeMinutes)).toBe(true);
    expect(state.sitrepNotifications.every((n) => n.timestamp <= state.timeMinutes)).toBe(true);
    expect(state.frenchLosses + state.alliedLosses).toBeLessThanOrEqual(lossesAt90);
  });

  it('keeps units and the active-order list pointing at the same order objects', () => {
    const { engine, state, runUntil } = createBattle();
    engine.setSpeedMultiplier(1); // 30x: same simulation, fewer frames
    engine.setRunning(true);
    runUntil(60);
    engine.scrubToTime(30);
    for (const order of state.activeOrders) {
      const owner = state.units.find((u) => u.currentOrder?.id === order.id);
      if (owner) expect(owner.currentOrder).toBe(order);
    }
  });

  it('cannot jump forward into time that has not been played', () => {
    const { engine, state, runUntil } = createBattle();
    engine.setSpeedMultiplier(1); // 30x: same simulation, fewer frames
    engine.setRunning(true);
    runUntil(20);
    const t = state.timeMinutes;
    engine.scrubToTime(200);
    expect(state.timeMinutes).toBe(t);
  });
});

describe('contact reports', () => {
  it('does not identify an enemy that fog of war has not identified', () => {
    const { engine, state } = createBattle();
    state.fogOfWarEnabled = true;
    const own = unit(engine, 'fr_vandamme');
    const enemy = unit(engine, 'al_kollowrat');
    enemy.detectionState = 'contact';
    enemy.estimatedStrength = '~5,000 - 7,000';
    engine.triggerContactSitrep(own, 'direct_fire', enemy);
    const report = state.sitrepNotifications[0];
    expect(report.report?.kind).toBe('SPOTREP');
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/KOLLOWRAT/i);
    expect(report.report?.lines.find(([k]) => k === 'Unit')?.[1]).toBe('Not identified');
  });

  it('reports size, activity, location (MGRS), unit, time and equipment once identified', () => {
    const { engine, state } = createBattle();
    const own = unit(engine, 'fr_vandamme');
    const enemy = unit(engine, 'al_kollowrat');
    engine.triggerContactSitrep(own, 'direct_fire', enemy);
    const lines = Object.fromEntries(state.sitrepNotifications[0].report!.lines);
    expect(Object.keys(lines)).toEqual(['Size', 'Activity', 'Location', 'Unit', 'Time', 'Equipment']);
    expect(lines.Location).toMatch(/^XQ \d{4} \d{4}/);
    expect(lines.Unit).toMatch(/KOLLOWRAT/);
  });
});
