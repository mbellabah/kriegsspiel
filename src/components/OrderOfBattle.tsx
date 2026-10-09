import { ui, cx } from './ui';
import { UnitSymbol } from './UnitSymbol';
import React, { useState } from 'react';
import { Unit, Faction, Vector2D } from '../types/game';
import { BattleEngine } from '../engine/simulation';
import { ChevronDown, ChevronRight, X } from './glyphs';

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

  // Under fog of war the enemy list shows only what has been detected: hidden units are omitted and
  // unidentified contacts show an estimate, never their name, corps or exact strength
  const live = engine.getState();
  const isOwnTab = activeTab === live.playerFaction;
  const fogOn = !!live.fogOfWarEnabled && !isOwnTab;
  const isContact = (u: Unit) => fogOn && u.detectionState === 'contact';
  const filteredUnits = units.filter(
    (u) => u.faction === activeTab && u.status !== 'shattered' && !(fogOn && u.detectionState === 'hidden')
  );
  const identifiedUnits = filteredUnits.filter((u) => !isContact(u));
  const contactCount = filteredUnits.length - identifiedUnits.length;

  // Group units by corps
  const corpsGroups = filteredUnits.reduce<Record<string, Unit[]>>((acc, unit) => {
    const c = isContact(unit) ? 'Unidentified contacts' : unit.corps || 'Unassigned / Independent';
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

  const totalMen = identifiedUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? 0 : u.strength), 0);
  const totalGuns = identifiedUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? u.strength : 0), 0);

  const containerClasses = embedded
    ? "flex-1 min-h-0 flex flex-col overflow-hidden bg-[#fcfbf8] text-black font-sans select-none"
    : "absolute top-12 right-3 z-40 w-88 bg-[#fcfbf8] border border-[#78716c] shadow-[0_4px_16px_rgba(28,25,23,0.16)]  text-black font-sans select-none flex flex-col max-h-[calc(100vh-64px)] animate-in slide-in-from-right-2 duration-150";

  const ContainerTag = embedded ? 'div' : 'aside';

  return (
    <ContainerTag className={containerClasses}>
      {!embedded && (
        <div className="flex items-center justify-between h-8 pl-2 pr-0.5 border-b border-[#b3ada2] bg-[#e6e3dc] text-[11px] font-semibold text-stone-900">
          <span>Order of battle</span>
          <button type="button" onClick={onClose} className="h-6 w-6 inline-flex items-center justify-center text-neutral-600 hover:text-black hover:bg-white cursor-pointer" title="Close">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-2 py-2 border-b border-[#dedad1] bg-[#f4f2ed]">
        <div className={cx(ui.group, 'w-44')}>
          {(['french', 'allies'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setActiveTab(f);
                setTransferringUnitId(null);
              }}
              className={cx(ui.groupItem, 'flex-1 text-[11px] font-medium', activeTab === f && ui.groupItemActive)}
            >
              {f === 'french' ? 'French' : 'Allied'}
            </button>
          ))}
        </div>
        <span className={cx(ui.mono, 'text-[10.5px] text-stone-500')}>
          {totalMen.toLocaleString()} men · {totalGuns} guns{fogOn ? ` identified${contactCount ? ` · ${contactCount} contacts` : ''}` : ''}
        </span>
      </div>

      {/* Formations Tree */}
      <div className="overflow-y-auto flex-1 custom-scrollbar bg-[#fbfaf7]">
        {Object.entries(corpsGroups).map(([corpsName, corpsUnits]) => {
          const isCollapsed = collapsedCorps[corpsName];
          const corpsMen = corpsUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? 0 : u.strength), 0);
          const corpsGuns = corpsUnits.reduce((sum, u) => sum + (u.type === 'artillery' ? u.strength : 0), 0);

          return (
            <div
              key={corpsName}
              onMouseEnter={() => onHoverCorps?.(corpsName)}
              onMouseLeave={() => onHoverCorps?.(null)}
              className="border-b border-[#dedad1]"
            >
              {/* Corps Header */}
              <div className="w-full flex items-center justify-between pl-1.5 pr-2 h-10 bg-[#f4f2ed] hover:bg-[#eceae4] text-left transition-colors">
                <button
                  type="button"
                  onClick={() => toggleCorps(corpsName)}
                  className="flex items-center gap-1.5 text-xs font-bold text-neutral-900 cursor-pointer flex-1 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight size={13} className="text-neutral-500" />
                  ) : (
                    <ChevronDown size={13} className="text-neutral-500" />
                  )}
                  <div className="flex flex-col">
                    <span className="truncate max-w-[200px] text-[11px] font-semibold">{corpsName}</span>
                    <span className="text-[10.5px] text-neutral-500 font-normal">
                      {corpsUnits.length} units · {corpsMen.toLocaleString()} men{corpsGuns > 0 ? ` · ${corpsGuns} guns` : ''}
                    </span>
                  </div>
                </button>

                {/* Tactical Actions for this Corps */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleCenterOnCorps(corpsUnits)}
                    title="Show on map"
                    className={cx(ui.btn, 'h-6 px-1.5 text-[10.5px]')}
                  >Show</button>

                  {isOwnTab && onDispatchCorps && (
                    <button
                      type="button"
                      onClick={() => onDispatchCorps(corpsName)}
                      title={`Dispatch Corps Orders to ${corpsName}`}
                      className={cx(ui.btn, 'h-6 px-2 border-[#b3ada2] bg-[#fbfaf7]')}
                    >
                      
                      <span>Order</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Subordinate Regiments and Batteries */}
              {!isCollapsed && (
                <div className="divide-y divide-[#ebe8e1] bg-[#fbfaf7]">
                  {corpsUnits.map((u) => {
                    const isSelected = u.id === selectedUnitId;
                    const isTransferring = transferringUnitId === u.id;

                    return (
                      <div
                        key={u.id}
                        className={`flex flex-col pl-6 pr-2 py-1.5 border-l-2 transition-colors ${
 isSelected ? 'bg-[#e4e9f1] border-l-[#23324a]' : 'border-l-transparent hover:bg-white'
 }`}
                      >
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => {
                            engine.setSelectedUnit(u.id);
                            onFocusLocation?.(u.position);
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isContact(u) ? (
                              <svg width={26} height={24} viewBox="0 0 36 34" className="flex-shrink-0" aria-hidden>
                                <path d="M18 9 L29 20 L18 31 L7 20 Z" fill="rgba(255,128,128,0.35)" stroke="#c2272d" strokeWidth={1.3} strokeDasharray="2.5 2" />
                                <text x="18" y="24" textAnchor="middle" fontSize="10" fontWeight="700" fill="#c2272d">?</text>
                              </svg>
                            ) : (
                              <UnitSymbol unit={u} hostile={u.faction !== live.playerFaction} size={26} />
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className="text-[11px] font-medium text-neutral-900 truncate">
                                {isContact(u) ? 'Unidentified contact' : u.name}
                              </span>
                              <span className="text-[10.5px] text-neutral-500 truncate capitalize">
                                {isContact(u)
                                  ? `Estimated ${u.estimatedStrength || 'strength unknown'}`
                                  : `${u.formation} · ${u.status === 'idle' ? 'ready' : u.status}`}
                              </span>
                            </div>
                          </div>

                          <div className={`flex items-center gap-2 ${isContact(u) ? 'hidden' : ''}`}>
                            <div className="text-right">
                              <div className="font-mono text-[11px] text-neutral-900">
                                {u.type === 'artillery' ? `${u.strength} guns` : u.strength.toLocaleString()}
                              </div>
                              <div className="mt-0.5 ml-auto h-1 w-14 bg-[#e3dfd6]">
                                <div
                                  className={`h-full ${u.strength / Math.max(1, u.initialStrength) < 0.4 ? 'bg-[#c2272d]' : u.strength / Math.max(1, u.initialStrength) < 0.65 ? 'bg-[#d97706]' : 'bg-[#3d4f6b]'}`}
                                  style={{ width: `${Math.min(100, (u.strength / Math.max(1, u.initialStrength)) * 100)}%` }}
                                />
                              </div>
                            </div>

                            {/* Reassign Button (own units only) */}
                            {isOwnTab && <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTransferringUnitId(isTransferring ? null : u.id);
                                setIsCreatingNewCorps(false);
                              }}
                              title="Reassign to another formation"
                              className={`p-1 text-neutral-500 hover:text-black hover:bg-neutral-200 transition-colors cursor-pointer ${
 isTransferring ? 'bg-[#d9d3c7] text-black' : ''
 }`}
                            >Move</button>}
                          </div>
                        </div>

                        {/* Reassignment Dropdown Popover */}
                        {isTransferring && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 p-2 bg-[#f5f3ee] border border-[#a8a29e] text-left animate-in fade-in duration-150"
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
                                  className="w-full text-[10px] font-sans border border-[#a8a29e] px-1.5 py-1 bg-white text-black"
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
                                  className="flex-1 text-[10px] font-sans border border-[#a8a29e] px-1.5 py-1 bg-white text-black"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleTransfer(u.id, newCorpsNameInput)}
                                  className="px-2 py-1 bg-[#23324a] text-white text-[10px] font-bold cursor-pointer"
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
