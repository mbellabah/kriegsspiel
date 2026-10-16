import React, { useMemo, useState } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { ManeuverOrder, Unit, Vector2D, Formation } from '../types/game';
import { getUnitSymbolFields } from '../engine/symbology';
import { toGridRef } from '../engine/grid';

// Five-paragraph operation order (Situation, Mission, Execution, Sustainment, Command & signal).
// Builds real engine orders: courier delay from army HQ, timing, formation, facing and pace.

interface OpordComposerProps {
  engine: BattleEngine;
  state: SimulationState;
  isPickingCoordinates?: boolean;
  onTogglePickCoordinates?: () => void;
  pinpointedCoords?: Vector2D | null;
  onClearPinpointedCoords?: () => void;
}

type Task = 'attack' | 'seize' | 'defend' | 'screen' | 'move' | 'fire' | 'withdraw';

const TASKS: { id: Task; label: string; verb: string }[] = [
  { id: 'attack', label: 'Attack', verb: 'attacks' },
  { id: 'seize', label: 'Seize', verb: 'seizes' },
  { id: 'defend', label: 'Defend', verb: 'defends' },
  { id: 'screen', label: 'Screen', verb: 'screens' },
  { id: 'move', label: 'Move', verb: 'moves to' },
  { id: 'fire', label: 'Fire on', verb: 'fires on' },
  { id: 'withdraw', label: 'Withdraw', verb: 'withdraws to' },
];

interface Objective {
  key: string;
  label: string;
  group: string;
  position: Vector2D;
  line?: Vector2D[]; // phase lines: each formation goes to its nearest point on the line
  enemyId?: string;
}

const parseClock = (text: string): number | null => {
  const m = text.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min - 7 * 60;
};

