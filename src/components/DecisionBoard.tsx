import React, { useMemo } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { Unit, Vector2D } from '../types/game';
import { toGridRef } from '../engine/grid';

// Decision support board: the staff's decision points, each evaluated live against its trigger.
// Status is always spelled out (Act / Watch / OK) alongside its colour bar.

type Status = 'act' | 'watch' | 'ok' | 'info';

interface DecisionPoint {
  id: string;
  group: string;
  status: Status;
  title: string;
  value: string;
  action: string;
  location?: Vector2D;
}

const STATUS_STYLE: Record<Status, { bar: string; label: string; text: string }> = {
  act: { bar: 'bg-[#b91c1c]', label: 'Act', text: 'text-[#b91c1c]' },
  watch: { bar: 'bg-[#ca8a04]', label: 'Watch', text: 'text-[#a16207]' },
  ok: { bar: 'bg-[#15803d]', label: 'OK', text: 'text-[#15803d]' },
  info: { bar: 'bg-[#52525b]', label: 'Info', text: 'text-neutral-600' },
};

const SECTOR_POINTS: Record<'north' | 'center' | 'south', Vector2D> = {
  north: { x: 1350, y: 260 },
  center: { x: 1400, y: 700 },
  south: { x: 1000, y: 1150 },
};

interface DecisionBoardProps {
  engine: BattleEngine;
  state: SimulationState;
  onFocusLocation?: (loc: Vector2D) => void;
}

