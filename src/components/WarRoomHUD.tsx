import React, { useState } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { GlyphChevron, GlyphCheck, GlyphClose } from './glyphs';
import { REALISTIC_AUSTERLITZ_SCENARIO } from '../data/austerlitzScenario';
import { sounds } from '../engine/soundEffects';
import { TroopFilterType } from '../types/game';
import { StaffTab } from './LeftStaffRail';
import { AttritionPanel } from './AttritionPanel';

interface WarRoomHUDProps {
  engine: BattleEngine;
  state: SimulationState;
  showHexGrid: boolean;
  onToggleHexGrid: () => void;
  showRangeRings: boolean;
  onToggleRangeRings: () => void;
  showCorpsOverlay?: boolean;
  onToggleCorpsOverlay?: () => void;
  activeFilter: TroopFilterType;
  onSelectFilter: (filter: TroopFilterType) => void;
  isCinematicMode: boolean;
  onToggleCinematic: () => void;
  // Unified Staff Rail coordination
  activeStaffTab?: StaffTab | null;
  onSelectStaffTab?: (tab: StaffTab | null) => void;
  // Legacy individual drawer props (fallback)
  isOOBOpen?: boolean;
  onToggleOOB?: () => void;
  isDispatchesOpen?: boolean;
  onToggleDispatches?: () => void;
  isDispatchDeskOpen?: boolean;
  onToggleDispatchDesk?: () => void;
  onToggleDoctrine: () => void;
  isSitrepOpen?: boolean;
  onToggleSitrep?: () => void;
}

