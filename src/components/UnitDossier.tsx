import React, { useState } from 'react';
import { Unit, ERA_WEAPON_PROFILES } from '../types/game';
import { BattleEngine } from '../engine/simulation';
import { X } from './glyphs';
import { ui, cx } from './ui';
import { UnitSymbol } from './UnitSymbol';
import { designationFor } from '../engine/natoSymbols';

interface UnitDossierProps {
  unit: Unit | null;
  engine: BattleEngine;
  onClose: () => void;
  onStartBombardTargeting?: (unitId: string) => void;
  isBombardTargeting?: boolean;
}

const STATUS_LABEL: Record<Unit['status'], string> = {
  idle: 'Idle',
  marching: 'Moving',
  engaging: 'Engaged',
  charging: 'Charging',
  melee: 'In melee',
  holding: 'Holding',
  entrenching: 'Entrenching',
  wavering: 'Wavering',
  routing: 'Routing',
  shattered: 'Destroyed',
};

const ORDER_LABEL: Record<string, string> = {
  march: 'Move',
  assault: 'Attack',
  flank: 'Flank',
  charge: 'Charge',
  bombard: 'Fire mission',
  retreat: 'Withdraw',
  hold: 'Hold',
  entrench: 'Entrench',
  suppress: 'Suppress',
  volley: 'Volley',
};

const Meter: React.FC<{ label: string; value: string; ratio: number; tone?: 'normal' | 'warn' | 'bad' }> = ({
  label,
  value,
  ratio,
  tone = 'normal',
}) => (
  <div className="grid grid-cols-[84px_1fr_auto] items-center gap-2 h-5">
    <span className="text-[11px] text-stone-600">{label}</span>
    <div className="h-1.5 bg-[#e3dfd6] overflow-hidden">
      <div
        className={cx('h-full', tone === 'bad' ? 'bg-[#c2272d]' : tone === 'warn' ? 'bg-[#d97706]' : 'bg-[#3d4f6b]')}
        style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
      />
    </div>
    <span className={cx(ui.mono, 'text-[11px] text-stone-900 text-right min-w-[58px]')}>{value}</span>
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-3 py-[2px]">
    <span className="text-[11px] text-stone-500 flex-shrink-0">{label}</span>
    <span className="text-[11px] text-stone-900 text-right truncate">{children}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="px-2.5 py-2 border-t border-[#dedad1]">
    <div className={cx(ui.caption, 'mb-1')}>{title}</div>
    {children}
  </section>
);

