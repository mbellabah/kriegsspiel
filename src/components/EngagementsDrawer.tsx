import React, { useState, useEffect } from 'react';
import { ActiveEngagement, Vector2D, SitrepNotification } from '../types/game';
import { Crosshair, AlertTriangle, Users, Flame, X, ChevronLeft, ChevronRight, Radio } from 'lucide-react';

interface EngagementsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  engagements: ActiveEngagement[];
  sitreps?: SitrepNotification[];
  frenchLosses: number;
  alliedLosses: number;
  onFocusSector: (location: Vector2D) => void;
  onLocateUnit?: (unitId: string, location: Vector2D) => void;
  onDismissAllSitreps?: () => void;
  onDismissSitrep?: (id: string) => void;
  embedded?: boolean;
}

export const EngagementsDrawer: React.FC<EngagementsDrawerProps> = ({
  isOpen,
  onClose,
  engagements,
  sitreps = [],
  frenchLosses,
  alliedLosses,
  onFocusSector,
  onLocateUnit,
  onDismissAllSitreps,
  onDismissSitrep,
  embedded = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'sectors' | 'contacts'>('sectors');

  // Auto-focus on Contacts tab whenever new unread contacts arrive
  useEffect(() => {
    if (sitreps.some((s) => !s.read && !s.dismissed)) {
      setActiveTab('contacts');
    }
  }, [sitreps]);

  if (!isOpen) return null;

  const totalThreats = engagements.filter((e) => e.needsReinforcements).length;

  // Minimized Pinned State on the Left (standalone only)
  if (isMinimized && !embedded) {
    return (
      <div className="fixed top-12 left-3 z-30 select-none font-sans">
        <button
          onClick={() => setIsMinimized(false)}
          className={`flex items-center gap-1.5 px-2.5 py-1 border text-[10px] font-semibold transition-colors ${
 totalThreats > 0
 ? 'bg-red-50 border-red-500 text-red-800 '
 : 'bg-[#e8e4db] hover:bg-white border-[#a8a29e] text-black'
 }`}
          title="Expand Situation Report (SITREP)"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#23324a] inline-block" />
          <span>SITREP ({engagements.length})</span>
          {totalThreats > 0 && (
            <span className="px-1 py-0.2 bg-red-600 text-white text-[10px] font-semibold">
              {totalThreats} REINFORCE
            </span>
          )}
          <ChevronRight size={13} className="text-neutral-600" />
        </button>
      </div>
    );
  }

  const containerClasses = embedded
    ? "flex-1 min-h-0 flex flex-col overflow-hidden bg-[#f5f3ee] text-black font-sans select-none"
    : "fixed top-12 left-3 z-30 w-72 max-h-[calc(100vh-64px)] bg-[#f5f3ee] border border-[#a8a29e] shadow-[0_4px_16px_rgba(28,25,23,0.16)]  text-black font-sans select-none flex flex-col overflow-hidden animate-in slide-in-from-left-2 duration-150";

  const ContainerTag = embedded ? 'div' : 'aside';

  return (
    <ContainerTag
      aria-label="HQ Situation Report (SITREP)"
      className={containerClasses}
    >
      {!embedded && (
        <div className="px-2.5 py-1.5 bg-[#e8e4db] border-b border-[#a8a29e] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="px-1.5 py-0.5 bg-[#23324a] text-white text-[11px] font-semibold ">
              SITREP
            </div>
            <h2 className="text-xs font-semibold text-neutral-900">
              Sector Engagements
            </h2>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 text-neutral-600 hover:text-black hover:bg-[#d9d3c7] transition-colors"
              title="Minimize SITREP"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-neutral-600 hover:text-black hover:bg-[#d9d3c7] transition-colors"
              title="Close SITREP"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Casualties Summary Bar (Only when standalone to avoid HUD duplication) */}
      {!embedded && (
        <div className="px-2.5 py-1 bg-[#e8e4db] border-b border-[#a8a29e] grid grid-cols-2 gap-2 text-[10px] font-sans font-semibold">
          <div className="text-[#2e4160]">
            FRA LOSS: {Math.round(frenchLosses).toLocaleString()}
          </div>
          <div className="text-[#b91c1c] text-right">
            ALL LOSS: {Math.round(alliedLosses).toLocaleString()}
          </div>
        </div>
      )}

      {/* Urgent Reinforcement Banner if any */}
      {totalThreats > 0 && (
        <div className="px-2.5 py-1 bg-red-50 border-b border-red-300 flex items-center gap-1.5 text-red-800 text-[10px] font-semibold ">
          <AlertTriangle size={12} className="text-red-600 flex-shrink-0" />
          <span>{totalThreats} {totalThreats === 1 ? 'SECTOR REQUIRES' : 'SECTORS REQUIRE'} REINFORCEMENTS!</span>
        </div>
      )}

      {/* Sub-tab Switcher: Sector Overview vs In-Contact SITREPs */}
      <div className="flex border-b border-[#a8a29e] bg-[#d9d3c7] text-[11px] font-semibold ">
        <button
          onClick={() => setActiveTab('sectors')}
          className={`flex-1 py-1 px-2 border-r border-[#a8a29e] transition-colors cursor-pointer ${
 activeTab === 'sectors'
 ? 'bg-white text-[#23324a] border-b-2 border-b-[#23324a]'
 : 'text-neutral-700 hover:bg-[#e8e4db]'
 }`}
        >
          Sectors ({engagements.length})
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 py-1 px-2 transition-colors relative flex items-center justify-center gap-1 cursor-pointer ${
 activeTab === 'contacts'
 ? 'bg-white text-[#23324a] border-b-2 border-b-[#23324a]'
 : 'text-neutral-700 hover:bg-[#e8e4db]'
 }`}
        >
          <Radio size={10} className={sitreps.length > 0 ? 'text-red-600' : 'text-neutral-500'} />
          <span>Contacts ({sitreps.length})</span>
          {sitreps.some((s) => !s.read) && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
          )}
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-190px)]">
        {activeTab === 'contacts' ? (
          /* Tactical In-Contact SITREPs List */
          sitreps.length === 0 ? (
            <div className="py-6 px-3 text-center text-neutral-500">
              <Radio className="w-6 h-6 mx-auto mb-1.5 opacity-40 text-neutral-600" />
              <p className="text-[11px] font-semibold text-neutral-600">No Contacts Reported</p>
              <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                Battalions are not currently taking fire or in close melee contact.
              </p>
            </div>
          ) : (
            <>
              {onDismissAllSitreps && sitreps.length > 0 && (
                <div className="flex items-center justify-between px-1 pb-1 mb-0.5 border-b border-[#a8a29e] text-[11px] font-sans">
                  <span className="font-semibold text-neutral-600">ACTIVE CONTACTS ({sitreps.length})</span>
                  <button
                    type="button"
                    onClick={onDismissAllSitreps}
                    className="px-1.5 py-0.5 bg-white hover:bg-neutral-200 border border-neutral-300 text-neutral-800 text-[10px] font-semibold cursor-pointer transition-colors "
                    title="Clear all contact reports"
                  >
                    Clear all
                  </button>
                </div>
              )}
              {sitreps.map((s) => {
                const isCrisis = s.contactType === 'routing' || s.contactType === 'wavering';
                const isMelee = s.contactType === 'melee';
                const badgeStyle = isCrisis
                  ? 'bg-red-600 text-white'
                  : isMelee
                  ? 'bg-rose-700 text-white'
                  : s.contactType === 'artillery_bombardment'
                  ? 'bg-amber-700 text-white'
                  : 'bg-[#23324a] text-white';

                return (
                  <div
                    key={s.id}
                    className={`p-2 bg-white border transition-all ${
 isCrisis ? 'border-red-400 bg-red-50' : 'border-[#a8a29e]'
 }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[11px] font-sans font-semibold text-neutral-500">{s.formattedTime}</span>
                        <span className={`px-1.5 py-0.2 text-[10px] font-semibold truncate ${badgeStyle}`}>
                          {s.headline.replace('IN CONTACT: ', '')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[11px] font-sans font-semibold text-neutral-600">{s.sectorName}</span>
                        {onDismissSitrep && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDismissSitrep(s.id);
                            }}
                            className="p-0.5 text-neutral-400 hover:text-black transition-colors cursor-pointer"
                            title="Dismiss contact report"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                  <div className="text-[11px] font-semibold text-black flex items-center justify-between mb-0.5">
                    <span>{s.unitName}</span>
                    <span className="text-[11px] font-sans text-neutral-500">{s.corps}</span>
                  </div>

                  <p className="text-[11px] text-neutral-700 mb-1 leading-snug">
                    {s.message}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-neutral-200 text-[11px] font-sans">
                    <span className="font-semibold text-neutral-600">
                      STR: {s.strength.toLocaleString()} | MOR: {s.morale}%
                    </span>

                    <button
                      onClick={() => {
                        if (onLocateUnit) {
                          onLocateUnit(s.unitId, s.position);
                        } else {
                          onFocusSector(s.position);
                        }
                      }}
                      className="px-2 py-0.5 bg-[#23324a] hover:bg-[#2e4160] text-white text-[11px] font-semibold flex items-center gap-1 transition-transform cursor-pointer"
                      title="Center camera on this unit and select it"
                    >
                      <Crosshair size={10} />
                      <span>LOCATE</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )
      ) : (
          /* Sector Engagements List */
          engagements.length === 0 ? (
            <div className="py-6 px-3 text-center text-neutral-500">
              <Users className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
              <p className="text-[11px] font-semibold text-neutral-600">No Active Clashes</p>
              <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                Troops are wheeling into position or maintaining standoff distances.
              </p>
            </div>
          ) : (
            engagements.map((eng) => {
              const friendlyTotal = eng.friendlyUnits.reduce((acc, u) => acc + u.strength, 0);
              const enemyTotal = eng.enemyUnits.reduce((acc, u) => acc + u.strength, 0);
              const totalForces = friendlyTotal + enemyTotal;
              const friendlyPct = totalForces > 0 ? (friendlyTotal / totalForces) * 100 : 50;

              const urgencyBadge = {
                critical: { text: 'CRITICAL', style: 'bg-red-600 text-white' },
                heavy: { text: 'HEAVY', style: 'bg-amber-600 text-white' },
                skirmish: { text: 'SKIRMISH', style: 'bg-blue-600 text-white' },
                favorable: { text: 'ADVANTAGE', style: 'bg-emerald-600 text-white' },
              }[eng.urgency];

              return (
                <div
                  key={eng.id}
                  className={`p-2 bg-white border transition-all ${
 eng.needsReinforcements ? 'border-red-400 bg-red-50' : 'border-[#a8a29e]'
 }`}
                >
                  {/* Sector Title & Badge */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <Flame size={12} className="text-amber-600 flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-black truncate" title={eng.name}>
                        {eng.name.split('(')[0]}
                      </span>
                    </div>

                    <span className={`px-1.5 py-0.2 text-[10px] font-semibold ${urgencyBadge.style}`}>
                      {urgencyBadge.text}
                    </span>
                  </div>

                  {/* Reinforcement tag */}
                  {eng.needsReinforcements && (
                    <div className="my-1 bg-red-100 border border-red-400 text-red-800 text-[11px] font-semibold px-1.5 py-0.5 flex items-center gap-1 ">
                      <AlertTriangle size={10} className="text-red-600 flex-shrink-0" />
                      <span>Reinforcements needed</span>
                    </div>
                  )}

                  {/* Force Strength & Ratio */}
                  <div className="bg-[#f5f3ee] border border-[#d9d3c7] p-1.5 my-1">
                    <div className="flex justify-between items-center text-[11px] font-sans mb-1">
                      <span className="text-[#2e4160] font-semibold">
                        FRA {Math.round(friendlyTotal).toLocaleString()}
                        {eng.friendlyCasualties > 0 && <span className="text-red-600"> (-{eng.friendlyCasualties})</span>}
                      </span>
                      <span className="text-[#b91c1c] font-semibold">
                        ALL {Math.round(enemyTotal).toLocaleString()}
                        {eng.enemyCasualties > 0 && <span className="text-amber-700"> (-{eng.enemyCasualties})</span>}
                      </span>
                    </div>

                    {/* Ratio bar */}
                    <div className="h-1 w-full bg-red-200 rounded-full overflow-hidden flex">
                      <div className="h-full bg-blue-600" style={{ width: `${friendlyPct}%` }} />
                      <div className="h-full bg-red-600" style={{ width: `${100 - friendlyPct}%` }} />
                    </div>
                  </div>

                  {/* Engaged Battalions list */}
                  <div className="flex flex-wrap gap-0.5 my-1">
                    {eng.friendlyUnits.map((u) => (
                      <span
                        key={u.id}
                        className={`px-1 py-0.1 border text-[10px] font-sans font-semibold ${
 u.status === 'routing'
 ? 'bg-red-100 border-red-400 text-red-800'
 : (u.status === 'wavering' || (u.morale <= 50 && u.morale > 25))
 ? 'bg-amber-100 border-amber-400 text-amber-800'
 : 'bg-white border-[#d9d3c7] text-neutral-800'
 }`}
                      >
                        {u.name.split(' ')[0]} ({Math.round(u.strength)})
                      </span>
                    ))}
                  </div>

                  {/* Status description */}
                  <p className="text-[11px] text-neutral-600 italic line-clamp-2 my-1 leading-snug">
                    "{eng.statusText}"
                  </p>

                  {/* Focus Button */}
                  <button
                    onClick={() => onFocusSector(eng.sectorLocation)}
                    className="w-full mt-1 py-0.5 px-2 bg-[#f5f3ee] hover:bg-[#e8e4db] active:bg-[#d9d3c7] border border-[#a8a29e] text-[11px] font-semibold text-black flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <Crosshair size={11} className="text-[#23324a]" />
                    <span>Focus sector</span>
                  </button>
                </div>
              );
            })
          )
        )}
      </div>

      {/* Drawer Footer */}
      <div className="px-2 py-1 bg-[#e8e4db] border-t border-[#a8a29e] text-[11px] text-neutral-600 text-center font-semibold">
        R-Click: Array • Alt+Drag: Trace Route
      </div>
    </ContainerTag>
  );
};