export const WarRoomHUD: React.FC<WarRoomHUDProps> = React.memo(({
  engine,
  state,
  showHexGrid,
  onToggleHexGrid,
  showRangeRings,
  onToggleRangeRings,
  showCorpsOverlay = false,
  onToggleCorpsOverlay,
  activeFilter,
  onSelectFilter,
  isCinematicMode,
  onToggleCinematic,
  activeStaffTab,
  onSelectStaffTab,
  isOOBOpen = false,
  onToggleOOB,
  isDispatchesOpen = false,
  onToggleDispatches,
  isDispatchDeskOpen = false,
  onToggleDispatchDesk,
  onToggleDoctrine,
  isSitrepOpen = false,
  onToggleSitrep,
}) => {
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isSpeedOpen, setIsSpeedOpen] = useState(false);
  const [isRatiosOpen, setIsRatiosOpen] = useState(false);
  const [isAttritionOpen, setIsAttritionOpen] = useState(false);

  const activeEngagementsCount = state.activeEngagements?.length || 0;
  const needsReinforcementsCount = state.activeEngagements?.filter((e) => e.needsReinforcements).length || 0;
  const unreadContactsCount = (state.sitrepNotifications || []).filter((s) => !s.read && !s.dismissed).length;

  const currentFormattedTime = engine.formatTime(state.timeMinutes);
  const totalDuration = REALISTIC_AUSTERLITZ_SCENARIO.endTimeMinutes - REALISTIC_AUSTERLITZ_SCENARIO.initialTimeMinutes;
  const progressPct = Math.min(100, Math.max(0, (state.timeMinutes / totalDuration) * 100));

  const aliveUnits = state.units.filter(
    (u) => u.faction === state.playerFaction && u.status !== 'shattered' && u.strength > 0
  );
  const infCount = aliveUnits.filter((u) => u.type === 'infantry' || u.type === 'guard').length;
  const cavCount = aliveUnits.filter((u) => u.type === 'cavalry').length;
  const artCount = aliveUnits.filter((u) => u.type === 'artillery').length;
  const hqCount = aliveUnits.filter((u) => u.type === 'headquarters').length;

  const handleTogglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const willRun = !engine.getState().isRunning;
    engine.setRunning(willRun);
    try {
      if (willRun) {
        sounds.playDrum();
      }
    } catch {}
  };

  const handleTimelineScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    engine.scrubToTime(val);
  };

  // Staff Rail tab helper: either uses unified onSelectStaffTab or legacy handlers
  const handleTabClick = (tab: StaffTab) => {
    if (onSelectStaffTab) {
      if (activeStaffTab === tab) {
        onSelectStaffTab(null);
      } else {
        onSelectStaffTab(tab);
      }
      return;
    }

    // Fallback legacy triggers
    if (tab === 'sitrep') onToggleSitrep?.();
    if (tab === 'dispatch') onToggleDispatchDesk?.();
    if (tab === 'orbat') onToggleOOB?.();
    if (tab === 'log') onToggleDispatches?.();
  };

  const isTabActive = (tab: StaffTab): boolean => {
    if (activeStaffTab !== undefined) {
      return activeStaffTab === tab;
    }
    if (tab === 'sitrep') return isSitrepOpen;
    if (tab === 'dispatch') return isDispatchDeskOpen;
    if (tab === 'orbat') return isOOBOpen;
    if (tab === 'log') return isDispatchesOpen;
    return false;
  };

  if (isCinematicMode) {
    return (
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2 font-sans">
        <button
          onClick={onToggleCinematic}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#d4d4d8] border border-[#a1a1aa] text-black text-xs shadow-sm hover:bg-[#e4e4e7] cursor-pointer"
          title="Exit Broadcast Mode (Hotkey: C)"
        >
          <span>Show UI (C)</span>
        </button>
      </div>
    );
  }

  return (
    <header className="absolute top-0 left-0 right-0 z-50 h-10 bg-[#e4e4e7] border-b border-[#a1a1aa] px-3 flex items-center justify-between text-black select-none font-sans shadow-sm font-semibold">
      {/* Visual Bottom Timeline Progress Line */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#d4d4d8] pointer-events-none">
        <div
          className="h-full bg-[#1e3a8a] transition-all duration-150"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* CLUSTER 1: Pace & Chronograph (Brand, Run/Pause, Speed Popover, Clock, Scrubber) */}
      <div className="flex items-center gap-2.5">
        {/* Brand Pill */}
        <div className="text-[11px] font-bold tracking-tight pr-1">Austerlitz 1805</div>

        {/* Sim Controls Pill */}
        <div className="flex items-center gap-1 bg-[#d4d4d8] border border-[#a1a1aa] p-0.5 shadow-inner">
          {/* Run / Pause Button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className={`w-12 py-0.5 text-[10px] font-semibold border transition-colors cursor-pointer select-none ${
              state.isRunning
                ? 'bg-[#1e3a8a] border-[#1e3a8a] text-white'
                : 'bg-white border-[#a1a1aa] text-black hover:bg-[#f4f4f5]'
            }`}
            title="Start / Pause Simulation (Spacebar)"
          >
            <span>{state.isRunning ? 'Pause' : 'Run'}</span>
          </button>

          {/* Compact Speed Dropdown Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSpeedOpen((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono font-bold uppercase bg-[#f4f4f5] hover:bg-white text-neutral-800 border border-[#a1a1aa] transition-colors cursor-pointer select-none"
              title="Simulation Speed Multiplier"
            >
              <span>{`${state.speedMultiplier}×`}</span>
              <GlyphChevron dir={isSpeedOpen ? 'up' : 'down'} size={10} />
            </button>

            {isSpeedOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSpeedOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-36 bg-[#f4f4f5] border-2 border-[#a1a1aa] shadow-sm p-1 flex flex-col gap-0.5 text-black text-xs font-mono">
                  <div className="text-[9px] font-bold text-neutral-500 uppercase px-1.5 py-0.5 border-b border-[#a1a1aa]">
                    Pace Multiplier
                  </div>
                  {[0.5, 1, 2, 5].map((s) => {
                    const isActive = Math.abs(state.speedMultiplier - s) < 0.05;
                    return (
                      <button
                        key={s}
                        onClick={() => {
                          engine.setSpeedMultiplier(s);
                          setIsSpeedOpen(false);
                          try { sounds.playClick(); } catch {}
                        }}
                        className={`flex items-center justify-between px-2 py-1 text-left text-[11px] font-bold cursor-pointer transition-colors ${
                          isActive ? 'bg-[#1e3a8a] text-white' : 'hover:bg-white text-neutral-800'
                        }`}
                      >
                        <span>{`${s}×`}</span>
                        {isActive && <GlyphCheck size={11} />}
                      </button>
                    );
                  })}
                  <div className="border-t border-[#a1a1aa] my-0.5" />
                  <button
                    onClick={() => {
                      engine.resetBattle();
                      setIsSpeedOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 text-left text-[10px] font-bold text-neutral-700 hover:bg-white cursor-pointer"
                    title="Reset Simulation to 07:00 AM"
                  >
                    <span>Reset (07:00)</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Quick Reset */}
          <button
            type="button"
            onClick={() => engine.resetBattle()}
            className="px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 hover:text-black hover:bg-white transition-colors cursor-pointer"
            title="Reset Simulation to 07:00 AM"
          >
            Reset
          </button>
        </div>

        {/* Clock & Scrubber */}
        <div className="flex items-center gap-1.5">
          <div className="font-mono text-xs font-bold text-black bg-[#f4f4f5] border border-[#a1a1aa] px-2 py-0.5 shadow-inner min-w-[76px] text-center tracking-wider">
            {currentFormattedTime}
          </div>

          <input
            type="range"
            min="0"
            max={totalDuration}
            value={state.timeMinutes}
            onChange={handleTimelineScrub}
            title="Scrub Battle Timeline"
            className="w-14 h-1 bg-[#a1a1aa] appearance-none cursor-pointer accent-[#1e3a8a] outline-none"
          />
        </div>
      </div>

      {/* CLUSTER 2: Theater Assessment (Sector Ratios + Casualty Board) */}
      <div className="flex items-center gap-2">
        {/* NATO 3:1 Force Ratios */}
        {state.sectorForceRatios && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRatiosOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-0.5 bg-[#f4f4f5] hover:bg-white border border-[#a1a1aa] text-[10px] font-mono shadow-inner select-none cursor-pointer"
              title="Click to view detailed 3:1 Sector Force Ratios"
            >
              <span className="text-neutral-500 font-sans">Force ratio</span>
              <span
                className={`px-1 text-[9px] font-bold ${
                  state.sectorForceRatios.north.status === 'favorable'
                    ? 'bg-blue-100 text-blue-800'
                    : state.sectorForceRatios.north.status === 'critical'
                    ? 'bg-red-100 text-red-700 '
                    : 'text-neutral-700'
                }`}
              >
                N {state.sectorForceRatios.north.ratio.toFixed(1)}:1
              </span>
              <span className="text-neutral-300">|</span>
              <span
                className={`px-1 text-[9px] font-bold ${
                  state.sectorForceRatios.center.status === 'favorable'
                    ? 'bg-blue-100 text-blue-800'
                    : state.sectorForceRatios.center.status === 'critical'
                    ? 'bg-red-100 text-red-700 '
                    : 'text-neutral-700'
                }`}
              >
                C {state.sectorForceRatios.center.ratio.toFixed(1)}:1
              </span>
              <span className="text-neutral-300">|</span>
              <span
                className={`px-1 text-[9px] font-bold ${
                  state.sectorForceRatios.south.status === 'favorable'
                    ? 'bg-blue-100 text-blue-800'
                    : state.sectorForceRatios.south.status === 'critical'
                    ? 'bg-red-100 text-red-700 '
                    : 'text-neutral-700'
                }`}
              >
                S {state.sectorForceRatios.south.ratio.toFixed(1)}:1
              </span>
              <GlyphChevron dir={isRatiosOpen ? 'up' : 'down'} size={10} />
            </button>

            {isRatiosOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsRatiosOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#f4f4f5] border-2 border-[#a1a1aa] shadow-sm p-2 flex flex-col gap-1.5 text-black font-sans text-xs">
                  <div className="text-[10px] font-bold text-neutral-600 uppercase border-b border-[#a1a1aa] pb-1 flex items-center justify-between">
                    <span>NATO 3:1 Combat Power Assessment</span>
                  </div>
                  <div className="space-y-1 text-[11px] font-mono">
                    <div className="flex justify-between items-center bg-white p-1 border border-neutral-300">
                      <span className="font-bold text-neutral-800">North Sector:</span>
                      <span className="font-bold text-neutral-900">{state.sectorForceRatios.north.statusLabel} ({state.sectorForceRatios.north.ratio.toFixed(1)}:1)</span>
                    </div>
                    <div className="flex justify-between items-center bg-white p-1 border border-neutral-300">
                      <span className="font-bold text-neutral-800">Center (Pratzen):</span>
                      <span className="font-bold text-neutral-900">{state.sectorForceRatios.center.statusLabel} ({state.sectorForceRatios.center.ratio.toFixed(1)}:1)</span>
                    </div>
                    <div className="flex justify-between items-center bg-white p-1 border border-neutral-300">
                      <span className="font-bold text-neutral-800">South (Telnitz):</span>
                      <span className="font-bold text-neutral-900">{state.sectorForceRatios.south.statusLabel} ({state.sectorForceRatios.south.ratio.toFixed(1)}:1)</span>
                    </div>
                  </div>
                  <p className="text-[9.5px] text-neutral-500 font-sans italic leading-tight">
                    Standard doctrine recommends a 3:1 combat power ratio for deliberate attacks. Ratios below 1:1 suggest defensive or delaying posture.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Losses and casualty rate; opens the attrition panel */}
        {(() => {
          const rates = engine.getCasualtyRates(10);
          return (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAttritionOpen((v) => !v)}
                className={`flex items-center gap-2 h-6 px-2 text-[10px] font-mono border cursor-pointer transition-colors ${
                  isAttritionOpen ? 'bg-white border-[#1e3a8a]' : 'bg-white border-[#a1a1aa] hover:bg-[#f4f4f5]'
                }`}
                title="Casualties, rate over the last 10 minutes (per hour) — click for attrition"
              >
                <span className="text-neutral-500 font-sans">Losses</span>
                <span>
                  <span className="text-neutral-500">FRA</span> {Math.floor(state.frenchLosses).toLocaleString()}
                  <span className="text-neutral-500"> +{Math.round(rates.frenchPerHour).toLocaleString()}/h</span>
                </span>
                <span className="text-neutral-300">|</span>
                <span>
                  <span className="text-neutral-500">ALL</span> {Math.floor(state.alliedLosses).toLocaleString()}
                  <span className="text-neutral-500"> +{Math.round(rates.alliesPerHour).toLocaleString()}/h</span>
                </span>
                <GlyphChevron dir={isAttritionOpen ? 'up' : 'down'} size={10} />
              </button>
              {isAttritionOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAttritionOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50">
                    <AttritionPanel engine={engine} state={state} />
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* CLUSTER 3 & 4: Tactical View & Staff Hubs (Right) */}
      <div className="flex items-center gap-2">
        {/* Consolidated VIEW & LAYERS Popover */}
        <div className="relative">
          <button
            onClick={() => setIsLayersOpen((prev) => !prev)}
            className={`flex items-center gap-1 h-6 px-2.5 text-[10px] font-semibold border transition-colors cursor-pointer ${
              isLayersOpen ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' : 'bg-white text-neutral-700 border-[#a1a1aa] hover:bg-[#f4f4f5]'
            }`}
            title="Configure Map Overlays, Troop Filters, and Symbology"
          >
            <span>Layers{activeFilter !== 'all' ? ` · ${activeFilter}` : ''}</span>
            <GlyphChevron dir={isLayersOpen ? 'up' : 'down'} size={10} />
          </button>

          {isLayersOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsLayersOpen(false)} />

              <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-[#fbfbfa] border border-[#a1a1aa] shadow-sm text-black font-sans text-[11px]">
                <div className="px-2 pt-2 pb-1 text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500">Show friendly</div>
                <div className="grid grid-cols-5 mx-2 border border-[#a1a1aa]">
                  {(['all', 'infantry', 'cavalry', 'artillery', 'headquarters'] as TroopFilterType[]).map((f, i) => {
                    const count = f === 'all' ? aliveUnits.length : f === 'infantry' ? infCount : f === 'cavalry' ? cavCount : f === 'artillery' ? artCount : hqCount;
                    const shortLabel = f === 'all' ? 'All' : f === 'infantry' ? 'Inf' : f === 'cavalry' ? 'Cav' : f === 'artillery' ? 'Arty' : 'HQ';
                    return (
                      <button
                        key={f}
                        onClick={() => onSelectFilter(f)}
                        title={`${shortLabel} (${count})`}
                        className={`h-5 text-[10px] text-center cursor-pointer ${i > 0 ? 'border-l border-[#a1a1aa]' : ''} ${
                          activeFilter === f ? 'bg-[#1e3a8a] text-white' : 'bg-white text-neutral-700 hover:bg-[#f4f4f5]'
                        }`}
                      >
                        {shortLabel}
                      </button>
                    );
                  })}
                </div>

                <div className="px-2 pt-3 pb-1 text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500">Layers</div>
                {[
                  { label: 'Contours and relief', key: 'T', on: state.showTopography !== false, toggle: () => engine.toggleTopography() },
                  { label: 'Control measures', key: '', on: state.showOperationalGraphics, toggle: () => engine.toggleOperationalGraphics() },
                  { label: 'Range rings (all units)', key: 'R', on: showRangeRings, toggle: onToggleRangeRings },
                  { label: 'Artillery beaten zones', key: 'K', on: !!state.showArtilleryKillzones, toggle: () => engine.toggleArtilleryKillzones() },
                  ...(onToggleCorpsOverlay ? [{ label: 'Corps boundaries and C2 links', key: 'C', on: showCorpsOverlay, toggle: onToggleCorpsOverlay }] : []),
                  { label: 'Hex grid', key: '', on: showHexGrid, toggle: onToggleHexGrid },
                  { label: 'Fog of war', key: '', on: state.fogOfWarEnabled, toggle: () => engine.toggleFogOfWar() },
                  { label: 'Hostile frames as diamonds', key: '', on: state.wargameSymbology === 'nato', toggle: () => engine.toggleSymbologyMode() },
                ].map((l) => (
                  <button
                    key={l.label}
                    onClick={l.toggle}
                    className="w-full flex items-center gap-2 px-2 h-6 text-left hover:bg-[#f4f4f5] cursor-pointer"
                  >
                    <span className={`w-3 h-3 border flex items-center justify-center flex-shrink-0 ${l.on ? 'bg-[#1e3a8a] border-[#1e3a8a] text-white' : 'bg-white border-[#71717a]'}`}>
                      {l.on && <GlyphCheck size={9} />}
                    </span>
                    <span className="flex-1">{l.label}</span>
                    {l.key && <span className="font-mono text-[9px] text-neutral-400">{l.key}</span>}
                  </button>
                ))}

                <div className="px-2 pt-3 pb-1 flex items-baseline justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500">Control measures</span>
                  <span className="text-[9px] text-neutral-400">draw from the status bar</span>
                </div>
                <div className="max-h-40 overflow-y-auto custom-scrollbar border-t border-[#e4e4e7]">
                  {(state.operationalGraphics || []).map((g) => (
                    <div key={g.id} className="flex items-center gap-2 px-2 h-6 border-b border-[#e4e4e7] hover:bg-[#f4f4f5]">
                      <span className="font-mono text-[9px] text-neutral-400 w-8">
                        {g.type === 'phase_line' ? 'PL' : g.type === 'objective' ? 'OBJ' : g.type === 'fscl' ? 'FSCL' : 'BDY'}
                      </span>
                      <span className="flex-1 truncate">{g.name}</span>
                      <button
                        onClick={() => engine.removeOperationalGraphic(g.id)}
                        className="p-0.5 text-neutral-400 hover:text-black cursor-pointer"
                        title="Delete"
                      >
                        <GlyphClose size={9} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="px-2 py-1.5 border-t border-[#a1a1aa] mt-1">
                  <button
                    onClick={() => engine.toggleFullHistoricalReplay()}
                    className="w-full flex items-center gap-2 h-5 text-left hover:bg-[#f4f4f5] cursor-pointer"
                    title="Off: French units wait for your orders. On: the AI replays Napoleon's historical manoeuvres."
                  >
                    <span className={`w-3 h-3 border flex items-center justify-center flex-shrink-0 ${state.isFullHistoricalReplay ? 'bg-[#1e3a8a] border-[#1e3a8a] text-white' : 'bg-white border-[#71717a]'}`}>
                      {state.isFullHistoricalReplay && <GlyphCheck size={9} />}
                    </span>
                    <span>Historical replay (AI commands France)</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Staff panels */}
        <div className="flex items-stretch h-6 border border-[#a1a1aa] bg-white">
          {([
            { id: 'sitrep', label: 'SITREP', title: 'Contacts and sector engagements' },
            { id: 'dispatch', label: 'Orders', title: 'Write and transmit orders (Alt+D or `)' },
            { id: 'orbat', label: 'ORBAT', title: 'Order of battle' },
            { id: 'log', label: 'Log', title: 'Battle log' },
          ] as const).map((t, i) => {
            const active = isTabActive(t.id);
            const badge =
              t.id === 'sitrep'
                ? unreadContactsCount > 0
                  ? { text: `${unreadContactsCount}`, alert: true }
                  : activeEngagementsCount > 0
                  ? { text: `${activeEngagementsCount}`, alert: needsReinforcementsCount > 0 }
                  : null
                : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabClick(t.id)}
                title={t.title}
                className={`flex items-center gap-1.5 px-2.5 text-[10px] font-semibold cursor-pointer transition-colors ${i > 0 ? 'border-l border-[#a1a1aa]' : ''} ${
                  active ? 'bg-[#1e3a8a] text-white' : 'text-neutral-700 hover:bg-[#f4f4f5]'
                }`}
              >
                <span>{t.label}</span>
                {badge && (
                  <span className={`min-w-[14px] px-1 text-[8.5px] font-mono font-bold leading-[13px] text-white ${badge.alert ? 'bg-[#b91c1c]' : 'bg-[#52525b]'}`}>
                    {badge.text}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onToggleDoctrine}
            title="Doctrine and symbology reference"
            className="px-2.5 text-[10px] font-semibold border-l border-[#a1a1aa] text-neutral-700 hover:bg-[#f4f4f5] cursor-pointer"
          >
            Manual
          </button>
        </div>
      </div>
    </header>
  );
});
