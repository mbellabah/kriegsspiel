import React, { useState } from 'react';
import { Unit } from '../types/game';
import { BattleEngine } from '../engine/simulation';
import { X, Shield, Scissors, Check, Flame } from 'lucide-react';

interface UnitDossierProps {
  unit: Unit | null;
  engine: BattleEngine;
  onClose: () => void;
}

export const UnitDossier: React.FC<UnitDossierProps> = ({ unit, engine, onClose }) => {
  if (!unit) return null;

  const [isSplitting, setIsSplitting] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  const [detachmentName, setDetachmentName] = useState('');
  const [detachmentCorps, setDetachmentCorps] = useState('');

  const isFrench = unit.faction === 'french';
  const factionBadge = isFrench ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'bg-[#dc2626] text-white border-[#b91c1c]';
  const factionTitle = isFrench ? 'BLUFOR' : 'REDFOR';

  const handleFormationChange = (formation: Unit['formation']) => {
    engine.setUnitFormation(unit.id, formation);
  };

  const handleCancelOrder = () => {
    engine.cancelOrder(unit.id);
  };

  const handleHoldGround = () => {
    engine.holdGround(unit.id);
  };

  const handleQuickOrder = (type: 'flank_left' | 'flank_right' | 'advance') => {
    const forwardDist = 120;
    const forwardX = Math.cos(unit.heading);
    const forwardY = Math.sin(unit.heading);
    const perpX = -forwardY;
    const perpY = forwardX;

    let dest = {
      x: Math.max(30, Math.min(4900, unit.position.x + forwardX * forwardDist)),
      y: Math.max(30, Math.min(4900, unit.position.y + forwardY * forwardDist)),
    };
    let curveControl: { x: number; y: number } | undefined = undefined;

    if (type === 'flank_left') {
      dest = {
        x: Math.max(30, Math.min(4900, unit.position.x + forwardX * forwardDist + perpX * 90)),
        y: Math.max(30, Math.min(4900, unit.position.y + forwardY * forwardDist + perpY * 90)),
      };
      curveControl = {
        x: unit.position.x + forwardX * 60 + perpX * 110,
        y: unit.position.y + forwardY * 60 + perpY * 110,
      };
    } else if (type === 'flank_right') {
      dest = {
        x: Math.max(30, Math.min(4900, unit.position.x + forwardX * forwardDist - perpX * 90)),
        y: Math.max(30, Math.min(4900, unit.position.y + forwardY * forwardDist - perpY * 90)),
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

  return (
    <aside className="absolute top-12 right-0 z-40 w-72 bg-[#e4e4e7] border-l-2 border-b-2 border-[#a1a1aa] shadow-lg p-3 text-black select-none max-h-[calc(100vh-48px)] overflow-y-auto font-sans">
      {/* Top Header: Faction Tag & Close */}
      <div className="flex items-start justify-between border-b-2 border-[#a1a1aa] pb-2 mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
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
          className="text-neutral-500 hover:text-black p-0.5 border border-transparent hover:border-[#a1a1aa] bg-transparent hover:bg-white transition-colors shadow-sm"
          title="Close Panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Vital Metrics: Strength, Morale, Suppression, Fatigue */}
      <div className="space-y-2.5 mb-4 bg-white p-2 border border-[#a1a1aa] shadow-inner">
        {/* Effective Strength */}
        <div className="flex items-center justify-between text-[11px] font-bold uppercase">
          <span className="text-neutral-500">EFF STRENGTH:</span>
          <div className="flex items-center gap-1">
            <span className="text-black text-xs">{unit.strength.toLocaleString()}</span>
            <span className="text-neutral-400">/ {unit.initialStrength.toLocaleString()}</span>
          </div>
        </div>

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

        {/* Status Tag */}
        <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-[#d4d4d8] font-bold uppercase mt-2">
          <span className="text-neutral-500">SYS STATUS:</span>
          <span
            className={`px-1.5 py-0.5 border shadow-sm ${
              unit.status === 'holding'
                ? 'bg-[#f0fdf4] border-[#16a34a] text-[#16a34a]'
                : unit.status === 'engaging'
                ? 'bg-[#fef2f2] border-[#dc2626] text-[#dc2626]'
                : unit.status === 'marching' || unit.status === 'charging'
                ? 'bg-[#eff6ff] border-[#2563eb] text-[#2563eb]'
                : unit.status === 'routing'
                ? 'bg-[#fffbeb] border-[#d97706] text-[#d97706]'
                : 'bg-white border-[#a1a1aa] text-black'
            }`}
          >
            {unit.status}
          </span>
        </div>
      </div>

      {/* Tactical Stance / Posture Selector */}
      <div className="mb-4">
        <label className="block text-[10px] font-bold text-neutral-600 uppercase mb-1">
          TACTICAL POSTURE
        </label>
        <div className="grid grid-cols-3 gap-1">
          {/* Deploy / Line */}
          <button
            onClick={() => handleFormationChange('line')}
            className={`p-1.5 text-center border shadow-sm ${
              unit.formation === 'line'
                ? 'bg-[#1e3a8a] border-[#1e40af] text-white'
                : 'bg-white border-[#a1a1aa] text-black hover:bg-[#f4f4f5]'
            }`}
          >
            <div className="font-bold text-[10px] uppercase">DEPLOY</div>
            <div className={`text-[8px] uppercase mt-0.5 ${unit.formation === 'line' ? 'text-blue-200' : 'text-neutral-500'}`}>FRONTLINE</div>
          </button>

          {/* Transit / Column */}
          <button
            onClick={() => handleFormationChange('column')}
            className={`p-1.5 text-center border shadow-sm ${
              unit.formation === 'column'
                ? 'bg-[#1e3a8a] border-[#1e40af] text-white'
                : 'bg-white border-[#a1a1aa] text-black hover:bg-[#f4f4f5]'
            }`}
          >
            <div className="font-bold text-[10px] uppercase">TRANSIT</div>
            <div className={`text-[8px] uppercase mt-0.5 ${unit.formation === 'column' ? 'text-blue-200' : 'text-neutral-500'}`}>MARCH</div>
          </button>

          {/* Defend / Entrench */}
          <button
            onClick={() => handleFormationChange('square')}
            className={`p-1.5 text-center border shadow-sm ${
              unit.formation === 'square'
                ? 'bg-[#1e3a8a] border-[#1e40af] text-white'
                : 'bg-white border-[#a1a1aa] text-black hover:bg-[#f4f4f5]'
            }`}
          >
            <div className="font-bold text-[10px] uppercase">DEFEND</div>
            <div className={`text-[8px] uppercase mt-0.5 ${unit.formation === 'square' ? 'text-blue-200' : 'text-neutral-500'}`}>360 SEC</div>
          </button>
        </div>
      </div>

      {/* Primary Command Actions: Hold Ground & Cancel */}
      <div className="grid grid-cols-2 gap-1 mb-4">
        <button
          onClick={handleHoldGround}
          className="flex items-center justify-center gap-1 py-1.5 bg-[#f0fdf4] hover:bg-[#dcfce7] border border-[#16a34a] text-[#15803d] text-[10px] font-bold uppercase shadow-sm transition-colors"
        >
          <Shield size={11} />
          <span>HOLD POS</span>
        </button>

        <button
          onClick={handleCancelOrder}
          disabled={!unit.currentOrder}
          className="flex items-center justify-center gap-1 py-1.5 bg-white hover:bg-[#fef2f2] border border-[#dc2626] disabled:opacity-50 disabled:border-[#a1a1aa] disabled:text-neutral-400 text-[#b91c1c] text-[10px] font-bold uppercase shadow-sm transition-colors"
        >
          <X size={11} />
          <span>HALT ORD</span>
        </button>
      </div>

      {/* Quick Directional Doctrine Presets */}
      <div className="mb-4">
        <label className="block text-[10px] font-bold text-neutral-600 uppercase mb-1">
          IMMEDIATE MANEUVER
        </label>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => handleQuickOrder('flank_left')}
            className="py-1 px-1 bg-white hover:bg-[#f4f4f5] border border-[#a1a1aa] text-[9px] text-black font-bold uppercase shadow-sm transition-colors"
          >
            FLANK(L)
          </button>
          <button
            onClick={() => handleQuickOrder('advance')}
            className="py-1 px-1 bg-[#1e3a8a] hover:bg-[#1e40af] border border-[#1e3a8a] text-white text-[9px] font-bold uppercase shadow-sm transition-colors"
          >
            ADVANCE
          </button>
          <button
            onClick={() => handleQuickOrder('flank_right')}
            className="py-1 px-1 bg-white hover:bg-[#f4f4f5] border border-[#a1a1aa] text-[9px] text-black font-bold uppercase shadow-sm transition-colors"
          >
            FLANK(R)
          </button>
        </div>
      </div>

      {/* Army Reorganization / Detach Sub-Unit Panel */}
      <div className="border-t-2 border-[#a1a1aa] pt-3">
        {!isSplitting ? (
          <button
            onClick={() => setIsSplitting(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[#f4f4f5] hover:bg-[#e4e4e7] border border-[#a1a1aa] text-black text-[10px] font-bold uppercase shadow-sm transition-colors"
          >
            <Scissors size={11} />
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
    </aside>
  );
};