const clock = (t: number) => {
  const total = 7 * 60 + Math.floor(t);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}${String(total % 60).padStart(2, '0')}`;
};

const closestOnPolyline = (p: Vector2D, line: Vector2D[]): Vector2D => {
  let best = line[0];
  let bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / Math.max(1e-6, abx * abx + aby * aby)));
    const q = { x: a.x + abx * t, y: a.y + aby * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
};

const Para: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <section className="border-b border-[#e4e4e7] px-3 py-2">
    <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
      {n}. {title}
    </div>
    <div className="space-y-1.5">{children}</div>
  </section>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="grid grid-cols-[92px_1fr] items-center gap-2 text-[11px]">
    <span className="text-neutral-500">{label}</span>
    {children}
  </label>
);

const selectCls = 'h-6 w-full bg-white border border-[#a1a1aa] px-1 text-[11px] focus:outline-none focus:border-[#1e3a8a]';

const Seg = <T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) => (
  <div className="flex border border-[#a1a1aa] h-6">
    {options.map((o, i) => (
      <button
        key={o.id}
        type="button"
        onClick={() => onChange(o.id)}
        className={`flex-1 px-2 whitespace-nowrap text-[10px] cursor-pointer ${i > 0 ? 'border-l border-[#a1a1aa]' : ''} ${
          value === o.id ? 'bg-[#1e3a8a] text-white' : 'bg-white text-neutral-700 hover:bg-[#f4f4f5]'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const OpordComposer: React.FC<OpordComposerProps> = ({
  engine,
  state,
  isPickingCoordinates,
  onTogglePickCoordinates,
  pinpointedCoords,
  onClearPinpointedCoords,
}) => {
  const player = state.playerFaction;
  const friendly = state.units.filter((u) => u.faction === player && u.status !== 'shattered' && u.strength > 0);
  const corpsNames = Array.from(new Set(friendly.map((u) => u.corps)));

  const [recipient, setRecipient] = useState<string>(() => (state.selectedUnitId ? `unit:${state.selectedUnitId}` : `unit:${friendly[0]?.id}`));
  const [task, setTask] = useState<Task>('attack');
  const [objectiveKey, setObjectiveKey] = useState<string>('');
  const [purpose, setPurpose] = useState('');
  const [startMode, setStartMode] = useState<'receipt' | 'at'>('receipt');
  const [startAt, setStartAt] = useState('');
  const [holdUntil, setHoldUntil] = useState('');
  const [formation, setFormation] = useState<'keep' | Formation>('line');
  const [facing, setFacing] = useState<'enemy' | 'objective' | 'keep'>('enemy');
  const [pace, setPace] = useState<'normal' | 'forced'>('normal');
  const [courier, setCourier] = useState<'normal' | 'urgent'>('normal');
  const [sent, setSent] = useState<string | null>(null);

  const units: Unit[] = useMemo(() => {
    if (recipient.startsWith('corps:')) {
      const c = recipient.slice(6);
      return friendly.filter((u) => u.corps === c && u.type !== 'supply');
    }
    const u = friendly.find((f) => f.id === recipient.slice(5));
    return u ? [u] : [];
  }, [recipient, friendly]);

  const objectives: Objective[] = useMemo(() => {
    const list: Objective[] = [];
    if (pinpointedCoords) {
      list.push({ key: 'grid', label: `Grid ${toGridRef(pinpointedCoords)}`, group: 'Map', position: pinpointedCoords });
    }
    for (const g of state.operationalGraphics || []) {
      if (g.type === 'objective' && g.points[0]) list.push({ key: g.id, label: g.name, group: 'Control measures', position: g.points[0] });
      if (g.type === 'phase_line' && g.points.length > 1) {
        const mid = g.points[Math.floor(g.points.length / 2)];
        list.push({ key: g.id, label: g.name, group: 'Control measures', position: mid, line: g.points });
      }
    }
    for (const t of state.targetReferencePoints || []) {
      list.push({ key: t.id, label: `${t.code} ${t.name}`, group: 'Target reference points', position: t.position });
    }
    for (const t of state.terrain) {
      if (t.center && t.name && ['hill', 'village', 'bridge', 'ford', 'woods', 'ridge'].includes(t.type)) {
        list.push({ key: t.id, label: t.name.replace(/\s*\([^)]*\)/g, ''), group: 'Terrain', position: t.center });
      }
    }
    for (const u of state.units) {
      if (u.faction === player || u.status === 'shattered' || u.strength <= 0) continue;
      if (state.fogOfWarEnabled && u.detectionState !== 'identified') continue;
      list.push({
        key: `enemy:${u.id}`,
        label: `Enemy ${getUnitSymbolFields(u).designation} (${getUnitSymbolFields(u).echelon})`,
        group: 'Enemy formations',
        position: u.position,
        enemyId: u.id,
      });
    }
    return list;
  }, [state.operationalGraphics, state.targetReferencePoints, state.terrain, state.units, state.fogOfWarEnabled, pinpointedCoords, player]);

  const objective = objectives.find((o) => o.key === objectiveKey) || (pinpointedCoords && objectiveKey === 'grid' ? objectives[0] : undefined);

  // Courier ride from army HQ, halved for an urgent galloper
  const hq = friendly.find((u) => u.type === 'headquarters' && /NAPOLEON/.test(u.name)) || friendly.find((u) => u.type === 'headquarters');
  const courierMinutes = (u: Unit) => {
    const d = hq ? Math.hypot(u.position.x - hq.position.x, u.position.y - hq.position.y) : 0;
    const base = Math.max(1.2, d / 380);
    return courier === 'urgent' ? base * 0.5 : base;
  };
  const maxCourier = units.length ? Math.max(...units.map(courierMinutes)) : 0;

  // Paragraph 1 inputs
  const enemies = state.units.filter(
    (u) => u.faction !== player && u.status !== 'shattered' && u.strength > 0 && (!state.fogOfWarEnabled || u.detectionState !== 'hidden')
  );
  const enemyStrength = enemies.reduce((a, u) => a + (u.detectionState === 'identified' || !state.fogOfWarEnabled ? u.strength : 0), 0);
  const ratios = state.sectorForceRatios;
  const weakest = ratios
    ? (['north', 'center', 'south'] as const).reduce((a, b) => (ratios[a].ratio <= ratios[b].ratio ? a : b))
    : null;
  const ownStr = units.reduce((a, u) => a + u.strength, 0);
  const ownInit = units.reduce((a, u) => a + u.initialStrength, 0);
  const shooters = units.filter((u) => u.type !== 'supply' && u.maxAmmo > 0);
  const ownAmmo = shooters.length ? Math.round((shooters.reduce((a, u) => a + Math.min(1, u.ammo / u.maxAmmo), 0) / shooters.length) * 100) : 100;
  const ownFatigue = units.length ? Math.round(units.reduce((a, u) => a + u.fatigue, 0) / units.length) : 0;

  const recipientLabel = recipient.startsWith('corps:')
    ? recipient.slice(6)
    : units[0]
    ? `${getUnitSymbolFields(units[0]).designation} (${getUnitSymbolFields(units[0]).echelon}, ${getUnitSymbolFields(units[0]).higher || units[0].corps})`
    : '—';

  const startMinutes = startMode === 'at' ? parseClock(startAt) : null;
  const holdMinutes = holdUntil ? parseClock(holdUntil) : null;
  const taskDef = TASKS.find((t) => t.id === task)!;

  const missionText = objective
    ? `${recipientLabel} ${taskDef.verb} ${objective.label}${startMinutes !== null ? ` at ${clock(startMinutes)}` : ' on receipt'}${purpose ? ` in order to ${purpose}` : ''}.`
    : '';

  const canSend = units.length > 0 && !!objective && (startMode === 'receipt' || startMinutes !== null) && (!holdUntil || holdMinutes !== null);

  const transmit = () => {
    if (!canSend || !objective) return;
    const now = state.timeMinutes;
    const orderType: ManeuverOrder['type'] =
      task === 'defend'
        ? 'hold'
        : task === 'screen'
        ? 'hold'
        : task === 'move'
        ? 'march'
        : task === 'withdraw'
        ? 'retreat'
        : task === 'fire'
        ? 'bombard'
        : 'assault';

    // Formations of a corps dress into a line across the approach, centred on the objective
    const centroid = {
      x: units.reduce((a, u) => a + u.position.x, 0) / units.length,
      y: units.reduce((a, u) => a + u.position.y, 0) / units.length,
    };
    const approach = Math.atan2(objective.position.y - centroid.y, objective.position.x - centroid.x);
    const frontageHalf = Math.max(0, (units.length - 1) * 34);
    const perp = approach + Math.PI / 2;
    const slots =
      units.length > 1 && !objective.line && !objective.enemyId
        ? BattleEngine.lineSlots(
            units.length,
            { x: objective.position.x - Math.cos(perp) * frontageHalf, y: objective.position.y - Math.sin(perp) * frontageHalf },
            { x: objective.position.x + Math.cos(perp) * frontageHalf, y: objective.position.y + Math.sin(perp) * frontageHalf }
          )
        : null;

    units.forEach((u, i) => {
      const isArty = u.type === 'artillery';
      const type: ManeuverOrder['type'] = task === 'fire' && !isArty ? 'bombard' : orderType;
      const destination = objective.line ? closestOnPolyline(u.position, objective.line) : slots ? slots[i] : { ...objective.position };
      if (task === 'screen' && (u.type === 'infantry' || u.type === 'guard')) engine.toggleSkirmishScreen(u.id, true);
      engine.issueOrder(u.id, {
        unitId: u.id,
        type,
        destination,
        waypoints: [],
        targetUnitId: objective.enemyId && (task === 'attack' || task === 'fire') ? objective.enemyId : undefined,
        targetFormation: formation === 'keep' ? undefined : formation,
        faceUnitId: facing === 'enemy' && objective.enemyId ? objective.enemyId : undefined,
        faceNearestEnemy: facing === 'enemy' && !objective.enemyId,
        finalHeading:
          facing === 'objective'
            ? Math.atan2(objective.position.y - u.position.y, objective.position.x - u.position.x)
            : facing === 'keep'
            ? u.heading
            : undefined,
        isForcedMarch: pace === 'forced',
        plannedTime: now,
        dispatchArrivalTime: now + courierMinutes(u),
        startTime: startMinutes !== null && startMinutes > now ? startMinutes : undefined,
        endTime: holdMinutes !== null && holdMinutes > now ? holdMinutes : undefined,
        objectiveName: objective.label,
        source: 'player',
      });
    });

    engine.logOrder(
      `ORDER ${clock(now)} to ${recipientLabel}: ${missionText}${holdMinutes !== null ? ` Hold until ${clock(holdMinutes)}.` : ''}${
        pace === 'forced' ? ' Forced march.' : ''
      } Courier ${courier === 'urgent' ? 'urgent' : 'normal'}, ETA ${clock(now + maxCourier)}.`,
      objective.position
    );
    setSent(`Transmitted ${clock(now)}. Courier arrives about ${clock(now + maxCourier)}; acknowledgement will appear in the log.`);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#fbfbfa] text-black font-sans">
      <Para n={1} title="Situation">
        <p className="text-[11px] leading-snug">
          <span className="text-neutral-500">Enemy. </span>
          {enemies.length} formations reported
          {enemyStrength > 0 ? `, about ${Math.round(enemyStrength / 1000)}k identified` : ''}.
          {weakest && ratios ? ` Most threatened sector: ${weakest} (${ratios[weakest].ratio.toFixed(1)}:1).` : ''}
        </p>
        <p className="text-[11px] leading-snug">
          <span className="text-neutral-500">Friendly. </span>
          {units.length ? `${recipientLabel} at ${toGridRef(units[0].position)}, ${Math.round((ownStr / Math.max(1, ownInit)) * 100)}% strength.` : 'Select a recipient.'}
        </p>
        <p className="text-[11px] leading-snug">
          <span className="text-neutral-500">Terrain and weather. </span>
          {state.timeMinutes < 120 ? 'Fog in the Goldbach valley, lifting from the heights. ' : 'Clear. '}
          Ponds south of Sokolnitz frozen; ice will not bear guns.
        </p>
      </Para>

      <Para n={2} title="Mission">
        <Field label="Recipient">
          <select className={selectCls} value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <optgroup label="Corps">
              {corpsNames.map((c) => (
                <option key={c} value={`corps:${c}`}>
                  {c}
                </option>
              ))}
            </optgroup>
            <optgroup label="Formations">
              {friendly.map((u) => (
                <option key={u.id} value={`unit:${u.id}`}>
                  {getUnitSymbolFields(u).designation} ({getUnitSymbolFields(u).echelon}) · {getUnitSymbolFields(u).higher || u.corps}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Task">
          <select className={selectCls} value={task} onChange={(e) => setTask(e.target.value as Task)}>
            {TASKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Objective">
          <div className="flex gap-1">
            <select className={selectCls} value={objectiveKey} onChange={(e) => setObjectiveKey(e.target.value)}>
              <option value="">Select…</option>
              {Array.from(new Set(objectives.map((o) => o.group))).map((g) => (
                <optgroup key={g} label={g}>
                  {objectives
                    .filter((o) => o.group === g)
                    .map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {onTogglePickCoordinates && (
              <button
                type="button"
                onClick={() => {
                  onClearPinpointedCoords?.();
                  onTogglePickCoordinates();
                  setObjectiveKey('grid');
                }}
                className={`h-6 px-2 text-[10px] border cursor-pointer whitespace-nowrap ${
                  isPickingCoordinates ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' : 'bg-white border-[#a1a1aa] hover:bg-[#f4f4f5]'
                }`}
                title="Pick a grid on the map"
              >
                Map
              </button>
            )}
          </div>
        </Field>
        <Field label="Purpose">
          <input
            className={selectCls}
            placeholder="in order to… (optional)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </Field>
        {missionText && <p className="text-[11px] leading-snug font-semibold">{missionText}</p>}
      </Para>

      <Para n={3} title="Execution">
        <Field label="Begin">
          <div className="flex gap-1">
            <Seg
              value={startMode}
              onChange={setStartMode}
              options={[
                { id: 'receipt', label: 'On receipt' },
                { id: 'at', label: 'At time' },
              ]}
            />
            {startMode === 'at' && (
              <input className={`${selectCls} w-16 font-mono`} placeholder="0830" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            )}
          </div>
        </Field>
        <Field label="Hold until">
          <input className={`${selectCls} font-mono`} placeholder="none, or e.g. 0930" value={holdUntil} onChange={(e) => setHoldUntil(e.target.value)} />
        </Field>
        <Field label="Formation">
          <Seg
            value={formation}
            onChange={setFormation}
            options={[
              { id: 'line', label: 'Line' },
              { id: 'column', label: 'Column' },
              { id: 'square', label: 'Square' },
              { id: 'keep', label: 'As is' },
            ]}
          />
        </Field>
        <Field label="Face">
          <Seg
            value={facing}
            onChange={setFacing}
            options={[
              { id: 'enemy', label: 'Enemy' },
              { id: 'objective', label: 'Objective' },
              { id: 'keep', label: 'As is' },
            ]}
          />
        </Field>
      </Para>

      <Para n={4} title="Sustainment">
        <p className="text-[11px] leading-snug">
          Ammunition {ownAmmo}%, fatigue {ownFatigue}%. Ammunition park at {hq ? toGridRef(friendly.find((u) => u.type === 'supply')?.position || hq.position) : '—'}.
        </p>
        <Field label="Pace">
          <Seg
            value={pace}
            onChange={setPace}
            options={[
              { id: 'normal', label: 'Normal' },
              { id: 'forced', label: 'Forced march' },
            ]}
          />
        </Field>
      </Para>

      <Para n={5} title="Command and signal">
        <p className="text-[11px] leading-snug">
          Army HQ at {hq ? toGridRef(hq.position) : '—'}. Report on arrival.
        </p>
        <Field label="Courier">
          <Seg
            value={courier}
            onChange={setCourier}
            options={[
              { id: 'normal', label: 'Normal' },
              { id: 'urgent', label: 'Urgent' },
            ]}
          />
        </Field>
        {units.length > 0 && (
          <p className="text-[10px] text-neutral-500">
            Courier arrives about {clock(state.timeMinutes + maxCourier)} ({Math.round(maxCourier)} min).
          </p>
        )}
      </Para>

      <div className="px-3 py-2 flex items-center gap-2 sticky bottom-0 bg-[#fbfbfa] border-t border-[#a1a1aa]">
        <button
          type="button"
          disabled={!canSend}
          onClick={transmit}
          className="h-7 px-4 text-[11px] font-semibold bg-[#1e3a8a] text-white border border-[#1e3a8a] disabled:bg-[#e4e4e7] disabled:text-neutral-400 disabled:border-[#d4d4d8] cursor-pointer disabled:cursor-default"
        >
          Transmit order
        </button>
        <span className="text-[10px] text-neutral-500 leading-tight">{sent || (canSend ? '' : 'Choose a recipient, task and objective.')}</span>
      </div>
    </div>
  );
};