const actionBtn =
  'inline-flex items-center justify-center gap-1.5 h-6 px-1.5 border border-[#b3ada2] bg-[#fbfaf7] text-[11px] text-stone-800 hover:bg-white hover:border-[#8f897e] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const actionBtnOn = '!bg-[#23324a] !border-[#23324a] !text-white';

export const UnitDossier: React.FC<UnitDossierProps> = ({
  unit,
  engine,
  onClose,
  onStartBombardTargeting,
  isBombardTargeting = false,
}) => {
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  const [detachmentName, setDetachmentName] = useState('');

  if (!unit) return null;

  const state = engine.getState();
  const isPlayerUnit = unit.faction === state.playerFaction;
  const isHostileFrame = !isPlayerUnit && state.wargameSymbology === 'nato';
  const eraProfile = ERA_WEAPON_PROFILES[state.era || 'napoleonic'] || ERA_WEAPON_PROFILES.napoleonic;

  const panelClass = cx(
    ui.panel,
    'fixed z-40 right-1.5 top-[42px] w-[296px] max-w-[calc(100vw-12px)] max-h-[calc(100vh-76px)] flex flex-col font-sans select-none overflow-hidden'
  );

  const header = (
    <div className={ui.windowHeader}>
      <span>{isPlayerUnit ? 'Unit' : 'Enemy unit'}</span>
      <button onClick={onClose} className={cx(ui.btnIcon, 'h-6 w-6')} title="Close (Esc)">
        <X size={14} />
      </button>
    </div>
  );

  // Unidentified contact: only what reconnaissance has established
  if (unit.detectionState === 'contact') {
    return (
      <aside className={panelClass}>
        {header}
        <div className="px-3 py-3">
          <div className="text-[12px] font-semibold text-stone-900">Unidentified contact</div>
          <div className="text-[11px] text-stone-500 mt-0.5">Outside direct observation</div>
          <div className="mt-2">
            <Row label="Estimated strength">{unit.estimatedStrength || '3,000 – 6,000'}</Row>
            <Row label="Confidence">Low</Row>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-stone-500">
            Move cavalry or forward infantry within observation range to identify this formation.
          </p>
        </div>
      </aside>
    );
  }

  const strengthRatio = unit.strength / Math.max(1, unit.initialStrength);
  const fatigue = Math.round(unit.fatigue || 0);
  const suppression = Math.round(unit.suppression || 0);
  const ammoRatio = unit.ammo / Math.max(1, unit.maxAmmo);
  const effectiveness = Math.round(
    strengthRatio * (unit.morale / 100) * Math.max(0, 1 - (fatigue / 100) * 0.35) * Math.max(0, 1 - (suppression / 100) * 0.4) * 100
  );
  const terrain = engine.getTerrainAt(unit.position);
  const cover = Math.round(engine.getTerrainCover(unit.position) * 100);
  const order = unit.currentOrder;
  const minutesToArrival = order?.dispatchArrivalTime !== undefined ? Math.max(0, Math.ceil(order.dispatchArrivalTime - state.timeMinutes)) : 0;

  const alerts: { text: string; tone: 'warn' | 'bad' }[] = [];
  if (unit.isEncircled) alerts.push({ text: 'Isolated: line of supply cut', tone: 'bad' });
  if (unit.ammo <= 0) alerts.push({ text: `Out of ammunition: ${eraProfile.meleeOnlyNoun.toLowerCase()}`, tone: 'bad' });
  if (unit.gunsDisabled && unit.gunsDisabled > 0) alerts.push({ text: `${unit.gunsDisabled} guns disabled`, tone: 'warn' });
  if (unit.isEnfiladed) alerts.push({ text: 'Under enfilade fire', tone: 'bad' });

  const handleChargeOrder = () => {
    const enemyFaction = unit.faction === 'french' ? 'allies' : 'french';
    let nearestEnemy: Unit | null = null;
    let minDist = 350;
    for (const u of state.units) {
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
    engine.issueOrder(unit.id, { unitId: unit.id, type: 'charge', destination: dest, waypoints: [], plannedTime: state.timeMinutes });
  };

  const handleQuickOrder = (type: 'flank_left' | 'flank_right' | 'advance') => {
    if (type !== 'advance') {
      const plan = engine.planFlankAttack(unit.id, type === 'flank_left' ? 'left' : 'right');
      if (plan) {
        engine.issueOrder(unit.id, {
          unitId: unit.id,
          type: 'flank',
          destination: plan.destination,
          waypoints: [],
          curveControl: plan.curveControl,
          finalHeading: plan.finalHeading,
          targetUnitId: plan.target.id,
          plannedTime: state.timeMinutes,
        });
        return;
      }
    }
    // No enemy in sight (or plain advance): wheel forward on the chosen side
    const fwd = 120;
    const fx = Math.cos(unit.heading);
    const fy = Math.sin(unit.heading);
    const px = fy;
    const py = -fx;
    const side = type === 'flank_left' ? 1 : type === 'flank_right' ? -1 : 0;
    const clampX = (v: number) => Math.max(30, Math.min(2370, v));
    const clampY = (v: number) => Math.max(30, Math.min(1470, v));
    const dest = { x: clampX(unit.position.x + fx * fwd + px * 90 * side), y: clampY(unit.position.y + fy * fwd + py * 90 * side) };
    const curveControl = side
      ? { x: unit.position.x + fx * 60 + px * 110 * side, y: unit.position.y + fy * 60 + py * 110 * side }
      : undefined;
    engine.issueOrder(unit.id, { unitId: unit.id, type: side ? 'flank' : 'assault', destination: dest, waypoints: [], curveControl, plannedTime: state.timeMinutes });
  };

  const handleCounterBattery = () => {
    const enemyFaction = unit.faction === 'french' ? 'allies' : 'french';
    let nearest: Unit | null = null;
    let minDist = Infinity;
    for (const eb of state.units) {
      if (eb.faction !== enemyFaction || eb.type !== 'artillery' || eb.status === 'shattered') continue;
      const d = Math.hypot(eb.position.x - unit.position.x, eb.position.y - unit.position.y);
      if (d < minDist) {
        minDist = d;
        nearest = eb;
      }
    }
    if (nearest) engine.issueCounterBattery(unit.id, nearest.id);
  };

  const handleGrandBattery = () => {
    if (unit.grandBatteryGroupId) {
      engine.disbandGrandBattery(unit.grandBatteryGroupId);
      return;
    }
    const batteries = state.units.filter((u) => u.faction === unit.faction && u.type === 'artillery' && u.status !== 'shattered');
    if (batteries.length >= 2) engine.formGrandBattery(batteries.map((b) => b.id), unit.id);
  };

  const detachCount = Math.round((unit.strength * splitPct) / 100);
  const handleExecuteSplit = () => {
    if (detachCount <= 0 || detachCount >= unit.strength) return;
    engine.splitUnit(unit.id, detachCount, detachmentName.trim() || `${unit.name} (Det)`, unit.corps);
    setIsSplitting(false);
    setDetachmentName('');
  };

  const isInfantry = unit.type === 'infantry' || unit.type === 'guard';
  const canAssault = isInfantry || unit.type === 'cavalry';

  return (
    <aside className={panelClass}>
      {header}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Identity */}
        <div className="flex items-start gap-2.5 px-2.5 pt-2.5 pb-2">
          <UnitSymbol unit={unit} hostile={isHostileFrame} size={34} />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-tight text-stone-900 truncate">{designationFor(unit)}</div>
            <div className="text-[11px] text-stone-600 truncate">{unit.name.match(/\(([^)]*)\)/)?.[1] ?? unit.corps}</div>
            <div className="text-[10.5px] text-stone-500 truncate">{unit.commander}</div>
          </div>
        </div>

        {/* Current status & order */}
        <div className="px-2.5 pb-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={cx(
                'h-2 w-2',
                unit.status === 'routing' || unit.status === 'melee'
                  ? 'bg-[#c2272d]'
                  : unit.status === 'engaging' || unit.status === 'charging' || unit.status === 'wavering'
                  ? 'bg-[#d97706]'
                  : unit.status === 'idle'
                  ? 'bg-stone-400'
                  : 'bg-[#2f6b3a]'
              )}
            />
            <span className="font-medium text-stone-900">{STATUS_LABEL[unit.status]}</span>
            <span className="text-stone-400">·</span>
            <span className="text-stone-600 capitalize">{unit.formation}</span>
            {unit.isForcedMarch && <span className="text-stone-600">· forced march</span>}
          </div>
          {isPlayerUnit && order && (
            <div className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
              <span className="text-stone-900">{ORDER_LABEL[order.type] ?? order.type}</span>
              {order.status === 'delivering' && <span> · courier arrives in {minutesToArrival} min</span>}
              {order.status === 'standby' && <span> · starts {engine.formatTime(order.startTime || 0)}</span>}
              {order.status === 'executing' && <span> · executing</span>}
              {order.endTime !== undefined && <span> · until {engine.formatTime(order.endTime)}</span>}
              {order.source === 'subordinate' && <span> · commander’s initiative</span>}
              {order.condition && (
                <div>
                  {order.condition.triggered ? 'Triggered: ' : 'If '}
                  {order.condition.description.toLowerCase()} → {order.condition.contingencyAction || 'act'}
                </div>
              )}
              {order.chainedOrder && <div>Then: {ORDER_LABEL[order.chainedOrder.type] ?? order.chainedOrder.type}</div>}
            </div>
          )}
          {alerts.map((a) => (
            <div
              key={a.text}
              className={cx(
                'mt-1.5 px-2 py-1 text-[11px] border-l-2',
                a.tone === 'bad' ? 'border-[#c2272d] bg-[#c2272d]/[0.06] text-[#8f1d22]' : 'border-[#d97706] bg-[#d97706]/[0.07] text-[#92400e]'
              )}
            >
              {a.text}
            </div>
          ))}
        </div>

        <Section title="Condition">
          <Meter
            label="Strength"
            value={`${unit.strength.toLocaleString()}`}
            ratio={strengthRatio}
            tone={strengthRatio < 0.35 ? 'bad' : strengthRatio < 0.6 ? 'warn' : 'normal'}
          />
          <Meter label="Effectiveness" value={`${effectiveness}%`} ratio={effectiveness / 100} tone={effectiveness < 45 ? 'bad' : effectiveness < 75 ? 'warn' : 'normal'} />
          <Meter label="Cohesion" value={`${Math.round(unit.morale)}%`} ratio={unit.morale / 100} tone={unit.morale <= 30 ? 'bad' : unit.morale <= 55 ? 'warn' : 'normal'} />
          <Meter label="Fatigue" value={`${fatigue}%`} ratio={fatigue / 100} tone={fatigue > 80 ? 'bad' : fatigue > 55 ? 'warn' : 'normal'} />
          <Meter label="Suppression" value={`${suppression}%`} ratio={suppression / 100} tone={suppression > 60 ? 'bad' : suppression > 30 ? 'warn' : 'normal'} />
          <Meter
            label="Ammunition"
            value={`${Math.max(0, Math.round(unit.ammo))} / ${unit.maxAmmo}`}
            ratio={ammoRatio}
            tone={ammoRatio <= 0.1 ? 'bad' : ammoRatio < 0.3 ? 'warn' : 'normal'}
          />
          <div className="mt-1.5">
            <Row label="Starting strength">{unit.initialStrength.toLocaleString()}</Row>
            <Row label="Terrain">{terrain?.name || 'Open ground'}{cover > 0 ? ` · ${cover}% cover` : ''}</Row>
            <Row label="Weapon">{unit.type === 'artillery' ? eraProfile.artilleryType : eraProfile.directFireType}</Row>
            <Row label="Quality">{unit.experience}</Row>
          </div>
        </Section>

        {isPlayerUnit ? (
          <>
            {unit.type !== 'headquarters' && unit.type !== 'supply' && (
              <Section title="Formation">
                <div className={cx(ui.group, 'w-full')}>
                  {(['line', 'column', 'square'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => engine.setUnitFormation(unit.id, f)}
                      className={cx(ui.groupItem, 'flex-1 capitalize text-[11px] font-medium', unit.formation === f && ui.groupItemActive)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Orders">
              <div className="grid grid-cols-3 gap-1">
                <button className={actionBtn} onClick={() => handleQuickOrder('flank_left')} title="Attack the flank of the nearest enemy in sight, swinging left">
                  Flank left
                </button>
                <button className={actionBtn} onClick={() => handleQuickOrder('advance')} title="Advance about 600 m">
                  Advance
                </button>
                <button className={actionBtn} onClick={() => handleQuickOrder('flank_right')} title="Attack the flank of the nearest enemy in sight, swinging right">
                  Flank right
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <button className={actionBtn} onClick={() => engine.holdGround(unit.id)}>
                  Hold position
                </button>
                <button className={actionBtn} onClick={() => engine.cancelOrder(unit.id)} disabled={!order}>
                  Cancel order
                </button>
                <button
                  className={cx(actionBtn, unit.isForcedMarch && actionBtnOn)}
                  onClick={() => engine.toggleForceMarch(unit.id)}
                  title="Faster movement (+45%), but fatigue builds much faster"
                >
                  Forced march
                </button>
                {isInfantry && (
                  <button
                    className={cx(actionBtn, unit.isSkirmishScreenActive && actionBtnOn)}
                    onClick={() => engine.toggleSkirmishScreen(unit.id)}
                    title={`${eraProfile.skirmishScreenType}: absorbs fire and blunts charges`}
                  >
                    Skirmishers
                  </button>
                )}
                {isInfantry && (
                  <button
                    className={actionBtn}
                    onClick={() =>
                      engine.issueOrder(unit.id, { unitId: unit.id, type: 'entrench', destination: { ...unit.position }, waypoints: [], plannedTime: 0 })
                    }
                    title="Dig field fortifications in place"
                  >
                    Entrench
                  </button>
                )}
                {canAssault && (
                  <button
                    className={cx(actionBtn, '!text-[#8f1d22] !border-[#c2272d]/60 hover:!bg-[#c2272d]/[0.06]')}
                    onClick={handleChargeOrder}
                    title="Attack the nearest enemy within 1.75 km (F)"
                  >
                    {unit.type === 'cavalry' ? 'Charge' : 'Assault'}
                    <kbd className="font-mono text-[10px] opacity-60">F</kbd>
                  </button>
                )}
              </div>
            </Section>

            {unit.type === 'artillery' && (
              <Section title="Fire support">
                <div className="grid grid-cols-1 gap-1">
                  <button
                    className={cx(actionBtn, isBombardTargeting && actionBtnOn)}
                    onClick={() => onStartBombardTargeting?.(unit.id)}
                    title="Select a target area on the map (B)"
                  >
                    {isBombardTargeting ? 'Select target on map…' : 'Fire mission'}
                  </button>
                  <div className="grid grid-cols-2 gap-1">
                    <button className={actionBtn} onClick={handleCounterBattery} title={eraProfile.counterBatteryType}>
                      Counter-battery
                    </button>
                    <button
                      className={cx(actionBtn, !!unit.grandBatteryGroupId && actionBtnOn)}
                      onClick={handleGrandBattery}
                      title={`Mass all batteries on one target: ${eraProfile.grandBatteryType}`}
                    >
                      Grand battery
                    </button>
                  </div>
                </div>
              </Section>
            )}

            {unit.type !== 'headquarters' && (
              <Section title="Organisation">
                {!isSplitting ? (
                  <button className={cx(actionBtn, 'w-full')} onClick={() => setIsSplitting(true)}>
                    
                    Detach a sub-unit
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-600">Detach</span>
                      <span className={cx(ui.mono, 'text-stone-900')}>
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
                      className="w-full h-1 bg-[#b3ada2] appearance-none cursor-pointer accent-[#23324a]"
                    />
                    <input
                      type="text"
                      placeholder={`${unit.name} (Det)`}
                      value={detachmentName}
                      onChange={(e) => setDetachmentName(e.target.value)}
                      className="w-full h-7 px-2 bg-white border border-[#b3ada2] text-[11px] text-stone-900 focus:outline-none focus:border-[#23324a]"
                    />
                    <div className="grid grid-cols-2 gap-1">
                      <button className={actionBtn} onClick={() => setIsSplitting(false)}>
                        Cancel
                      </button>
                      <button className={cx(actionBtn, actionBtnOn)} onClick={handleExecuteSplit}>
                        Detach
                      </button>
                    </div>
                  </div>
                )}
              </Section>
            )}
          </>
        ) : (
          <div className="px-3 py-2.5 border-t border-[#dedad1] text-[11px] text-stone-500">
            Enemy formation. Orders can only be given to your own units.
          </div>
        )}
      </div>
    </aside>
  );
};
