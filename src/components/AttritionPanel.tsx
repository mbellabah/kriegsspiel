import React, { useMemo, useState } from 'react';
import { BattleEngine, SimulationState, LossSample } from '../engine/simulation';

// Series colours validated for CVD separation on the light surface (dataviz validator)
const FRA_COLOR = '#2c4fb8';
const ALL_COLOR = '#b91c1c';

const fmt = (n: number) => Math.round(n).toLocaleString();
const clock = (t: number) => {
  const total = 7 * 60 + Math.floor(t);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}${String(total % 60).padStart(2, '0')}`;
};

// Cumulative casualties over battle time, one line per side, crosshair tooltip on hover
const CasualtyChart: React.FC<{ history: LossSample[] }> = ({ history }) => {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 120;
  const pad = { l: 36, r: 34, t: 8, b: 18 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const tMax = Math.max(30, history[history.length - 1]?.t || 0);
  const yMaxRaw = Math.max(100, ...history.map((h) => Math.max(h.french, h.allies)));
  const step = Math.pow(10, Math.floor(Math.log10(yMaxRaw)));
  const yMax = Math.ceil(yMaxRaw / step) * step;
  const x = (t: number) => pad.l + (t / tMax) * iw;
  const y = (v: number) => pad.t + ih - (v / yMax) * ih;

  const path = (key: 'french' | 'allies') =>
    history.map((h, i) => `${i === 0 ? 'M' : 'L'}${x(h.t).toFixed(1)},${y(h[key]).toFixed(1)}`).join(' ');

  const last = history[history.length - 1];
  const hovered = hover !== null ? history[hover] : null;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * tMax;
    let best = 0;
    for (let i = 0; i < history.length; i++) {
      if (Math.abs(history[i].t - t) < Math.abs(history[best].t - t)) best = i;
    }
    setHover(best);
  };

  // Keep end labels from overlapping when the lines finish close together
  let fraLabelY = last ? y(last.french) : 0;
  let allLabelY = last ? y(last.allies) : 0;
  if (Math.abs(fraLabelY - allLabelY) < 10) {
    const mid = (fraLabelY + allLabelY) / 2;
    const up = last && last.french >= last.allies;
    fraLabelY = mid + (up ? -5 : 5);
    allLabelY = mid + (up ? 5 : -5);
  }

  return (
    <div className="relative">
      <svg width={W} height={H} className="block" role="img" aria-label="Cumulative casualties by side over battle time">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(yMax * f)} y2={y(yMax * f)} stroke="#e4e4e7" strokeWidth="1" />
            <text x={pad.l - 4} y={y(yMax * f)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#71717a" fontFamily="ui-monospace, Menlo, monospace">
              {fmt(yMax * f)}
            </text>
          </g>
        ))}
        {[0, tMax / 2, tMax].map((t) => (
          <text key={t} x={x(t)} y={H - 4} textAnchor="middle" fontSize="9" fill="#71717a" fontFamily="ui-monospace, Menlo, monospace">
            {clock(t)}
          </text>
        ))}
        <path d={path('french')} fill="none" stroke={FRA_COLOR} strokeWidth="2" strokeLinejoin="round" />
        <path d={path('allies')} fill="none" stroke={ALL_COLOR} strokeWidth="2" strokeLinejoin="round" />
        {last && (
          <>
            <text x={W - pad.r + 4} y={fraLabelY} dominantBaseline="middle" fontSize="9" fill="#3f3f46">FRA</text>
            <text x={W - pad.r + 4} y={allLabelY} dominantBaseline="middle" fontSize="9" fill="#3f3f46">ALL</text>
          </>
        )}
        {hovered && (
          <g pointerEvents="none">
            <line x1={x(hovered.t)} x2={x(hovered.t)} y1={pad.t} y2={pad.t + ih} stroke="#a1a1aa" strokeWidth="1" />
            <circle cx={x(hovered.t)} cy={y(hovered.french)} r="4" fill={FRA_COLOR} stroke="#fbfbfa" strokeWidth="2" />
            <circle cx={x(hovered.t)} cy={y(hovered.allies)} r="4" fill={ALL_COLOR} stroke="#fbfbfa" strokeWidth="2" />
          </g>
        )}
        <rect
          x={pad.l}
          y={pad.t}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hovered && (
        <div
          className="absolute pointer-events-none bg-white border border-[#a1a1aa] px-1.5 py-1 text-[10px] font-mono shadow-sm"
          style={{ left: Math.min(x(hovered.t) + 8, W - 110), top: 4 }}
        >
          <div className="text-neutral-500">{clock(hovered.t)}</div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-[2px]" style={{ background: FRA_COLOR }} />
            <span className="text-neutral-600">FRA</span>
            <span className="ml-auto pl-2 text-black">{fmt(hovered.french)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-[2px]" style={{ background: ALL_COLOR }} />
            <span className="text-neutral-600">ALL</span>
            <span className="ml-auto pl-2 text-black">{fmt(hovered.allies)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface AttritionPanelProps {
  engine: BattleEngine;
  state: SimulationState;
}

export const AttritionPanel: React.FC<AttritionPanelProps> = ({ engine, state }) => {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const rates = engine.getCasualtyRates(10);

  const sides = useMemo(() => {
    const calc = (faction: 'french' | 'allies') => {
      const units = state.units.filter((u) => u.faction === faction);
      const initial = units.reduce((a, u) => a + u.initialStrength, 0);
      const current = units.reduce((a, u) => a + Math.max(0, u.status === 'shattered' ? 0 : u.strength), 0);
      const routing = units.filter((u) => u.status === 'routing').length;
      const shattered = units.filter((u) => u.status === 'shattered' || u.strength <= 0).length;
      return { initial, current, routing, shattered, total: units.length };
    };
    return { french: calc('french'), allies: calc('allies') };
  }, [state.units]);

  const exchange = state.frenchLosses > 0 ? state.alliedLosses / state.frenchLosses : null;

  const rows: { label: string; fra: string; all: string; alertFra?: boolean; alertAll?: boolean }[] = [
    { label: 'Casualties', fra: fmt(state.frenchLosses), all: fmt(state.alliedLosses) },
    { label: 'Last 10 min', fra: fmt(rates.french), all: fmt(rates.allies) },
    { label: 'Rate per hour', fra: fmt(rates.frenchPerHour), all: fmt(rates.alliesPerHour) },
    {
      label: 'Strength',
      fra: `${fmt(sides.french.current)} (${Math.round((sides.french.current / Math.max(1, sides.french.initial)) * 100)}%)`,
      all: `${fmt(sides.allies.current)} (${Math.round((sides.allies.current / Math.max(1, sides.allies.initial)) * 100)}%)`,
    },
    {
      label: 'Formations routing',
      fra: `${sides.french.routing}`,
      all: `${sides.allies.routing}`,
      alertFra: sides.french.routing > 0,
      alertAll: sides.allies.routing > 0,
    },
    {
      label: 'Formations destroyed',
      fra: `${sides.french.shattered} / ${sides.french.total}`,
      all: `${sides.allies.shattered} / ${sides.allies.total}`,
      alertFra: sides.french.shattered > 0,
      alertAll: sides.allies.shattered > 0,
    },
  ];

  return (
    <div className="w-[332px] bg-[#fbfbfa] border border-[#a1a1aa] shadow-sm text-black font-sans text-[11px]">
      <div className="flex items-center justify-between h-7 px-2 bg-[#e4e4e7] border-b border-[#a1a1aa]">
        <span className="font-semibold">Attrition</span>
        <span className="text-[10px] text-neutral-500">
          Exchange ratio{' '}
          <span className="font-mono text-black">{exchange === null ? '—' : `${exchange.toFixed(2)} : 1`}</span>
        </span>
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">
            <th className="text-left font-bold px-2 py-1"></th>
            <th className="text-right font-bold px-2 py-1">
              <span className="inline-block w-2 h-[2px] align-middle mr-1" style={{ background: FRA_COLOR }} />
              France
            </th>
            <th className="text-right font-bold px-2 py-1">
              <span className="inline-block w-2 h-[2px] align-middle mr-1" style={{ background: ALL_COLOR }} />
              Allies
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[#e4e4e7]">
              <td className="px-2 py-[3px] text-neutral-500">{r.label}</td>
              <td className={`px-2 py-[3px] text-right font-mono ${r.alertFra ? 'text-[#b91c1c] font-bold' : ''}`}>{r.fra}</td>
              <td className={`px-2 py-[3px] text-right font-mono ${r.alertAll ? 'text-[#b91c1c] font-bold' : ''}`}>{r.all}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center justify-between px-2 pt-2 pb-1 border-t border-[#a1a1aa]">
        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500">Cumulative casualties</span>
        <div className="flex text-[10px]">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-1.5 cursor-pointer ${view === v ? 'text-black font-semibold underline underline-offset-2' : 'text-neutral-500 hover:text-black'}`}
            >
              {v === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
      </div>
      <div className="px-2 pb-2">
        {view === 'chart' ? (
          state.lossHistory.length < 2 ? (
            <p className="text-[10px] text-neutral-500 py-6 text-center">No casualties yet. Start the battle.</p>
          ) : (
            <>
              <CasualtyChart history={state.lossHistory} />
              <div className="flex items-center gap-3 text-[10px] text-neutral-600 mt-1">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-[2px]" style={{ background: FRA_COLOR }} /> France
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-[2px]" style={{ background: ALL_COLOR }} /> Allies
                </span>
              </div>
            </>
          )
        ) : (
          <div className="max-h-[132px] overflow-y-auto custom-scrollbar border border-[#e4e4e7]">
            <table className="w-full text-[10px] font-mono">
              <thead className="sticky top-0 bg-[#f4f4f5] text-neutral-500">
                <tr>
                  <th className="text-left px-2 py-0.5 font-normal">Time</th>
                  <th className="text-right px-2 py-0.5 font-normal">FRA</th>
                  <th className="text-right px-2 py-0.5 font-normal">ALL</th>
                </tr>
              </thead>
              <tbody>
                {state.lossHistory
                  .filter((_, i, a) => i === a.length - 1 || i % 5 === 0)
                  .slice()
                  .reverse()
                  .map((h) => (
                    <tr key={h.t} className="border-t border-[#f4f4f5]">
                      <td className="px-2 py-[1px] text-neutral-500">{clock(h.t)}</td>
                      <td className="px-2 py-[1px] text-right">{fmt(h.french)}</td>
                      <td className="px-2 py-[1px] text-right">{fmt(h.allies)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
