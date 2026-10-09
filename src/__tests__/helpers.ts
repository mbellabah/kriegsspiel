import { vi } from 'vitest';
import { BattleEngine } from '../engine/simulation';
import { REALISTIC_AUSTERLITZ_SCENARIO } from '../data/austerlitzScenario';
import type { TacticalDispatchContext } from '../services/llmDispatchService';

/**
 * The engine gates its heavy tactical passes on wall-clock time (performance.now). Tests run far
 * faster than real time, so they drive a fake clock that advances with each simulated frame.
 */
export function createBattle() {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const engine = new BattleEngine(REALISTIC_AUSTERLITZ_SCENARIO);
  const state = engine.getState();
  const frame = (dt = 1 / 60) => {
    now += dt * 1000;
    engine.tick(dt);
  };
  /** Advance by real seconds at 60 fps (battle time depends on the speed setting). */
  const run = (realSeconds: number) => {
    const frames = Math.round(realSeconds * 60);
    for (let i = 0; i < frames; i++) frame();
  };
  /** Advance until the battle clock reaches the given minute. */
  const runUntil = (battleMinutes: number) => {
    while (state.timeMinutes < battleMinutes) frame();
  };
  return { engine, state, frame, run, runUntil };
}

export function unit(engine: BattleEngine, id: string) {
  const u = engine.getState().units.find((x) => x.id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
}

/** Same context the Orders desk builds for the dispatch parser. */
export function dispatchContext(engine: BattleEngine, defaultRecipientId: string | null = null): TacticalDispatchContext {
  const state = engine.getState();
  return {
    playerUnits: state.units.filter((u) => u.faction === state.playerFaction && u.status !== 'shattered'),
    enemyUnits: state.units.filter((u) => u.faction !== state.playerFaction && u.status !== 'shattered'),
    landmarks: state.terrain
      .filter((t) => t.center && ['village', 'hill', 'ridge', 'lake', 'bridge', 'road'].includes(t.type))
      .map((t) => ({ name: t.name, position: t.center, type: t.type, elevation: t.elevation })),
    currentTimeMinutes: state.timeMinutes,
    trps: state.targetReferencePoints,
    defaultRecipientId,
  };
}

/** Keep tests deterministic: never consult a local language model. */
export function disableLanguageModel() {
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'dispatch.localModel' ? '0' : null) });
}
