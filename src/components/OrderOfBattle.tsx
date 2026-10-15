import React, { useState } from 'react';
import { Unit, Faction, Vector2D } from '../types/game';
import { BattleEngine } from '../engine/simulation';
import { GlyphClose, GlyphChevron } from './glyphs';

interface OrderOfBattleProps {
  units: Unit[];
  selectedUnitId: string | null;
  engine: BattleEngine;
  onClose: () => void;
  onDispatchCorps?: (corpsName: string) => void;
  onHoverCorps?: (corpsName: string | null) => void;
  onFocusLocation?: (loc: Vector2D) => void;
  embedded?: boolean;
}

export const OrderOfBattle: React.FC<OrderOfBattleProps> = ({
  units,
  selectedUnitId,
  engine,
  onClose,
  onDispatchCorps,
  onHoverCorps,
  onFocusLocation,
  embedded = false,
}) => {
  const [activeTab, setActiveTab] = useState<Faction>('french');
  const [collapsedCorps, setCollapsedCorps] = useState<Record<string, boolean>>({});
  const [transferringUnitId, setTransferringUnitId] = useState<string | null>(null);
  const [newCorpsNameInput, setNewCorpsNameInput] = useState('');
  const [isCreatingNewCorps, setIsCreatingNewCorps] = useState(false);

  const filteredUnits = units.filter((u) => u.faction === activeTab && u.status !== 'shattered');

  // Group units by corps
  const corpsGroups = filteredUnits.reduce<Record<string, Unit[]>>((acc, unit) => {
    const c = unit.corps || 'Unassigned / Independent';
    if (!acc[c]) acc[c] = [];
    acc[c].push(unit);
    return acc;
  }, {});

  const allAvailableCorps = Object.keys(corpsGroups);

  const toggleCorps = (corpsName: string) => {
    setCollapsedCorps((prev) => ({
      ...prev,
      [corpsName]: !prev[corpsName],
    }));
  };

  const handleTransfer = (unitId: string, targetCorps: string) => {
    if (!targetCorps.trim()) return;
    engine.transferUnitCorps(unitId, targetCorps.trim());
    setTransferringUnitId(null);
    setIsCreatingNewCorps(false);
    setNewCorpsNameInput('');
  };

  const handleCenterOnCorps = (corpsUnits: Unit[]) => {
    if (corpsUnits.length === 0) return;
    let sumX = 0;
    let sumY = 0;
    for (const u of corpsUnits) {
      sumX += u.position.x;
      sumY += u.position.y;
    }
    const center = { x: sumX / corpsUnits.length, y: sumY / corpsUnits.length };
    onFocusLocation?.(center);
  };

  const totalMen = filteredUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? 0 : u.strength), 0);
  const totalGuns = filteredUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? u.strength : 0), 0);

  const containerClasses = embedded
    ? "flex-1 min-h-0 flex flex-col overflow-hidden bg-[#fbfbfa] text-black font-sans select-none"
    : "absolute top-12 right-3 z-40 w-88 bg-[#fbfbfa] border-2 border-[#71717a] shadow-sm text-black font-sans select-none flex flex-col max-h-[calc(100vh-64px)] animate-in slide-in-from-right-2 duration-150";

  const ContainerTag = embedded ? 'div' : 'aside';

  return (
    <ContainerTag className={containerClasses}>
      {/* Light Theme Header matching NATO sandtable / WarRoomHUD */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#a1a1aa] bg-[#e4e4e7]">
        <div>
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
            <span>Order of Battle (ORBAT)</span>
          </h2>
          <span className="text-[10px] text-neutral-600 font-mono">
            {totalMen.toLocaleString()} Men • {totalGuns} Guns • {Object.keys(corpsGroups).length} Formations
          </span>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-black p-1 hover:bg-[#d4d4d8] transition-colors cursor-pointer"
            title="Close ORBAT Panel"
          >
            <GlyphClose size={12} />
          </button>
        )}
      </div>

      {/* Faction Switcher */}
      <div className="grid grid-cols-2 gap-1.5 p-2 bg-[#f4f4f5] border-b border-[#d4d4d8]">
        <button
          type="button"
          onClick={() => {
            setActiveTab('french');
            setTransferringUnitId(null);
          }}
          className={`py-1 text-xs font-bold uppercase tracking-wide border transition-all cursor-pointer ${
            activeTab === 'french'
              ? 'bg-[#1e3a8a] border-[#1e40af] text-white shadow-xs'
              : 'bg-white border-[#d4d4d8] text-neutral-700 hover:bg-[#f4f4f5]'
          }`}
        >
          French Corps (Blue)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('allies');
            setTransferringUnitId(null);
          }}
          className={`py-1 text-xs font-bold uppercase tracking-wide border transition-all cursor-pointer ${
            activeTab === 'allies'
              ? 'bg-[#991b1b] border-[#b91c1c] text-white shadow-xs'
              : 'bg-white border-[#d4d4d8] text-neutral-700 hover:bg-[#f4f4f5]'
          }`}
        >
          Allied Columns (Red)
        </button>
      </div>

      {/* Formations Tree */}
      <div className="overflow-y-auto space-y-2 p-2 flex-1 custom-scrollbar bg-[#fbfbfa]">
        {Object.entries(corpsGroups).map(([corpsName, corpsUnits]) => {
          const isCollapsed = collapsedCorps[corpsName];
          const corpsMen = corpsUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? 0 : u.strength), 0);
          const corpsGuns = corpsUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? u.strength : 0), 0);

          return (
            <div
              key={corpsName}
              onMouseEnter={() => onHoverCorps?.(corpsName)}
              onMouseLeave={() => onHoverCorps?.(null)}
              className="bg-white border border-[#d4d4d8] overflow-hidden shadow-2xs transition-all hover:border-[#1e3a8a]/60"
            >
              {/* Corps Header */}
              <div className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#f4f4f5] hover:bg-[#eaeaea] text-left border-b border-[#e5e5e5] transition-colors">
                <button
                  type="button"
                  onClick={() => toggleCorps(corpsName)}
                  className="flex items-center gap-1.5 text-xs font-bold text-neutral-900 cursor-pointer flex-1 text-left"
                >
                  {isCollapsed ? (
                    <GlyphChevron dir="right" size={11} className="text-neutral-500 shrink-0" />
                  ) : (
                    <GlyphChevron dir="down" size={11} className="text-neutral-500 shrink-0" />
                  )}
                  <div className="flex flex-col">
                    <span className="truncate max-w-[155px] font-sans">{corpsName}</span>
                    <span className="text-[9px] text-neutral-500 font-mono font-normal">
                      {corpsUnits.length} Regiments • {corpsMen.toLocaleString()} Men {corpsGuns > 0 ? `• ${corpsGuns} Guns` : ''}
                    </span>
                  </div>
                </button>

                {/* Tactical Actions for this Corps */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleCenterOnCorps(corpsUnits)}
                    title="Center on Corps on Sandtable"
                    className="px-1 py-0.5 text-[9px] font-mono font-bold text-neutral-600 hover:text-black hover:bg-neutral-200 cursor-pointer"
                  >
                    Center
                  </button>

                  {activeTab === 'french' && onDispatchCorps && (
                    <button
                      type="button"
                      onClick={() => onDispatchCorps(corpsName)}
                      title={`Dispatch Corps Orders to ${corpsName}`}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#1e3a8a] hover:bg-[#1e40af] text-white text-[9px] font-bold font-mono tracking-wide cursor-pointer shadow-2xs"
                    >
                      <span>Order</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Subordinate Regiments and Batteries */}
              {!isCollapsed && (
                <div className="divide-y divide-[#f0f0f0] bg-white">
                  {corpsUnits.map((u) => {
                    const isSelected = u.id === selectedUnitId;
                    const isTransferring = transferringUnitId === u.id;

                    return (
                      <div
                        key={u.id}
                        className={`flex flex-col px-2.5 py-1.5 transition-all ${
                          isSelected
                            ? 'bg-[#dbeafe] border-l-4 border-l-[#1e3a8a] text-black font-semibold'
                            : 'hover:bg-[#f8fafc] text-neutral-800'
                        }`}
                      >
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => {
                            engine.setSelectedUnit(u.id);
                            onFocusLocation?.(u.position);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-neutral-900">{u.name}</span>
                            <span className="text-[9.5px] text-neutral-500 font-mono">
                              {u.commander} • {u.type.toUpperCase()} • {u.formation.toUpperCase()}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <div className="font-mono text-xs font-bold text-neutral-900">
                                {u.type === 'artillery' ? `${u.strength} Guns` : u.strength.toLocaleString()}
                              </div>
                              <div className="text-[9.5px] text-neutral-500 font-mono">
                                {Math.round(u.morale)}% M
                              </div>
                            </div>

                            {/* Reassign Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTransferringUnitId(isTransferring ? null : u.id);
                                setIsCreatingNewCorps(false);
                              }}
                              title="Transfer regiment to another Corps"
                              className={`px-1 py-0.5 text-[9px] font-mono font-bold text-neutral-500 hover:text-black hover:bg-neutral-200 transition-colors cursor-pointer ${
                                isTransferring ? 'bg-[#d4d4d8] text-black' : ''
                              }`}
                            >
                              Move
                            </button>
                          </div>
                        </div>

                        {/* Reassignment Dropdown Popover */}
                        {isTransferring && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 p-2 bg-[#f4f4f5] border border-[#a1a1aa] shadow-xs text-left animate-in fade-in duration-150"
                          >
                            <div className="text-[10px] font-bold text-neutral-700 uppercase mb-1 flex items-center gap-1">
                              <span>Reassign to Formation:</span>
                            </div>

                            {!isCreatingNewCorps ? (
                              <div className="space-y-1">
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value === '__new__') {
                                      setIsCreatingNewCorps(true);
                                    } else if (e.target.value) {
                                      handleTransfer(u.id, e.target.value);
                                    }
                                  }}
                                  className="w-full text-[10px] font-sans border border-[#a1a1aa] px-1.5 py-1 bg-white text-black"
                                >
                                  <option value="" disabled>
                                    Select Target Corps...
                                  </option>
                                  {allAvailableCorps
                                    .filter((c) => c !== u.corps)
                                    .map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  <option value="__new__">+ Create New Task Force / Corps...</option>
                                </select>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="e.g. Reserve Task Force"
                                  value={newCorpsNameInput}
                                  onChange={(e) => setNewCorpsNameInput(e.target.value)}
                                  className="flex-1 text-[10px] font-sans border border-[#a1a1aa] px-1.5 py-1 bg-white text-black"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleTransfer(u.id, newCorpsNameInput)}
                                  className="px-2 py-1 bg-[#1e3a8a] text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsCreatingNewCorps(false)}
                                  className="px-1.5 py-1 text-neutral-600 hover:text-black text-[10px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ContainerTag>
  );
};
