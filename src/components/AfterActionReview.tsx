import React, { useEffect, useMemo } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { Vector2D } from '../types/game';
import { GlyphClose } from './glyphs';
import { TimeSeriesChart, ChartLegend, fmt, clock, FRA_COLOR, ALL_COLOR } from './AttritionPanel';

// After-action review: outcome summary, casualty curve, losses by 30-minute phase, key events,
// and a replay of the battle on the map from the recorded snapshots.

interface AfterActionReviewProps {
  engine: BattleEngine;
  state: SimulationState;
  replayTime: number | null;
  isReplaying: boolean;
  onReplayTime: (t: number | null) => void;
  onTogglePlay: () => void;
  onClose: () => void;
  onFocusLocation?: (loc: Vector2D) => void;
}

const SIDE_SERIES = [
  { label: 'FRA', color: FRA_COLOR },
  { label: 'ALL', color: ALL_COLOR },
];

const lossesAt = (history: SimulationState['lossHistory'], t: number) => {
  let best = history[0] || { t: 0, french: 0, allies: 0 };
  for (const h of history) {
    if (h.t <= t) best = h;
    else break;
  }
  return best;
};

export const AfterActionReview: React.FC<AfterActionReviewProps> = ({
  engine,
  state,
  replayTime,
  isReplaying,
  onReplayTime,
  onTogglePlay,
  onClose,
  onFocusLocation,
}) => {
  const now = state.timeMinutes;
  const lastSnap = state.snapshots[state.snapshots.length - 1]?.timeMinutes ?? 0;
  const replayEnd = Math.max(lastSnap, 0);

  // Stop the live battle while reviewing
  useEffect(() => {
    if (state.isRunning) engine.setRunning(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const player = state.playerFaction;
  const summary = useMemo(() => {
    const side = (f: string) => {
      const us = state.units.filter((u) => u.faction === f);
      return {
        destroyed: us.filter((u) => u.status === 'shattered' || u.strength <= 0).length,
        total: us.length,
        str: us.reduce((a, u) => a + Math.max(0, u.strength), 0),
        init: us.reduce((a, u) => a + u.initialStrength, 0),
      };
    };
    return { fra: side('french'), all: side('allies') };
  }, [state.units]);

  const objectives = (state.operationalGraphics || [])
    .filter((g) => g.type === 'objective' && g.points[0])
    .map((g) => {
      const p = g.points[0];
      const near = (f: boolean) =>
        state.units.some(
          (u) => (u.faction === player) === f && u.status !== 'shattered' && u.strength > 0 && Math.hypot(u.position.x - p.x, u.position.y - p.y) <= 80
        );
      const own = near(true);
      const enemy = near(false);
      return { name: g.name, status: own && !enemy ? 'Held' : enemy && !own ? 'Enemy' : own && enemy ? 'Contested' : 'Unoccupied' };
    });

  const phases = useMemo(() => {
    const rows: { from: number; to: number; fra: number; all: number; event?: string }[] = [];
    for (let from = 0; from < Math.max(30, now); from += 30) {
      const to = Math.min(from + 30, now);
      if (to <= from) break;
      const a = lossesAt(state.lossHistory, from);
      const b = lossesAt(state.lossHistory, to);
      const ev = state.keyEvents.find((e) => (e.t ?? 0) >= from && (e.t ?? 0) < to && e.importance === 'critical');
      rows.push({ from, to, fra: b.french - a.french, all: b.allies - a.allies, event: ev?.message });
    }
    return rows;
  }, [state.lossHistory, state.keyEvents, now]);

  const exchange = state.frenchLosses > 0 ? state.alliedLosses / state.frenchLosses : null;
  const events = state.keyEvents.filter((e) => e.importance === 'critical' || e.kind === 'order').slice(-80).reverse();

  const Tile: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
    <div className="border border-[#d4d4d8] bg-white px-2 py-1.5">
      <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="text-[15px] font-semibold leading-tight font-mono">{value}</div>
      {sub && <div className="text-[10px] text-neutral-500">{sub}</div>}
    </div>
  );

  return (
    <aside
      aria-label="After-action review"
      className="fixed z-40 right-0 top-10 bottom-7 w-[520px] bg-[#fbfbfa] border-l border-[#a1a1aa] text-black font-sans flex flex-col"
    >
      <div className="flex items-center justify-between h-8 px-3 bg-[#e4e4e7] border-b border-[#a1a1aa] flex-shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-bold">After-action review</span>
          <span className="text-[10px] text-neutral-500">Austerlitz · 0700–{clock(now)}</span>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-neutral-500 hover:text-black hover:bg-[#d4d4d8] cursor-pointer" title="Close">
          <GlyphClose size={11} />
        </button>
      </div>

      {/* Replay control */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[#d4d4d8] flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            if (replayTime === null) onReplayTime(0);
            onTogglePlay();
          }}
          className={`h-6 w-14 text-[10px] font-semibold border cursor-pointer ${
            isReplaying ? 'bg-[#1e3a8a] border-[#1e3a8a] text-white' : 'bg-white border-[#a1a1aa] hover:bg-[#f4f4f5]'
          }`}
        >
          {isReplaying ? 'Pause' : 'Replay'}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(1, replayEnd)}
          step={0.5}
          value={replayTime ?? replayEnd}
          onChange={(e) => onReplayTime(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-[#a1a1aa] appearance-none cursor-pointer accent-[#1e3a8a]"
          aria-label="Replay time"
        />
        <span className="font-mono text-[11px] w-10 text-right">{replayTime === null ? 'Live' : clock(replayTime)}</span>
        <button
          type="button"
          disabled={replayTime === null}
          onClick={() => onReplayTime(null)}
          className="h-6 px-2 text-[10px] border border-[#a1a1aa] bg-white hover:bg-[#f4f4f5] disabled:text-neutral-400 cursor-pointer disabled:cursor-default"
          title="Return the map to the live battle"
        >
          Live
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4">
        <div className="grid grid-cols-4 gap-1.5 mt-3">
          <Tile label="Duration" value={`${Math.floor(now / 60)}h ${String(Math.round(now % 60)).padStart(2, '0')}m`} />
          <Tile label="Casualties FRA" value={fmt(state.frenchLosses)} sub={`${Math.round((summary.fra.str / Math.max(1, summary.fra.init)) * 100)}% strength left`} />
          <Tile label="Casualties ALL" value={fmt(state.alliedLosses)} sub={`${Math.round((summary.all.str / Math.max(1, summary.all.init)) * 100)}% strength left`} />
          <Tile label="Exchange ratio" value={exchange === null ? '—' : `${exchange.toFixed(2)}:1`} sub="Allied per French loss" />
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <Tile label="Formations destroyed" value={`${summary.fra.destroyed} / ${summary.all.destroyed}`} sub="France / Allies" />
          <Tile
            label="Objectives"
            value={`${objectives.filter((o) => o.status === 'Held').length} / ${objectives.length} held`}
            sub={objectives.map((o) => `${o.name.replace(/^OBJ /, '')}: ${o.status.toLowerCase()}`).join(' · ')}
          />
        </div>

        <div className="mt-4 text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500">Cumulative casualties</div>
        {state.lossHistory.length > 1 ? (
          <>
            <TimeSeriesChart
              points={state.lossHistory.map((h) => ({ t: h.t, values: [h.french, h.allies] }))}
              series={SIDE_SERIES}
              width={494}
              height={140}
              markerT={replayTime}
              ariaLabel="Cumulative casualties by side over the battle"
            />
            <ChartLegend series={[{ label: 'France', color: FRA_COLOR }, { label: 'Allies', color: ALL_COLOR }]} />
          </>
        ) : (
          <p className="text-[11px] text-neutral-500 py-4">No fighting recorded yet.</p>
        )}

        <div className="mt-4 text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500">Losses by phase</div>
        <table className="w-full text-[11px] mt-1">
          <thead>
            <tr className="text-[9px] font-mono uppercase text-neutral-500">
              <th className="text-left font-normal py-1">Phase</th>
              <th className="text-right font-normal">FRA</th>
              <th className="text-right font-normal">ALL</th>
              <th className="text-right font-normal pr-2">Exch.</th>
              <th className="text-left font-normal">Key event</th>
            </tr>
          </thead>
          <tbody>
            {phases.map((p) => (
              <tr
                key={p.from}
                className="border-t border-[#e4e4e7] hover:bg-[#f4f4f5] cursor-pointer align-top"
                onClick={() => onReplayTime(Math.min(p.to, replayEnd))}
                title="Replay to the end of this phase"
              >
                <td className="py-1 font-mono whitespace-nowrap">
                  {clock(p.from)}–{clock(p.to)}
                </td>
                <td className="text-right font-mono">{fmt(p.fra)}</td>
                <td className="text-right font-mono">{fmt(p.all)}</td>
                <td className="text-right font-mono pr-2">{p.fra > 0 ? (p.all / p.fra).toFixed(1) : '—'}</td>
                <td className="text-[10px] text-neutral-600 leading-snug">{p.event ? p.event.slice(0, 90) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500">Key events and orders</div>
        <div className="mt-1 border-t border-[#e4e4e7]">
          {events.length === 0 && <p className="text-[11px] text-neutral-500 py-2">None yet.</p>}
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                if (e.t !== undefined) onReplayTime(Math.min(e.t, replayEnd));
                if (e.location) onFocusLocation?.(e.location);
              }}
              className="w-full text-left grid grid-cols-[38px_1fr] gap-x-2 py-1 border-b border-[#e4e4e7] hover:bg-[#f4f4f5] cursor-pointer"
            >
              <span className="font-mono text-[10px] text-neutral-500">{e.t !== undefined ? clock(e.t) : ''}</span>
              <span className={`text-[11px] leading-snug ${e.kind === 'order' ? 'text-[#1e3a8a]' : ''}`}>{e.message}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};
