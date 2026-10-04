import React, { useState, useRef, useMemo } from 'react';
import { Unit, ERA_WEAPON_PROFILES } from '../types/game';
import { BattleEngine } from '../engine/simulation';
import { X, Shield, Scissors, Check, Flame, Zap, Activity, GripVertical, Crosshair } from 'lucide-react';

interface UnitDossierProps {
  unit: Unit | null;
  engine: BattleEngine;
  onClose: () => void;
  onStartBombardTargeting?: (unitId: string) => void;
  isBombardTargeting?: boolean;
}

export const UnitDossier: React.FC<UnitDossierProps> = React.memo(({
  unit,
  engine,
  onClose,
  onStartBombardTargeting,
  isBombardTargeting = false,
}) => {
  if (!unit) return null;

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const currentPos = useMemo(() => {
    if (position) return position;
    const defaultX = typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 336) : 700;
    return { x: defaultX, y: 56 };
  }, [position]);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startMouseX: number; startMouseY: number; startPosX: number; startPosY: number }>({
    startMouseX: 0,
    startMouseY: 0,
    startPosX: 0,
    startPosY: 0,
  });

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('select')) {
      return;
    }
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: currentPos.x,
      startPosY: currentPos.y,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.startMouseX;
      const dy = moveEvent.clientY - dragStartRef.current.startMouseY;
      const maxX = Math.max(0, window.innerWidth - 260);
      const maxY = Math.max(48, window.innerHeight - 80);
      setPosition({
        x: Math.max(8, Math.min(maxX, dragStartRef.current.startPosX + dx)),
        y: Math.max(48, Math.min(maxY, dragStartRef.current.startPosY + dy)),
      });
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const [isSplitting, setIsSplitting] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  const [detachmentName, setDetachmentName] = useState('');
  const [detachmentCorps, setDetachmentCorps] = useState('');

  const isFrench = unit.faction === 'french';
  const factionBadge = isFrench ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'bg-[#dc2626] text-white border-[#b91c1c]';
  const factionTitle = isFrench ? 'BLUFOR' : 'REDFOR';

  const era = engine.getState().era || 'napoleonic';
  const eraProfile = ERA_WEAPON_PROFILES[era] || ERA_WEAPON_PROFILES.napoleonic;
  const troopNoun =
    unit.type === 'cavalry'
      ? eraProfile.troopNouns.cavalry
      : unit.type === 'artillery'
      ? eraProfile.troopNouns.artillery
      : unit.type === 'headquarters'
      ? 'Staff & Escort'
      : unit.type === 'supply'
      ? 'Wagons & Teamsters'
      : eraProfile.troopNouns.infantry;

  const handleFormationChange = (formation: Unit['formation']) => {
    engine.setUnitFormation(unit.id, formation);
  };

  const handleCancelOrder = () => {
    engine.cancelOrder(unit.id);
  };

  const handleHoldGround = () => {
    engine.holdGround(unit.id);
  };

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

  const handleExecuteSplit = () => {
    const detachCount = Math.round((unit.strength * splitPct) / 100);
    if (detachCount <= 0 || detachCount >= unit.strength) return;

    const name = detachmentName.trim() || `${unit.name} (Det)`;
    const corps = detachmentCorps.trim() || unit.corps;

    engine.splitUnit(unit.id, detachCount, name, corps);
    setIsSplitting(false);
    setDetachmentName('');
    setDetachmentCorps('');
  };

  const detachCount = Math.round((unit.strength * splitPct) / 100);
  const suppressionVal = Math.round(unit.suppression || 0);

  if (unit.detectionState === 'contact') {
    return (
      <aside
        style={{ left: `${currentPos.x}px`, top: `${currentPos.y}px` }}
        className="fixed z-40 w-80 max-w-[calc(100vw-32px)] max-h-[72vh] min-h-[180px] bg-[#fbfbfa] border-2 border-[#71717a] shadow-2xl rounded-md p-2.5 text-black select-none flex flex-col overflow-hidden font-sans transition-all duration-150 animate-in slide-in-from-right-2"
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          onDoubleClick={() => setPosition(null)}
          className="flex items-start justify-between border-b-2 border-[#a1a1aa] pb-1.5 mb-2 cursor-grab active:cursor-grabbing select-none"
          title="Click & drag to move window (double click to reset)"
        >
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-neutral-400 hover:text-black cursor-grab pr-0.5" title="Drag to move">
                <GripVertical size={13} />
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 border uppercase tracking-wider bg-[#dc2626] text-white border-[#b91c1c]">
                HOSTILE CONTACT
              </span>
              <span className="text-[10px] font-bold text-neutral-600 bg-white border border-[#a1a1aa] px-1.5 py-0.5">
                INTEL UNCONFIRMED
              </span>
            </div>
            <h2 className="text-sm font-bold tracking-tight uppercase">UNCONFIRMED CONTACT</h2>
            <p className="text-[11px] text-neutral-600 font-bold uppercase">OUTSIDE DIRECT LINE OF SIGHT</p>
          </div>
          <button onClick={onClose} className="p-0.5 border hover:bg-white cursor-pointer"><X size={14} /></button>
        </div>
        <div className="bg-white p-2.5 border border-[#a1a1aa] space-y-1.5 text-xs font-mono rounded">
          <div className="flex justify-between border-b pb-1">
            <span className="text-neutral-500">EST. STRENGTH:</span>
            <span className="font-bold text-red-700">{unit.estimatedStrength || '3,000 - 6,000'}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="text-neutral-500">INTEL CONFIDENCE:</span>
            <span className="font-bold text-amber-600">LOW (SCOUT / DUST)</span>
          </div>
          <p className="text-[10px] text-neutral-500 font-sans mt-1.5 leading-snug">
            Maneuver friendly cavalry or forward line infantry within recon range to positively identify this enemy formation and commander.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{ left: `${currentPos.x}px`, top: `${currentPos.y}px` }}
      className="fixed z-40 w-80 max-w-[calc(100vw-32px)] max-h-[72vh] min-h-[300px] bg-[#fbfbfa] border-2 border-[#71717a] shadow-2xl rounded-md p-2.5 text-black select-none flex flex-col overflow-hidden font-sans transition-all duration-150 animate-in slide-in-from-right-2"
    >
      {/* Top Header: Faction Tag, Title, Drag Handle & Close */}
      <div
        onPointerDown={handleHeaderPointerDown}
        onDoubleClick={() => setPosition(null)}
        className="flex items-start justify-between border-b-2 border-[#a1a1aa] pb-1.5 mb-2 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
        title="Click & drag to move window (double click to reset)"
      >
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-neutral-400 hover:text-black cursor-grab pr-0.5" title="Drag to move">
              <GripVertical size={13} />
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 border uppercase tracking-wider shadow-sm ${factionBadge}`}>
              {factionTitle}
            </span>
            <span className="text-[10px] font-bold text-neutral-600 bg-white border border-[#a1a1aa] px-1.5 py-0.5 shadow-sm">
              {unit.type.toUpperCase()}
            </span>
          </div>
          <h2 className="text-sm font-bold tracking-tight uppercase">{unit.name}</h2>
          <p className="text-[11px] text-neutral-600 font-bold uppercase">{unit.commander} • {unit.corps}</p>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-black p-0.5 border border-transparent hover:border-[#a1a1aa] bg-transparent hover:bg-white transition-colors shadow-sm cursor-pointer"
          title="Close Panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable Dossier Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">

      {/* Encirclement Alert */}
      {unit.isEncircled && (
        <div className="mb-3 px-2 py-1.5 bg-[#fee2e2] border-2 border-[#ef4444] text-[#b91c1c] text-[10px] font-bold uppercase tracking-tight shadow-sm flex items-center gap-1.5">
          <span>ISOLATED: SUPPLY LINE SEVERED</span>
        </div>
      )}

      {/* Vital Metrics: Strength, Morale, Suppression, Fatigue */}
      <div className="space-y-1.5 mb-2.5 bg-white p-2 border border-[#a1a1aa] shadow-inner">
        {/* Physical Headcount (Bayonets / Sabres / Guns) */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold uppercase">
            <span className="text-neutral-600 flex items-center gap-1" title="Physical troop headcount in this formation">
              HEADCOUNT ({troopNoun.toUpperCase()}):
            </span>
            <div className="flex items-center gap-1">
              <span className="text-black text-xs font-mono">{unit.strength.toLocaleString()}</span>
              <span className="text-neutral-400 font-mono">/ {unit.initialStrength.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Combat Effectiveness Rating (Net combat power after casualties, morale, fatigue, suppression) */}
        {(() => {
          const strengthRatio = unit.strength / Math.max(1, unit.initialStrength);
          const moraleFactor = unit.morale / 100;
          const fatigueVal = Math.round(unit.fatigue || 0);
          const fatiguePenalty = Math.max(0, 1 - (fatigueVal / 100) * 0.35);
          const suppressionPenalty = Math.max(0, 1 - (suppressionVal / 100) * 0.40);
          const combatEffectiveness = Math.round(strengthRatio * moraleFactor * fatiguePenalty * suppressionPenalty * 100);
          const effRating = combatEffectiveness >= 75 ? 'READY' : combatEffectiveness >= 45 ? 'DEGRADED' : 'INEFFECTIVE';
          const effColor = combatEffectiveness >= 75 ? 'text-[#15803d]' : combatEffectiveness >= 45 ? 'text-[#ca8a04]' : 'text-[#dc2626]';
          return (
            <div>
              <div className="flex justify-between text-[10px] mb-0.5 font-bold uppercase">
                <span className="text-neutral-600 flex items-center gap-1">
                  <Activity size={10} className={combatEffectiveness >= 75 ? 'text-[#15803d]' : 'text-[#ca8a04]'} />
                  COMBAT EFFECTIVENESS
                </span>
                <span className={`${effColor} font-mono`}>
                  {combatEffectiveness}% • {effRating}
                </span>
              </div>
              <div className="w-full bg-[#d4d4d8] h-1.5 border border-[#a1a1aa] shadow-inner overflow-hidden">
                <div
                  className={`h-full ${combatEffectiveness >= 75 ? 'bg-[#15803d]' : combatEffectiveness >= 45 ? 'bg-[#eab308]' : 'bg-[#dc2626]'}`}
                  style={{ width: `${Math.max(0, Math.min(100, combatEffectiveness))}%` }}
                />
              </div>
            </div>
          );
        })()}

        {/* Morale Meter */}
        <div>
          <div className="flex justify-between text-[10px] mb-0.5 font-bold uppercase">
            <span className="text-neutral-600 flex items-center gap-1">
              <Shield size={10} className={unit.morale > 60 ? 'text-[#15803d]' : 'text-[#b45309]'} /> COHESION
            </span>
            <span>{Math.round(unit.morale)}%</span>
          </div>
          <div className="w-full bg-[#d4d4d8] h-1.5 border border-[#a1a1aa] shadow-inner overflow-hidden">
            <div
              className={`h-full ${
                unit.morale > 60 ? 'bg-[#15803d]' : unit.morale > 30 ? 'bg-[#eab308]' : 'bg-[#dc2626]'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, unit.morale))}%` }}
            />
          </div>
        </div>

        {/* Fatigue Meter */}
        {(() => {
          const fatigueVal = Math.round(unit.fatigue || 0);
          const fatigueRating = fatigueVal < 25 ? 'FRESH' : fatigueVal < 55 ? 'WINDED' : fatigueVal < 80 ? 'WEARY' : 'EXHAUSTED';
          return (
            <div>
              <div className="flex justify-between text-[10px] mb-0.5 font-bold uppercase">
                <span className="text-neutral-600 flex items-center gap-1">
                  <Zap size={10} className={fatigueVal > 60 ? 'text-[#ea580c]' : 'text-neutral-500'} /> FATIGUE
                </span>
                <span className={`${fatigueVal > 80 ? 'text-[#dc2626] font-black' : fatigueVal > 50 ? 'text-[#ea580c]' : 'text-black'} font-mono`}>
                  {fatigueVal}% • {fatigueRating} {unit.isForcedMarch && '[FORCED]'}
                </span>
              </div>
              <div className="w-full bg-[#d4d4d8] h-1.5 border border-[#a1a1aa] shadow-inner overflow-hidden">
                <div
                  className={`h-full ${fatigueVal > 80 ? 'bg-[#dc2626]' : fatigueVal > 50 ? 'bg-[#ea580c]' : 'bg-[#3b82f6]'}`}
                  style={{ width: `${Math.max(0, Math.min(100, fatigueVal))}%` }}
                />
              </div>
            </div>
          );
        })()}

        {/* Suppression Meter (Combat Fire Gauge) */}
        <div>
          <div className="flex justify-between text-[10px] mb-0.5 font-bold uppercase">
            <span className="text-neutral-600 flex items-center gap-1">
              <Flame size={10} className={suppressionVal > 30 ? 'text-[#c2410c]' : 'text-neutral-500'} /> SUPPRESSION
            </span>
            <span className={`${suppressionVal > 40 ? 'text-[#c2410c]' : 'text-black'}`}>
              {suppressionVal}% {suppressionVal > 50 && '• PINNED'}
            </span>
          </div>
          <div className="w-full bg-[#d4d4d8] h-1.5 border border-[#a1a1aa] shadow-inner overflow-hidden">
            <div
              className={`h-full ${
                suppressionVal > 60 ? 'bg-[#dc2626]' : suppressionVal > 30 ? 'bg-[#ea580c]' : 'bg-[#2563eb]'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, suppressionVal))}%` }}
            />
          </div>
        </div>
        
        {/* Ammo Gauge & Logistics Status */}
        <div className="mt-2">
          <div className="flex justify-between text-[10px] mb-0.5 font-bold uppercase">
            <span className="text-neutral-600 flex items-center gap-1" title={eraProfile.ammoNoun}>
              AMMO ({eraProfile.ammoNoun.toUpperCase()}):
            </span>
            <div className="flex items-center gap-1">
              {unit.isResupplying && (
                <span className="text-[9px] text-[#16a34a] font-bold animate-pulse">
                  +REPLENISHING
                </span>
              )}
              <span className={`${unit.ammo <= 0 ? 'text-[#dc2626] font-black' : 'text-black font-mono'}`}>
                {Math.max(0, Math.round(unit.ammo))} / {unit.maxAmmo}
              </span>
            </div>
          </div>
          <div className="w-full bg-[#d4d4d8] h-1.5 border border-[#a1a1aa] shadow-inner overflow-hidden">
            <div
              className={`h-full ${
                unit.ammo <= 0
                  ? 'bg-[#7f1d1d]'
                  : unit.ammo / Math.max(1, unit.maxAmmo) < 0.25
                  ? 'bg-[#dc2626]'
                  : 'bg-[#eab308]'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, (unit.ammo / Math.max(1, unit.maxAmmo)) * 100))}%` }}
            />
          </div>
          {unit.ammo <= 0 && (
            <div className="mt-1 bg-red-50 border border-red-300 text-red-700 px-1.5 py-0.5 text-[9px] font-bold uppercase flex items-center justify-between">
              <span>OUT OF AMMO</span>
              <span className="text-[8px] font-mono">{eraProfile.meleeOnlyNoun.toUpperCase()}</span>
            </div>
          )}
          {unit.gunsDisabled && unit.gunsDisabled > 0 && (
            <div className="mt-1 bg-amber-50 border border-amber-300 text-amber-800 px-1.5 py-0.5 text-[9px] font-bold uppercase flex items-center justify-between">
              <span>GUNS DISABLED:</span>
              <span className="text-red-700 font-mono">-{unit.gunsDisabled} KO PIECES</span>
            </div>
          )}
        </div>

        {/* Terrain & Status Tag */}
        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[#d4d4d8] font-bold uppercase mt-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">TERRAIN:</span>
            <span className="text-black text-right">
              {engine.getTerrainAt(unit.position)?.name || 'OPEN GROUND'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">COVER BONUS:</span>
            <span className={`${engine.getTerrainCover(unit.position) > 0 ? 'text-[#16a34a]' : 'text-black'}`}>
              {Math.round(engine.getTerrainCover(unit.position) * 100)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">ARMAMENT:</span>
            <span className="text-black text-right text-[9px] font-mono truncate max-w-[150px]" title={unit.type === 'artillery' ? eraProfile.artilleryType : eraProfile.directFireType}>
              {unit.type === 'artillery' ? eraProfile.artilleryType : eraProfile.directFireType}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-neutral-500">SYS STATUS:</span>
            <span
              className={`px-1.5 py-0.5 border shadow-sm ${
                unit.type === 'artillery' && unit.canisterActive
                  ? 'bg-[#ea580c] border-[#9a3412] text-white font-bold animate-pulse'
                  : unit.type === 'artillery' && (unit.directDefenseActive || (unit.status === 'engaging' && unit.currentOrder?.type !== 'bombard'))
                  ? 'bg-[#fef3c7] border-[#d97706] text-[#b45309] font-bold'
                  : unit.type === 'artillery' && unit.currentOrder?.type === 'bombard' && unit.currentOrder.status === 'executing'
                  ? 'bg-[#fff7ed] border-[#ea580c] text-[#ea580c] font-bold'
                  : unit.status === 'melee'
                  ? 'bg-[#7f1d1d] border-[#450a0a] text-white font-black animate-pulse'
                  : unit.status === 'holding'
                  ? 'bg-[#f0fdf4] border-[#16a34a] text-[#16a34a]'
                  : unit.status === 'engaging'
                  ? 'bg-[#fef2f2] border-[#dc2626] text-[#dc2626]'
                  : unit.status === 'charging'
                  ? 'bg-[#ea580c] border-[#9a3412] text-white font-bold animate-pulse'
                  : unit.status === 'marching'
                  ? 'bg-[#eff6ff] border-[#2563eb] text-[#2563eb]'
                  : unit.status === 'routing'
                  ? 'bg-[#fffbeb] border-[#d97706] text-[#d97706]'
                  : 'bg-white border-[#a1a1aa] text-black'
              }`}
            >
              {unit.type === 'artillery' && unit.canisterActive
                ? 'CANISTER [DEFENSE]'
                : unit.type === 'artillery' && (unit.directDefenseActive || (unit.status === 'engaging' && unit.currentOrder?.type !== 'bombard'))
                ? 'DIRECT FIRE [DEFENSE]'
                : unit.type === 'artillery' && unit.currentOrder?.type === 'bombard' && unit.currentOrder.status === 'executing'
                ? 'BOMBARDING [CFF]'
                : unit.status}
            </span>
          </div>

          {/* Wavering Cohesion Warning Badge */}
          {(unit.status === 'wavering' || (unit.morale <= 50 && unit.morale > 25 && unit.status !== 'routing' && unit.status !== 'shattered')) && (
            <div className="flex items-center justify-between mt-1 bg-amber-50 border border-amber-400 px-1.5 py-0.5 text-[9px] font-mono">
              <span className="text-amber-900 font-bold">COHESION:</span>
              <span className="text-amber-800 font-bold uppercase">WAVERING ({Math.round(unit.morale)}% MORALE)</span>
            </div>
          )}

          {/* Command Authority / Initiative Badge */}
          {unit.faction === engine.getState().playerFaction && (
            <div className="flex flex-col mt-0.5">
              {unit.currentOrder?.source === 'player' ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-300 px-1.5 py-0.5 text-[9px] font-mono">
                  <span className="text-blue-900 font-bold">AUTHORITY:</span>
                  <span className="text-blue-800 font-bold uppercase">SUPREME HQ ORDER</span>
                </div>
              ) : unit.currentOrder?.source === 'subordinate' ? (
                <div className="flex flex-col bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[9px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-900 font-bold">AUTHORITY:</span>
                    <span className="text-amber-800 font-bold uppercase">SUBORDINATE INITIATIVE</span>
                  </div>
                  <span className="text-[8px] text-amber-700 mt-0.5 italic lowercase">
                    autonomous commander action &bull; stands down on hq orders
                  </span>
                </div>
              ) : unit.currentOrder?.source === 'historical_event' ? (
                <div className="flex items-center justify-between bg-stone-100 border border-stone-300 px-1.5 py-0.5 text-[9px] font-mono">
                  <span className="text-stone-700 font-bold">AUTHORITY:</span>
                  <span className="text-stone-800 font-bold uppercase">THEATER BATTLE PLAN</span>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 text-[9px] font-mono">
                  <span className="text-neutral-500 font-bold">AUTHORITY:</span>
                  <span className="text-neutral-600 font-bold uppercase">SUBORDINATE STANDBY</span>
                </div>
              )}
            </div>
          )}
          {unit.currentOrder?.status === 'delivering' && (
            <div className="flex items-center justify-between mt-1 bg-[#fffbeb] border border-[#d97706] px-1.5 py-0.5">
              <span className="text-[#d97706] flex items-center gap-1 font-bold">
                ORDER PENDING
              </span>
              <span className="text-[#d97706]">
                ETA: {Math.max(0, Math.ceil((unit.currentOrder.dispatchArrivalTime || 0) - engine.getState().timeMinutes))}m
              </span>
            </div>
          )}

          {unit.currentOrder?.status === 'standby' && (
            <div className="flex items-center justify-between mt-1 bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[9px] font-mono">
              <span className="text-amber-900 font-bold">STANDBY ORDER</span>
              <span className="text-amber-800 font-semibold">
                STARTS {engine.formatTime(unit.currentOrder.startTime || 0)}
              </span>
            </div>
          )}

          {unit.currentOrder && unit.currentOrder.endTime !== undefined && (
            <div className="flex items-center justify-between mt-1 bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[9px] font-mono">
              <span className="text-[#1e3a8a] font-bold">TIMED DIRECTIVE</span>
              <span className="text-[#1e3a8a] font-semibold">
                UNTIL {engine.formatTime(unit.currentOrder.endTime)}
              </span>
            </div>
          )}

          {unit.currentOrder && unit.currentOrder.condition && (
            <div className="flex flex-col mt-1 bg-purple-50 border border-purple-200 px-1.5 py-0.5 text-[9px] font-mono">
              <div className="flex items-center justify-between text-purple-900 font-bold">
                <span>CONTINGENCY:</span>
                <span className={unit.currentOrder.condition.triggered ? 'text-red-600 font-black' : 'text-purple-700'}>
                  {unit.currentOrder.condition.triggered ? 'TRIGGERED' : 'ARMED'}
                </span>
              </div>
              <span className="text-purple-950 text-[8.5px] truncate">
                {unit.currentOrder.condition.description} &rarr; {unit.currentOrder.condition.contingencyAction?.toUpperCase() || 'ACTION'}
              </span>
            </div>
          )}

          {unit.currentOrder && unit.currentOrder.chainedOrder && (
            <div className="flex items-center justify-between mt-1 bg-neutral-100 border border-neutral-300 px-1.5 py-0.5 text-[9px] font-mono">
              <span className="text-neutral-700 font-bold">FOLLOW-UP:</span>
              <span className="text-neutral-900 font-bold uppercase">
                {unit.currentOrder.chainedOrder.type}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tactical Stance / Posture Selector */}
      <div className="mb-2">
        <label className="block text-[9.5px] font-bold text-neutral-600 uppercase mb-0.5">
          TACTICAL POSTURE
        </label>
        <div className="grid grid-cols-3 gap-1">
          {/* Deploy / Line */}
          <button
            onClick={() => handleFormationChange('line')}
            className={`py-1 px-1 text-center border shadow-xs transition-colors cursor-pointer ${
              unit.formation === 'line'
                ? 'bg-[#1e3a8a] border-[#1e40af] text-white'
                : 'bg-white border-[#a1a1aa] text-black hover:bg-[#f4f4f5]'
            }`}
          >
            <div className="font-bold text-[9.5px] uppercase">DEPLOY</div>
            <div className={`text-[7.5px] uppercase ${unit.formation === 'line' ? 'text-blue-200' : 'text-neutral-500'}`}>FRONTLINE</div>
          </button>

          {/* Transit / Column */}
          <button
            onClick={() => handleFormationChange('column')}
            className={`py-1 px-1 text-center border shadow-xs transition-colors cursor-pointer ${
              unit.formation === 'column'
                ? 'bg-[#1e3a8a] border-[#1e40af] text-white'
                : 'bg-white border-[#a1a1aa] text-black hover:bg-[#f4f4f5]'
            }`}
          >
            <div className="font-bold text-[9.5px] uppercase">TRANSIT</div>
            <div className={`text-[7.5px] uppercase ${unit.formation === 'column' ? 'text-blue-200' : 'text-neutral-500'}`}>MARCH</div>
          </button>

          {/* Defend / Entrench */}
          <button
            onClick={() => handleFormationChange('square')}
            className={`py-1 px-1 text-center border shadow-xs transition-colors cursor-pointer ${
              unit.formation === 'square'
                ? 'bg-[#1e3a8a] border-[#1e40af] text-white'
                : 'bg-white border-[#a1a1aa] text-black hover:bg-[#f4f4f5]'
            }`}
          >
            <div className="font-bold text-[9.5px] uppercase">DEFEND</div>
            <div className={`text-[7.5px] uppercase ${unit.formation === 'square' ? 'text-blue-200' : 'text-neutral-500'}`}>360 SEC</div>
          </button>
        </div>
      </div>

      {/* Forced March Directive (Sprint / Push Through Exhaustion) */}
      <div className="mb-2">
        <button
          onClick={() => engine.toggleForceMarch(unit.id)}
          className={`w-full flex items-center justify-center gap-1.5 py-1 px-2 border text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer ${
            unit.isForcedMarch
              ? 'bg-[#ea580c] hover:bg-[#c2410c] text-white border-[#9a3412] animate-pulse'
              : 'bg-[#fff7ed] hover:bg-[#ffedd5] border-[#fdba74] text-[#c2410c]'
          }`}
          title={
            unit.isForcedMarch
              ? 'Click to cancel forced march and resume normal pace'
              : 'Force march: +45% speed, ignores fatigue movement penalties, accrues fatigue 2.5x faster'
          }
        >
          <Zap size={10} className={unit.isForcedMarch ? 'fill-white' : ''} />
          <span>{unit.isForcedMarch ? 'FORCED MARCH ACTIVE' : 'FORCE MARCH'}</span>
        </button>
      </div>

      {/* Primary Command Actions: Hold Ground, Cancel & Specialized Missions */}
      <div className="space-y-1 mb-2">
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={handleHoldGround}
            className="flex items-center justify-center gap-1 py-1 bg-[#f0fdf4] hover:bg-[#dcfce7] border border-[#16a34a] text-[#15803d] text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
          >
            <Shield size={10} />
            <span>HOLD POS</span>
          </button>

          <button
            onClick={handleCancelOrder}
            disabled={!unit.currentOrder}
            className="flex items-center justify-center gap-1 py-1 bg-white hover:bg-[#fef2f2] border border-[#dc2626] disabled:opacity-50 disabled:border-[#a1a1aa] disabled:text-neutral-400 text-[#b91c1c] text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
          >
            <X size={10} />
            <span>HALT ORD</span>
          </button>
        </div>

        {/* Specialized Unit Actions */}
        {(unit.type === 'infantry' || unit.type === 'guard') && (
          <>
            <button
              onClick={() => engine.toggleSkirmishScreen(unit.id)}
              className={`w-full flex items-center justify-center gap-1.5 py-1 text-[9.5px] font-bold uppercase shadow-xs transition-colors border cursor-pointer ${
                unit.isSkirmishScreenActive
                  ? 'bg-[#0d9488] hover:bg-[#0f766e] text-white border-[#115e59]'
                  : 'bg-[#f0fdfa] hover:bg-[#ccfbf1] border-[#5eead4] text-[#0f766e]'
              }`}
              title={`Deploy forward light screen: ${eraProfile.skirmishScreenType} (absorbs 35% incoming fire, dampens charge momentum)`}
            >
              <Shield size={10} />
              <span>{unit.isSkirmishScreenActive ? `RECALL SCREEN` : `DEPLOY ${eraProfile.skirmishScreenType.toUpperCase()}`}</span>
            </button>

            <button
              onClick={() => {
                engine.issueOrder(unit.id, {
                  unitId: unit.id,
                  type: 'entrench',
                  destination: { ...unit.position },
                  waypoints: [],
                  plannedTime: 0,
                });
              }}
              className="w-full flex items-center justify-center gap-1 py-1 bg-[#fef08a] hover:bg-[#fde047] border border-[#ca8a04] text-[#854d0e] text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
            >
              <span>CONSTRUCT FIELDWORKS</span>
            </button>
          </>
        )}
        {unit.type === 'artillery' && (
          <>
            <button
              onClick={() => {
                if (onStartBombardTargeting) {
                  onStartBombardTargeting(unit.id);
                }
              }}
              className={`w-full flex items-center justify-center gap-1.5 py-1 text-[9.5px] font-bold uppercase shadow-xs transition-colors border cursor-pointer ${
                isBombardTargeting
                  ? 'bg-[#ea580c] text-white border-[#c2410c] animate-pulse'
                  : 'bg-[#fee2e2] hover:bg-[#fecaca] border-[#ef4444] text-[#991b1b]'
              }`}
            >
              <Flame size={11} />
              <span>
                {isBombardTargeting
                  ? 'SELECT TARGET ON MAP'
                  : 'CALL FOR FIRE (CFF)'}
              </span>
            </button>

            <button
              onClick={() => {
                const enemyFaction = unit.faction === 'french' ? 'allies' : 'french';
                const enemyBatteries = engine.getState().units.filter(
                  (u) => u.faction === enemyFaction && u.type === 'artillery' && u.status !== 'shattered'
                );
                if (enemyBatteries.length > 0) {
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
                }
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1 bg-[#fff1f2] hover:bg-[#ffe4e6] border border-[#f43f5e] text-[#be123c] text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
              title={`Direct counter-battery mission: knocks out enemy guns & risks caisson explosions (${eraProfile.counterBatteryType})`}
            >
              <Crosshair size={10} />
              <span>COUNTER-BATTERY (CB)</span>
            </button>

            {unit.grandBatteryGroupId ? (
              <button
                onClick={() => engine.disbandGrandBattery(unit.grandBatteryGroupId!)}
                className="w-full flex items-center justify-center gap-1.5 py-1 bg-[#fef3c7] hover:bg-[#fde68a] border border-[#d97706] text-[#92400e] text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
              >
                <span>DISBAND GRAND BATTERY</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  const friendlyBatteries = engine.getState().units.filter(
                    (u) => u.faction === unit.faction && u.type === 'artillery' && u.status !== 'shattered'
                  );
                  if (friendlyBatteries.length >= 2) {
                    engine.formGrandBattery(friendlyBatteries.map((b) => b.id), unit.id);
                  }
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1 bg-[#fefce8] hover:bg-[#fef9c3] border border-[#ca8a04] text-[#854d0e] text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
                title={`Mass all friendly batteries for synchronized TOT convergence: ${eraProfile.grandBatteryType}`}
              >
                <span>MASS GRAND BATTERY</span>
              </button>
            )}
          </>
        )}
        {(unit.type === 'infantry' || unit.type === 'cavalry') && (
          <button
            onClick={handleChargeOrder}
            className="w-full flex items-center justify-center gap-1.5 py-1 bg-[#fee2e2] hover:bg-[#fca5a5] border-2 border-[#b91c1c] text-[#7f1d1d] text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
            title="Execute assault charge with shock modifier"
          >
            <Flame size={11} className="text-[#b91c1c]" />
            <span>{unit.type === 'cavalry' ? 'CHARGE (F)' : 'ASSAULT (F)'}</span>
          </button>
        )}
      </div>

      {/* Quick Directional Doctrine Presets */}
      <div className="mb-2">
        <label className="block text-[9.5px] font-bold text-neutral-600 uppercase mb-0.5">
          IMMEDIATE MANEUVER
        </label>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => handleQuickOrder('flank_left')}
            className="py-1 px-1 bg-white hover:bg-[#f4f4f5] border border-[#a1a1aa] text-[9px] text-black font-bold uppercase shadow-xs transition-colors cursor-pointer"
          >
            FLANK(L)
          </button>
          <button
            onClick={() => handleQuickOrder('advance')}
            className="py-1 px-1 bg-[#1e3a8a] hover:bg-[#1e40af] border border-[#1e3a8a] text-white text-[9px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
          >
            ADVANCE
          </button>
          <button
            onClick={() => handleQuickOrder('flank_right')}
            className="py-1 px-1 bg-white hover:bg-[#f4f4f5] border border-[#a1a1aa] text-[9px] text-black font-bold uppercase shadow-xs transition-colors cursor-pointer"
          >
            FLANK(R)
          </button>
        </div>
      </div>

      {/* Army Reorganization / Detach Sub-Unit Panel */}
      <div className="border-t-2 border-[#a1a1aa] pt-2">
        {!isSplitting ? (
          <button
            onClick={() => setIsSplitting(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1 bg-[#f4f4f5] hover:bg-[#e4e4e7] border border-[#a1a1aa] text-black text-[9.5px] font-bold uppercase shadow-xs transition-colors cursor-pointer"
          >
            <Scissors size={10} />
            <span>DETACH SUB-UNIT</span>
          </button>
        ) : (
          <div className="bg-white p-2 border border-[#a1a1aa] shadow-inner space-y-2">
            <div className="flex items-center justify-between border-b border-[#d4d4d8] pb-1">
              <span className="text-[10px] font-bold uppercase">DETACH ORG</span>
              <button
                onClick={() => setIsSplitting(false)}
                className="text-[9px] text-neutral-500 hover:text-black uppercase font-bold"
              >
                CANCEL
              </button>
            </div>

            {/* Slider */}
            <div>
              <div className="flex justify-between text-[10px] mb-1 font-bold uppercase">
                <span className="text-neutral-500">ALLOCATION:</span>
                <span className="text-[#1d4ed8]">
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
              <div className="flex justify-between text-[9px] text-neutral-500 font-bold mt-1">
                {[25, 50, 75].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setSplitPct(pct)}
                    className="hover:text-black"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Name Input */}
            <div>
              <label className="block text-[9px] font-bold text-neutral-500 uppercase mb-0.5">DESIGNATION</label>
              <input
                type="text"
                placeholder={`${unit.name} (DET)`}
                value={detachmentName}
                onChange={(e) => setDetachmentName(e.target.value)}
                className="w-full bg-[#f4f4f5] border border-[#a1a1aa] px-1.5 py-1 text-[10px] text-black uppercase shadow-inner focus:outline-none focus:border-[#1e3a8a]"
              />
            </div>

            {/* Commit Detachment */}
            <button
              onClick={handleExecuteSplit}
              className="w-full flex items-center justify-center gap-1 py-1.5 bg-[#1e3a8a] hover:bg-[#1e40af] border border-[#1e40af] text-white text-[10px] font-bold uppercase shadow-sm mt-1 transition-colors"
            >
              <Check size={11} />
              <span>EXECUTE DETACH</span>
            </button>
          </div>
        )}
      </div>
      </div>
    </aside>
  );
});
