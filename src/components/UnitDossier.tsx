import React, { useState } from 'react';
import { Unit, ERA_WEAPON_PROFILES } from '../types/game';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { getUnitSymbolFields, APP6_FRIEND_FILL, APP6_HOSTILE_FILL } from '../engine/symbology';
import { toGridRef } from '../engine/grid';
import { GlyphClose } from './glyphs';
import { TimeSeriesChart, ChartLegend, fmt } from './AttritionPanel';

interface UnitDossierProps {
  unit: Unit | null;
  engine: BattleEngine;
  // Passed so the memoised panel re-renders on every engine update (units are mutated in place)
  state: SimulationState;
  onClose: () => void;
  onStartBombardTargeting?: (unitId: string) => void;
  isBombardTargeting?: boolean;
}

// Small APP-6 symbol for panel headers
export const UnitSymbolGlyph: React.FC<{ unit: Unit; hostileDiamond: boolean }> = ({ unit, hostileDiamond }) => {
  const fields = getUnitSymbolFields(unit);
  const fill = unit.faction === 'french' ? APP6_FRIEND_FILL : APP6_HOSTILE_FILL;
  const icon = (ix: number, iy: number) => {
    if (unit.type === 'infantry' || unit.type === 'guard') {
      return <path d={`M${20 - ix} ${17 - iy} L${20 + ix} ${17 + iy} M${20 + ix} ${17 - iy} L${20 - ix} ${17 + iy}`} />;
    }
    if (unit.type === 'cavalry') return <path d={`M${20 - ix} ${17 + iy} L${20 + ix} ${17 - iy}`} />;
    if (unit.type === 'artillery') return <circle cx="20" cy="17" r="2.6" fill="#000" />;
    if (unit.type === 'supply') return <path d={`M${20 - ix} ${17 + iy * 0.45} L${20 + ix} ${17 + iy * 0.45}`} />;
    return null;
  };
  return (
    <svg width="40" height="32" viewBox="0 0 40 32" className="flex-shrink-0" aria-hidden>
      <text x="20" y="6.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fontFamily="Arial, sans-serif">
        {fields.echelon}
      </text>
      <g stroke="#000" strokeWidth="1" fill="none">
        {hostileDiamond ? (
          <path d="M20 8 L29 17 L20 26 L11 17 Z" fill={fill} />
        ) : (
          <rect x="9" y="10" width="22" height="14" fill={fill} />
        )}
        {fields.isHQ && <path d={hostileDiamond ? 'M11 17 L11 31' : 'M9 24 L9 31'} />}
        {hostileDiamond ? icon(4.5, 4.5) : icon(11, 7)}
      </g>
    </svg>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode; alert?: boolean; title?: string }> = ({ label, value, alert, title }) => (
  <div className="flex items-baseline justify-between gap-2 py-[3px] border-b border-[#e4e4e7] last:border-b-0" title={title}>
    <span className="text-neutral-500">{label}</span>
    <span className={`font-mono text-right truncate ${alert ? 'text-[#b91c1c] font-bold' : 'text-black'}`}>{value}</span>
  </div>
);

const Meter: React.FC<{ label: string; pct: number; text: string; alert?: boolean; warn?: boolean }> = ({ label, pct, text, alert, warn }) => (
  <div className="flex items-center justify-between gap-2 py-[3px] border-b border-[#e4e4e7]">
    <span className="text-neutral-500 w-24 flex-shrink-0">{label}</span>
    <div className="flex-1 h-[5px] bg-[#e4e4e7]">
      <div
        className={`h-full ${alert ? 'bg-[#b91c1c]' : warn ? 'bg-[#ca8a04]' : 'bg-[#52525b]'}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
    <span className={`font-mono w-[72px] text-right ${alert ? 'text-[#b91c1c] font-bold' : 'text-black'}`}>{text}</span>
  </div>
);

const Btn: React.FC<{
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean; // offensive fires and assaults
  title?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ onClick, active, disabled, danger, title, className = '', children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`h-6 px-1.5 border text-[10px] font-semibold transition-colors cursor-pointer disabled:cursor-default disabled:text-neutral-400 disabled:bg-[#f4f4f5] ${
      danger
        ? active
          ? 'bg-[#7f1d1d] border-[#7f1d1d] text-white'
          : 'bg-[#b91c1c] border-[#b91c1c] text-white hover:bg-[#991b1b]'
        : active
        ? 'bg-[#1e3a8a] border-[#1e3a8a] text-white'
        : 'bg-white border-[#a1a1aa] text-black hover:bg-[#f4f4f5]'
    } ${className}`}
  >
    {children}
  </button>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500 mt-3 mb-1">{children}</div>
);

const UNIT_SERIES = [
  { label: 'Taken', color: '#b91c1c' },
  { label: 'Inflicted', color: '#2c4fb8' },
];

export const UnitDossier: React.FC<UnitDossierProps> = React.memo(({
  unit,
  engine,
  state,
  onClose,
  onStartBombardTargeting,
  isBombardTargeting = false,
}) => {
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  const [detachmentName, setDetachmentName] = useState('');
  const [detachmentCorps, setDetachmentCorps] = useState('');

  if (!unit) return null;

  const hostileDiamond = state.wargameSymbology === 'nato' && unit.faction !== 'french';
  const era = state.era || 'napoleonic';
  const eraProfile = ERA_WEAPON_PROFILES[era] || ERA_WEAPON_PROFILES.napoleonic;
  const troopNoun =
    unit.type === 'cavalry'
      ? eraProfile.troopNouns.cavalry
      : unit.type === 'artillery'
      ? eraProfile.troopNouns.artillery
      : unit.type === 'headquarters'
      ? 'Staff & escort'
      : unit.type === 'supply'
      ? 'Wagons & teamsters'
      : eraProfile.troopNouns.infantry;

  const handleChargeOrder = () => {
    const enemyFaction = unit.faction === 'french' ? 'allies' : 'french';
    let nearestEnemy: Unit | null = null;
    let minDist = 350;
    for (const u of engine.getState().units) {
      if (u.faction === enemyFaction && u.status !== 'shattered' && u.strength > 0) {
        const d = Math.hypot(u.position.x - unit.position.x, u.position.y - unit.position.y);
        if (d < minDist) {
          minDist = d;
          nearestEnemy = u;
        }
      }
    }

    const dest = nearestEnemy
      ? { x: nearestEnemy.position.x, y: nearestEnemy.position.y }
      : {
          x: Math.max(30, Math.min(2370, unit.position.x + Math.cos(unit.heading) * 160)),
          y: Math.max(30, Math.min(1470, unit.position.y + Math.sin(unit.heading) * 160)),
        };

    engine.issueOrder(unit.id, {
      unitId: unit.id,
      type: 'charge',
      destination: dest,
      waypoints: [],
      plannedTime: engine.getState().timeMinutes,
    });
  };

  const handleQuickOrder = (type: 'flank_left' | 'flank_right' | 'advance') => {
    const forwardDist = 120;
    const forwardX = Math.cos(unit.heading);
    const forwardY = Math.sin(unit.heading);
    const perpX = -forwardY;
    const perpY = forwardX;

    let dest = {
      x: Math.max(30, Math.min(2370, unit.position.x + forwardX * forwardDist)),
      y: Math.max(30, Math.min(1470, unit.position.y + forwardY * forwardDist)),
    };
    let curveControl: { x: number; y: number } | undefined = undefined;

    if (type === 'flank_left') {
      dest = {
        x: Math.max(30, Math.min(2370, unit.position.x + forwardX * forwardDist + perpX * 90)),
        y: Math.max(30, Math.min(1470, unit.position.y + forwardY * forwardDist + perpY * 90)),
      };
      curveControl = {
        x: unit.position.x + forwardX * 60 + perpX * 110,
        y: unit.position.y + forwardY * 60 + perpY * 110,
      };
    } else if (type === 'flank_right') {
      dest = {
        x: Math.max(30, Math.min(2370, unit.position.x + forwardX * forwardDist - perpX * 90)),
        y: Math.max(30, Math.min(1470, unit.position.y + forwardY * forwardDist - perpY * 90)),
      };
      curveControl = {
        x: unit.position.x + forwardX * 60 - perpX * 110,
        y: unit.position.y + forwardY * 60 - perpY * 110,
      };
    }

    engine.issueOrder(unit.id, {
      unitId: unit.id,
      type: 'assault',
      destination: dest,
      waypoints: [],
      curveControl,
      plannedTime: 0,
    });
  };

  const handleEntrench = () => {
    engine.issueOrder(unit.id, {
      unitId: unit.id,
      type: 'entrench',
      destination: { ...unit.position },
      waypoints: [],
      plannedTime: 0,
    });
  };

  const handleCounterBattery = () => {
    const enemyFaction = unit.faction === 'french' ? 'allies' : 'french';
    const enemyBatteries = engine.getState().units.filter(
      (u) => u.faction === enemyFaction && u.type === 'artillery' && u.status !== 'shattered'
    );
    if (enemyBatteries.length === 0) return;
    let nearest = enemyBatteries[0];
    let minDist = 99999;
    for (const eb of enemyBatteries) {
      const d = Math.hypot(eb.position.x - unit.position.x, eb.position.y - unit.position.y);
      if (d < minDist) {
        minDist = d;
        nearest = eb;
      }
    }
    engine.issueCounterBattery(unit.id, nearest.id);
  };

  const handleGrandBattery = () => {
    if (unit.grandBatteryGroupId) {
      engine.disbandGrandBattery(unit.grandBatteryGroupId);
      return;
    }
    const friendlyBatteries = engine.getState().units.filter(
      (u) => u.faction === unit.faction && u.type === 'artillery' && u.status !== 'shattered'
    );
    if (friendlyBatteries.length >= 2) {
      engine.formGrandBattery(friendlyBatteries.map((b) => b.id), unit.id);
    }
  };

  const handleExecuteSplit = () => {
    const count = Math.round((unit.strength * splitPct) / 100);
    if (count <= 0 || count >= unit.strength) return;
    const name = detachmentName.trim() || `${unit.name} (Det)`;
    const corps = detachmentCorps.trim() || unit.corps;
    engine.splitUnit(unit.id, count, name, corps);
    setIsSplitting(false);
    setDetachmentName('');
    setDetachmentCorps('');
  };

  const shell = (body: React.ReactNode, subtitle: React.ReactNode, title: string) => (
    <aside
      aria-label="Unit"
      className="fixed z-40 right-0 top-10 bottom-7 w-[300px] bg-[#fbfbfa] border-l border-[#a1a1aa] text-black select-none flex flex-col font-sans text-[11px]"
    >
      <div className="flex items-start gap-2 px-2.5 py-2 bg-[#e4e4e7] border-b border-[#a1a1aa] flex-shrink-0">
        <UnitSymbolGlyph unit={unit} hostileDiamond={hostileDiamond} />
        <div className="flex-1 min-w-0">
          <h2 className="text-[12px] font-bold leading-tight truncate" title={title}>{title}</h2>
          <div className="text-[10px] text-neutral-600 leading-tight mt-0.5">{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-neutral-500 hover:text-black hover:bg-[#d4d4d8] cursor-pointer"
          title="Close"
        >
          <GlyphClose size={11} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2.5 pb-3">{body}</div>
    </aside>
  );

  if (unit.detectionState === 'contact') {
    return shell(
      <>
        <SectionLabel>Intelligence</SectionLabel>
        <Row label="Identity" value="Suspected hostile" alert />
        <Row label="Est. strength" value={unit.estimatedStrength || '3,000–6,000'} />
        <Row label="Confidence" value="Low (scouts, dust)" />
        <Row label="Location" value={toGridRef(unit.position)} />
        <p className="text-[10px] text-neutral-500 leading-snug mt-2">
          Move cavalry or forward infantry within reconnaissance range to identify the formation and its commander.
        </p>
      </>,
      'Outside direct line of sight',
      'Unidentified contact'
    );
  }

  const suppressionVal = Math.round(unit.suppression || 0);
  const fatigueVal = Math.round(unit.fatigue || 0);
  const strengthRatio = unit.strength / Math.max(1, unit.initialStrength);
  const fatiguePenalty = Math.max(0, 1 - (fatigueVal / 100) * 0.35);
  const suppressionPenalty = Math.max(0, 1 - (suppressionVal / 100) * 0.4);
  const effectiveness = Math.round(strengthRatio * (unit.morale / 100) * fatiguePenalty * suppressionPenalty * 100);
  const ammoRatio = unit.maxAmmo > 0 ? unit.ammo / unit.maxAmmo : 1;
  const cover = engine.getTerrainCover(unit.position);
  const isPlayer = unit.faction === state.playerFaction;
  const isWavering =
    unit.status === 'wavering' || (unit.morale <= 50 && unit.morale > 25 && unit.status !== 'routing' && unit.status !== 'shattered');
  const detachCount = Math.round((unit.strength * splitPct) / 100);

  const statusText =
    unit.type === 'artillery' && unit.canisterActive
      ? 'Canister'
      : unit.type === 'artillery' && unit.currentOrder?.type === 'bombard' && unit.currentOrder.status === 'executing'
      ? 'Firing mission'
      : unit.type === 'artillery' && (unit.directDefenseActive || (unit.status === 'engaging' && unit.currentOrder?.type !== 'bombard'))
      ? 'Direct fire'
      : unit.status[0].toUpperCase() + unit.status.slice(1);

  const authority = !isPlayer
    ? null
    : unit.currentOrder?.source === 'player'
    ? 'HQ order'
    : unit.currentOrder?.source === 'subordinate'
    ? 'Subordinate initiative'
    : unit.currentOrder?.source === 'historical_event'
    ? 'Battle plan'
    : 'Standing by';

  // Conditions: everything the map no longer prints beside the symbol
  const conditions: { label: string; detail?: string; alert?: boolean }[] = [];
  if (unit.isEncircled) conditions.push({ label: 'Isolated', detail: 'supply line cut', alert: true });
  if (unit.status === 'routing') conditions.push({ label: 'Routing', alert: true });
  else if (isWavering) conditions.push({ label: 'Wavering', detail: `${Math.round(unit.morale)}% cohesion`, alert: true });
  if (unit.maxAmmo > 0 && unit.ammo <= 0) conditions.push({ label: 'Out of ammunition', detail: eraProfile.meleeOnlyNoun, alert: true });
  else if (ammoRatio < 0.2) conditions.push({ label: 'Low ammunition', alert: true });
  if (unit.gunsDisabled && unit.gunsDisabled > 0) conditions.push({ label: 'Guns disabled', detail: `${unit.gunsDisabled}`, alert: true });
  if (unit.isEnfiladed) conditions.push({ label: 'Enfiladed', detail: 'crossfire', alert: true });
  if (unit.isWadingRiver) conditions.push({ label: 'Wading stream', detail: '−75% speed' });
  if (unit.isGarrisoned) conditions.push({ label: 'Garrisoned', detail: '+80% cover' });
  if (unit.isForcedMarch) conditions.push({ label: 'Forced march' });
  if (unit.volleyReady) conditions.push({ label: 'Volley ready' });
  if (unit.suppressingTargetId || unit.currentOrder?.type === 'suppress') conditions.push({ label: 'Covering fire' });
  if (unit.observerForBatteryId) conditions.push({ label: 'Observing for battery' });
  if (unit.isSkirmishScreenActive) conditions.push({ label: 'Skirmish screen out' });
  if (unit.isGrandBatteryLeader) conditions.push({ label: 'Grand battery', detail: 'lead' });
  else if (unit.grandBatteryGroupId) conditions.push({ label: 'Grand battery' });
  if (unit.isResupplying) conditions.push({ label: 'Resupplying' });
  if (unit.currentOrder?.status === 'delivering') {
    const eta = Math.max(0, Math.ceil((unit.currentOrder.dispatchArrivalTime || 0) - state.timeMinutes));
    conditions.push({ label: 'Order in transit', detail: `ETA ${eta} min` });
  }
  if (unit.currentOrder?.status === 'standby') {
    conditions.push({ label: 'Standby', detail: `starts ${engine.formatTime(unit.currentOrder.startTime || 0)}` });
  }
  if (unit.currentOrder && unit.currentOrder.endTime !== undefined) {
    conditions.push({ label: 'Timed order', detail: `until ${engine.formatTime(unit.currentOrder.endTime)}` });
  }
  if (unit.currentOrder?.condition) {
    conditions.push({
      label: unit.currentOrder.condition.triggered ? 'Contingency triggered' : 'Contingency armed',
      detail: unit.currentOrder.condition.description,
      alert: unit.currentOrder.condition.triggered,
    });
  }
  if (unit.currentOrder?.chainedOrder) conditions.push({ label: 'Follow-up', detail: unit.currentOrder.chainedOrder.type });

  const canAssault = unit.type === 'infantry' || unit.type === 'cavalry';
  const isFoot = unit.type === 'infantry' || unit.type === 'guard';

  return shell(
    <>
      <SectionLabel>State</SectionLabel>
      <Row
        label={`Strength (${troopNoun.toLowerCase()})`}
        value={`${Math.round(unit.strength).toLocaleString()} / ${unit.initialStrength.toLocaleString()}`}
        alert={strengthRatio < 0.5}
      />
      <Meter
        label="Effectiveness"
        pct={effectiveness}
        text={`${effectiveness}%`}
        alert={effectiveness < 45}
        warn={effectiveness < 75}
      />
      <Meter label="Cohesion" pct={unit.morale} text={`${Math.round(unit.morale)}%`} alert={unit.morale <= 30} warn={unit.morale <= 60} />
      <Meter label="Fatigue" pct={fatigueVal} text={`${fatigueVal}%`} alert={fatigueVal > 80} warn={fatigueVal > 50} />
      <Meter label="Suppression" pct={suppressionVal} text={`${suppressionVal}%`} alert={suppressionVal > 60} warn={suppressionVal > 30} />
      <Meter
        label="Ammunition"
        pct={ammoRatio * 100}
        text={`${Math.max(0, Math.round(unit.ammo))} / ${unit.maxAmmo}`}
        alert={ammoRatio < 0.25}
      />
      <Row label="Status" value={`${statusText} · ${unit.formation}`} />
      {authority && <Row label="Authority" value={authority} />}
      <Row label="Location" value={toGridRef(unit.position)} />
      <Row label="Terrain" value={engine.getTerrainAt(unit.position)?.name || 'Open ground'} />
      <Row label="Cover" value={`${Math.round(cover * 100)}%`} />
      <Row
        label="Armament"
        value={unit.type === 'artillery' ? eraProfile.artilleryType : eraProfile.directFireType}
        title={unit.type === 'artillery' ? eraProfile.artilleryType : eraProfile.directFireType}
      />

      <SectionLabel>Attrition</SectionLabel>
      {(() => {
        const rates = engine.getUnitCasualtyRates(unit.id, 10);
        const taken = Math.round(unit.casualtiesTaken || 0);
        const inflicted = Math.round(unit.kills || 0);
        const hist = state.unitLossHistory[unit.id] || [];
        const points = [
          ...hist.map((h) => ({ t: h.t, values: [h.casualties, h.kills] })),
          { t: state.timeMinutes, values: [taken, inflicted] },
        ];
        return (
          <>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px]">
              <span />
              <span className="text-right font-mono text-neutral-500">Taken</span>
              <span className="text-right font-mono text-neutral-500">Inflicted</span>
              <span className="text-neutral-500 py-[2px] border-t border-[#e4e4e7]">Total</span>
              <span className="text-right font-mono py-[2px] border-t border-[#e4e4e7]">{fmt(taken)}</span>
              <span className="text-right font-mono py-[2px] border-t border-[#e4e4e7]">{fmt(inflicted)}</span>
              <span className="text-neutral-500 py-[2px] border-t border-[#e4e4e7]">Last 10 min</span>
              <span className="text-right font-mono py-[2px] border-t border-[#e4e4e7]">{fmt(rates.taken)}</span>
              <span className="text-right font-mono py-[2px] border-t border-[#e4e4e7]">{fmt(rates.inflicted)}</span>
              <span className="text-neutral-500 py-[2px] border-t border-[#e4e4e7]">Rate per hour</span>
              <span className={`text-right font-mono py-[2px] border-t border-[#e4e4e7] ${rates.takenPerHour > unit.strength * 0.5 ? 'text-[#b91c1c] font-bold' : ''}`}>
                {fmt(rates.takenPerHour)}
              </span>
              <span className="text-right font-mono py-[2px] border-t border-[#e4e4e7]">{fmt(rates.inflictedPerHour)}</span>
            </div>
            {rates.takenPerHour > 0 && (
              <Row
                label="At this rate, ineffective in"
                value={(() => {
                  // Time until strength falls below half of establishment at the current loss rate
                  const remaining = unit.strength - unit.initialStrength * 0.5;
                  if (remaining <= 0) return 'now';
                  const mins = (remaining / rates.takenPerHour) * 60;
                  return mins >= 120 ? `${(mins / 60).toFixed(1)} h` : `${Math.round(mins)} min`;
                })()}
                alert={(unit.strength - unit.initialStrength * 0.5) / rates.takenPerHour < 0.5}
              />
            )}
            {points.length >= 2 && (taken > 0 || inflicted > 0) ? (
              <div className="mt-1.5">
                <TimeSeriesChart points={points} series={UNIT_SERIES} width={276} height={100} ariaLabel={`Casualties taken and inflicted by ${unit.name}`} />
                <ChartLegend series={UNIT_SERIES} />
              </div>
            ) : (
              <p className="text-[10px] text-neutral-500 mt-1">No casualties taken or inflicted yet.</p>
            )}
          </>
        );
      })()}

      {conditions.length > 0 && (
        <>
          <SectionLabel>Conditions</SectionLabel>
          {conditions.map((c) => (
            <Row key={c.label} label={c.label} value={c.detail || ''} alert={c.alert} />
          ))}
        </>
      )}

      {isPlayer && (
        <>
          <SectionLabel>Formation</SectionLabel>
          <div className="grid grid-cols-3 gap-1">
            <Btn onClick={() => engine.setUnitFormation(unit.id, 'line')} active={unit.formation === 'line'} title="Deploy in line">
              Line
            </Btn>
            <Btn onClick={() => engine.setUnitFormation(unit.id, 'column')} active={unit.formation === 'column'} title="March column">
              Column
            </Btn>
            <Btn onClick={() => engine.setUnitFormation(unit.id, 'square')} active={unit.formation === 'square'} title="All-round defence">
              Square
            </Btn>
          </div>

          <SectionLabel>Orders</SectionLabel>
          <div className="grid grid-cols-3 gap-1">
            <Btn onClick={() => engine.holdGround(unit.id)} title="Hold current position">Hold</Btn>
            <Btn onClick={() => engine.cancelOrder(unit.id)} disabled={!unit.currentOrder} title="Cancel the current order">
              Halt
            </Btn>
            <Btn
              onClick={() => engine.toggleForceMarch(unit.id)}
              active={unit.isForcedMarch}
              title="+45% speed, ignores fatigue penalties, fatigue accrues 2.5× faster"
            >
              Force march
            </Btn>
            <Btn onClick={() => handleQuickOrder('flank_left')}>Flank left</Btn>
            <Btn onClick={() => handleQuickOrder('advance')}>Advance</Btn>
            <Btn onClick={() => handleQuickOrder('flank_right')}>Flank right</Btn>
            {canAssault && (
              <Btn onClick={handleChargeOrder} danger title="Assault the nearest enemy with shock" className="col-span-3">
                {unit.type === 'cavalry' ? 'Charge' : 'Assault'} <span className="text-red-200 font-mono">F</span>
              </Btn>
            )}
          </div>

          {isFoot && (
            <div className="grid grid-cols-2 gap-1 mt-1">
              <Btn
                onClick={() => engine.toggleSkirmishScreen(unit.id)}
                active={unit.isSkirmishScreenActive}
                title={`Forward screen of ${eraProfile.skirmishScreenType}: absorbs 35% of incoming fire, blunts charges`}
              >
                Skirmishers
              </Btn>
              <Btn onClick={handleEntrench} title="Construct fieldworks at the current position">
                Dig in
              </Btn>
            </div>
          )}

          {unit.type === 'artillery' && (
            <div className="grid grid-cols-3 gap-1 mt-1">
              <Btn
                onClick={() => onStartBombardTargeting?.(unit.id)}
                active={isBombardTargeting}
                danger
                title="Select a target on the map"
              >
                {isBombardTargeting ? 'Pick target' : 'Fire mission'}
              </Btn>
              <Btn onClick={handleCounterBattery} title={`Counter-battery against the nearest enemy guns (${eraProfile.counterBatteryType})`}>
                Counter-bty
              </Btn>
              <Btn
                onClick={handleGrandBattery}
                active={!!unit.grandBatteryGroupId}
                title={unit.grandBatteryGroupId ? 'Disband the grand battery' : `Mass all batteries: ${eraProfile.grandBatteryType}`}
              >
                Grand bty
              </Btn>
            </div>
          )}

          <SectionLabel>Task organisation</SectionLabel>
          {!isSplitting ? (
            <Btn onClick={() => setIsSplitting(true)} className="w-full">
              Detach sub-unit
            </Btn>
          ) : (
            <div className="border border-[#a1a1aa] bg-white p-2 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Detach</span>
                <span className="font-mono">
                  {detachCount.toLocaleString()} ({splitPct}%)
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={splitPct}
                onChange={(e) => setSplitPct(parseInt(e.target.value))}
                className="w-full h-1 bg-[#a1a1aa] appearance-none cursor-pointer accent-[#1e3a8a]"
              />
              <input
                type="text"
                placeholder={`${unit.name} (Det)`}
                value={detachmentName}
                onChange={(e) => setDetachmentName(e.target.value)}
                className="w-full bg-[#f4f4f5] border border-[#a1a1aa] px-1.5 py-1 text-[10px] text-black focus:outline-none focus:border-[#1e3a8a]"
              />
              <div className="grid grid-cols-2 gap-1">
                <Btn onClick={() => setIsSplitting(false)}>Cancel</Btn>
                <Btn onClick={handleExecuteSplit} active>
                  Detach
                </Btn>
              </div>
            </div>
          )}
        </>
      )}
    </>,
    <>
      {unit.commander} · {unit.corps}
    </>,
    unit.name
  );
});