export const DecisionBoard: React.FC<DecisionBoardProps> = ({ engine, state, onFocusLocation }) => {
  const points = useMemo(() => {
    const list: DecisionPoint[] = [];
    const player = state.playerFaction;
    const centroid = (us: Unit[]) => ({
      x: us.reduce((a, u) => a + u.position.x, 0) / Math.max(1, us.length),
      y: us.reduce((a, u) => a + u.position.y, 0) / Math.max(1, us.length),
    });

    // 1. Sector force ratios
    const ratios = state.sectorForceRatios;
    if (ratios) {
      for (const sector of ['north', 'center', 'south'] as const) {
        const r = ratios[sector];
        const status: Status = r.ratio < 1 ? 'act' : r.ratio < 1.5 ? 'watch' : 'ok';
        list.push({
          id: `ratio_${sector}`,
          group: 'Force ratios',
          status,
          title: r.sectorName || `${sector[0].toUpperCase()}${sector.slice(1)} sector`,
          value: `${r.ratio.toFixed(1)}:1`,
          action:
            r.ratio < 1
              ? 'Outnumbered. Commit reserve or shorten the line.'
              : r.ratio >= 3
              ? '3:1 reached. Ratio supports a deliberate attack.'
              : r.ratio < 1.5
              ? 'Marginal. Prepare reserve to reinforce.'
              : 'Hold. Not enough for a deliberate attack (3:1).',
          location: SECTOR_POINTS[sector],
        });
      }
    }

    // 2. Corps strength, ammunition and loss rate
    const byCorps = new Map<string, Unit[]>();
    for (const u of state.units) {
      if (u.faction !== player) continue;
      byCorps.set(u.corps, [...(byCorps.get(u.corps) || []), u]);
    }
    for (const [corps, all] of byCorps) {
      const alive = all.filter((u) => u.status !== 'shattered' && u.strength > 0);
      const name = corps.replace(/\s*\([^)]*\)/g, '');
      if (alive.length === 0) {
        list.push({ id: `str_${corps}`, group: 'Corps', status: 'act', title: name, value: 'Destroyed', action: 'Reassign its sector.' });
        continue;
      }
      const str = alive.reduce((a, u) => a + u.strength, 0);
      const init = all.reduce((a, u) => a + u.initialStrength, 0);
      const pct = Math.round((str / Math.max(1, init)) * 100);
      const shooters = alive.filter((u) => u.type !== 'supply' && u.maxAmmo > 0);
      const ammo = shooters.length
        ? Math.round((shooters.reduce((a, u) => a + Math.min(1, u.ammo / u.maxAmmo), 0) / shooters.length) * 100)
        : 100;
      let perHour = 0;
      for (const u of alive) perHour += engine.getUnitCasualtyRates(u.id, 10).takenPerHour;
      const hoursToHalf = perHour > 0 ? (str - init * 0.5) / perHour : Infinity;
      const loc = centroid(alive);

      const strStatus: Status = pct < 50 || hoursToHalf < 0.25 ? 'act' : pct < 70 || hoursToHalf < 1 ? 'watch' : 'ok';
      list.push({
        id: `str_${corps}`,
        group: 'Corps',
        status: strStatus,
        title: `${name}: strength`,
        value: `${pct}%${perHour > 0 ? ` · −${Math.round(perHour).toLocaleString()}/h` : ''}`,
        action:
          pct < 50
            ? 'Combat ineffective. Withdraw or relieve.'
            : hoursToHalf < 1
            ? `At this loss rate, ineffective in ${Math.max(1, Math.round(hoursToHalf * 60))} min.`
            : pct < 70
            ? 'Degraded. Avoid further attacks without support.'
            : 'Effective.',
        location: loc,
      });
      if (shooters.length) {
        list.push({
          id: `ammo_${corps}`,
          group: 'Corps',
          status: ammo < 25 ? 'act' : ammo < 40 ? 'watch' : 'ok',
          title: `${name}: ammunition`,
          value: `${ammo}%`,
          action: ammo < 25 ? 'Resupply from the ammunition park now.' : ammo < 40 ? 'Plan resupply.' : 'Sufficient.',
          location: loc,
        });
      }
    }

    // 3. Routing formations
    const routing = state.units.filter((u) => u.faction === player && u.status === 'routing');
    list.push({
      id: 'routing',
      group: 'Formations',
      status: routing.length ? 'act' : 'ok',
      title: 'Formations routing',
      value: `${routing.length}`,
      action: routing.length ? `Cover the gap left by ${routing.map((u) => u.name.split(' (')[0]).join(', ')}.` : 'None.',
      location: routing[0]?.position,
    });

    // 4. Reserve
    const reserve = state.units.filter(
      (u) => u.faction === player && /Guard Reserve|Cavalry Reserve/.test(u.corps) && u.status !== 'shattered' && u.strength > 0
    );
    const uncommitted = reserve.filter((u) => !u.currentOrder && u.status !== 'engaging' && u.status !== 'melee');
    if (reserve.length) {
      list.push({
        id: 'reserve',
        group: 'Formations',
        status: 'info',
        title: 'Reserve uncommitted',
        value: `${uncommitted.length} / ${reserve.length}`,
        action: uncommitted.length ? 'Available to commit.' : 'Fully committed. No reserve left.',
        location: uncommitted[0]?.position,
      });
    }

    // 5. Objectives
    for (const g of state.operationalGraphics || []) {
      if (g.type !== 'objective' || !g.points[0]) continue;
      const p = g.points[0];
      const near = (u: Unit) => u.status !== 'shattered' && u.strength > 0 && Math.hypot(u.position.x - p.x, u.position.y - p.y) <= 80;
      const own = state.units.some((u) => u.faction === player && near(u));
      const enemy = state.units.some(
        (u) => u.faction !== player && near(u) && (!state.fogOfWarEnabled || u.detectionState !== 'hidden')
      );
      const status: Status = own && !enemy ? 'ok' : enemy && !own ? 'act' : own && enemy ? 'watch' : 'info';
      list.push({
        id: `obj_${g.id}`,
        group: 'Objectives',
        status,
        title: g.name,
        value: own && enemy ? 'Contested' : own ? 'Held' : enemy ? 'Enemy' : 'Unoccupied',
        action: `${toGridRef(p)}`,
        location: p,
      });
    }
    return list;
  }, [state, engine]);

  const order: Status[] = ['act', 'watch', 'info', 'ok'];
  const counts = order.map((s) => points.filter((p) => p.status === s).length);
  const groups = Array.from(new Set(points.map((p) => p.group)));

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#fbfbfa] text-black font-sans">
      <div className="flex items-center gap-3 h-7 px-3 border-b border-[#d4d4d8] text-[10px] flex-shrink-0">
        {order.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block w-1.5 h-3 ${STATUS_STYLE[s].bar}`} />
            <span className="text-neutral-600">{STATUS_STYLE[s].label}</span>
            <span className="font-mono font-semibold">{counts[i]}</span>
          </span>
        ))}
        <span className="ml-auto font-mono text-neutral-500">{engine.formatMilitaryTime(state.timeMinutes)}</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {groups.map((g) => (
          <div key={g}>
            <div className="px-3 pt-2.5 pb-1 text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500">{g}</div>
            {points
              .filter((p) => p.group === g)
              .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.location || !onFocusLocation}
                  onClick={() => p.location && onFocusLocation?.(p.location)}
                  className="w-full text-left grid grid-cols-[4px_44px_1fr_auto] gap-x-2 items-start px-3 py-1.5 border-b border-[#e4e4e7] hover:bg-[#f4f4f5] disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
                >
                  <span className={`self-stretch ${STATUS_STYLE[p.status].bar}`} />
                  <span className={`text-[10px] font-semibold ${STATUS_STYLE[p.status].text}`}>{STATUS_STYLE[p.status].label}</span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold truncate">{p.title}</span>
                    <span className="block text-[10px] text-neutral-600 leading-snug">{p.action}</span>
                  </span>
                  <span className="text-[11px] font-mono text-right whitespace-nowrap">{p.value}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
};
