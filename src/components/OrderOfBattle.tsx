import React, { useState } from 'react';
import { Unit, Faction } from '../types/game';
import { BattleEngine } from '../engine/simulation';
import { ChevronDown, ChevronRight, X, Users } from 'lucide-react';

interface OrderOfBattleProps {
  units: Unit[];
  selectedUnitId: string | null;
  engine: BattleEngine;
  onClose: () => void;
}

export const OrderOfBattle: React.FC<OrderOfBattleProps> = ({
  units,
  selectedUnitId,
  engine,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<Faction>('french');
  const [collapsedCorps, setCollapsedCorps] = useState<Record<string, boolean>>({});

  const filteredUnits = units.filter((u) => u.faction === activeTab);

  // Group by corps
  const corpsGroups = filteredUnits.reduce<Record<string, Unit[]>>((acc, unit) => {
    if (!acc[unit.corps]) acc[unit.corps] = [];
    acc[unit.corps].push(unit);
    return acc;
  }, {});

  const toggleCorps = (corpsName: string) => {
    setCollapsedCorps((prev) => ({
      ...prev,
      [corpsName]: !prev[corpsName],
    }));
  };

  const totalMen = filteredUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? 0 : u.strength), 0);
  const totalGuns = filteredUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? u.strength : 0), 0);

  return (
    <aside className="absolute top-14 left-4 z-40 w-80 bg-zinc-950/90 border border-zinc-800/90 backdrop-blur-md rounded-lg shadow-2xl p-3.5 text-zinc-100 select-none flex flex-col max-h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2.5">
        <div>
          <h2 className="font-semibold text-xs tracking-wider uppercase text-zinc-100 flex items-center gap-1.5">
            <Users size={13} className="text-blue-400" />
            <span>Order of Battle</span>
          </h2>
          <span className="text-[11px] text-zinc-400 font-mono">
            {totalMen.toLocaleString()} Men • {totalGuns} Guns
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
          title="Close Panel"
        >
          <X size={15} />
        </button>
      </div>

      {/* Faction Switcher */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <button
          onClick={() => setActiveTab('french')}
          className={`py-1.5 rounded text-xs font-medium border transition-all ${
            activeTab === 'french'
              ? 'bg-blue-600/90 border-blue-500 text-white font-bold shadow-xs'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          Blue Forces
        </button>
        <button
          onClick={() => setActiveTab('allies')}
          className={`py-1.5 rounded text-xs font-medium border transition-all ${
            activeTab === 'allies'
              ? 'bg-red-600/90 border-red-500 text-white font-bold shadow-xs'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          Red Forces
        </button>
      </div>

      {/* Formations Tree */}
      <div className="overflow-y-auto space-y-1.5 flex-1 pr-1 custom-scrollbar">
        {Object.entries(corpsGroups).map(([corpsName, corpsUnits]) => {
          const isCollapsed = collapsedCorps[corpsName];
          const corpsStrength = corpsUnits.reduce((sum, u) => sum + u.strength, 0);

          return (
            <div key={corpsName} className="bg-zinc-900/80 border border-zinc-800/80 rounded-md overflow-hidden">
              <button
                onClick={() => toggleCorps(corpsName)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-left transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  {isCollapsed ? <ChevronRight size={13} className="text-zinc-400" /> : <ChevronDown size={13} className="text-zinc-400" />}
                  <span className="truncate max-w-[160px]">{corpsName}</span>
                </div>
                <span className="font-mono text-[10px] text-zinc-400">
                  {corpsStrength.toLocaleString()}
                </span>
              </button>

              {!isCollapsed && (
                <div className="p-1 space-y-0.5 border-t border-zinc-800">
                  {corpsUnits.map((u) => {
                    const isSelected = u.id === selectedUnitId;
                    return (
                      <div
                        key={u.id}
                        onClick={() => engine.setSelectedUnit(u.id)}
                        className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-950/80 border border-blue-600 text-white font-semibold'
                            : 'hover:bg-zinc-800/60 text-zinc-300'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-xs">{u.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {u.commander} • {u.formation.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs text-zinc-200">
                            {u.strength.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {Math.round(u.morale)}% M
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
