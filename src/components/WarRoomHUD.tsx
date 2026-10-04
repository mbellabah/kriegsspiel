import React, { useState } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import {
  Play,
  Pause,
  RotateCcw,
  Users,
  MessageSquare,
  Eye,
  EyeOff,
  Shield,
  Map,
  Crosshair,
  Target,
  BookOpen,
  Layers,
  ChevronDown,
  Check,
  ShieldAlert,
  Send,
  Scale,
  Mountain,
} from 'lucide-react';
import { REALISTIC_AUSTERLITZ_SCENARIO } from '../data/austerlitzScenario';
import { sounds } from '../engine/soundEffects';
import { TroopFilterType } from '../types/game';
import { StaffTab } from './LeftStaffRail';

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
          <Eye size={13} />
          <span>SHOW UI (C)</span>
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
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#1e3a8a] text-white border border-[#1e40af] text-[10px] tracking-wider uppercase shadow-inner">
          <Shield size={11} />
          <span className="font-bold">AUSTERLITZ 1805</span>
        </div>

        {/* Sim Controls Pill */}
        <div className="flex items-center gap-1 bg-[#d4d4d8] border border-[#a1a1aa] p-0.5 shadow-inner">
          {/* Run / Pause Button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] uppercase font-bold border transition-all cursor-pointer active:scale-95 select-none ${
              state.isRunning
                ? 'bg-[#dc2626] border-[#b91c1c] text-white shadow-inner'
                : 'bg-[#15803d] border-[#166534] text-white hover:bg-[#16a34a]'
            }`}
            title="Start / Pause Simulation (Spacebar)"
          >
            {state.isRunning ? <Pause size={11} /> : <Play size={11} />}
            <span>{state.isRunning ? 'PAUSE' : 'RUN'}</span>
          </button>

          {/* Compact Speed Dropdown Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSpeedOpen((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono font-bold uppercase bg-[#f4f4f5] hover:bg-white text-neutral-800 border border-[#a1a1aa] transition-colors cursor-pointer select-none"
              title="Simulation Speed Multiplier"
            >
              <span>{state.speedMultiplier === 0.5 ? '0.5X' : `${state.speedMultiplier}X`}</span>
              <ChevronDown size={10} className={`transition-transform ${isSpeedOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSpeedOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSpeedOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-36 bg-[#f4f4f5] border-2 border-[#a1a1aa] shadow-xl p-1 flex flex-col gap-0.5 text-black text-xs font-mono">
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
                        className={`flex items-center justify-between px-2 py-1 text-left rounded text-[11px] font-bold cursor-pointer transition-colors ${
                          isActive ? 'bg-[#1e3a8a] text-white' : 'hover:bg-white text-neutral-800'
                        }`}
                      >
                        <span>{s === 0.5 ? '0.5X (Tactical)' : s === 1 ? '1.0X (Real)' : s === 2 ? '2.0X (Brisk)' : '5.0X (Fast)'}</span>
                        {isActive && <Check size={11} />}
                      </button>
                    );
                  })}
                  <div className="border-t border-[#a1a1aa] my-0.5" />
                  <button
                    onClick={() => {
                      engine.resetBattle();
                      setIsSpeedOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 text-left rounded text-[10px] font-bold text-neutral-700 hover:bg-white cursor-pointer"
                    title="Reset Simulation to 07:00 AM"
                  >
                    <RotateCcw size={11} />
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
            className="p-1 text-neutral-600 hover:text-black hover:bg-white rounded transition-colors cursor-pointer"
            title="Reset Simulation to 07:00 AM"
          >
            <RotateCcw size={11} />
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
              <Scale size={11} className="text-[#1e3a8a]" />
              <span className="font-bold text-[#1e3a8a] tracking-tight">RATIOS:</span>
              <span
                className={`px-1 rounded text-[9px] font-bold ${
                  state.sectorForceRatios.north.status === 'favorable'
                    ? 'bg-blue-100 text-blue-800'
                    : state.sectorForceRatios.north.status === 'critical'
                    ? 'bg-red-100 text-red-700 animate-pulse'
                    : 'text-neutral-700'
                }`}
              >
                N {state.sectorForceRatios.north.ratio.toFixed(1)}:1
              </span>
              <span className="text-neutral-300">|</span>
              <span
                className={`px-1 rounded text-[9px] font-bold ${
                  state.sectorForceRatios.center.status === 'favorable'
                    ? 'bg-blue-100 text-blue-800'
                    : state.sectorForceRatios.center.status === 'critical'
                    ? 'bg-red-100 text-red-700 animate-pulse'
                    : 'text-neutral-700'
                }`}
              >
                C {state.sectorForceRatios.center.ratio.toFixed(1)}:1
              </span>
              <span className="text-neutral-300">|</span>
              <span
                className={`px-1 rounded text-[9px] font-bold ${
                  state.sectorForceRatios.south.status === 'favorable'
                    ? 'bg-blue-100 text-blue-800'
                    : state.sectorForceRatios.south.status === 'critical'
                    ? 'bg-red-100 text-red-700 animate-pulse'
                    : 'text-neutral-700'
                }`}
              >
                S {state.sectorForceRatios.south.ratio.toFixed(1)}:1
              </span>
              <ChevronDown size={10} className={`transition-transform ${isRatiosOpen ? 'rotate-180' : ''}`} />
            </button>

            {isRatiosOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsRatiosOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#f4f4f5] border-2 border-[#a1a1aa] shadow-xl p-2 flex flex-col gap-1.5 text-black font-sans text-xs">
                  <div className="text-[10px] font-bold text-neutral-600 uppercase border-b border-[#a1a1aa] pb-1 flex items-center justify-between">
                    <span>NATO 3:1 Combat Power Assessment</span>
                    <Scale size={11} className="text-[#1e3a8a]" />
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

        {/* Casualty Box */}
        <div className="flex items-center gap-2 text-[10px] font-mono bg-[#f4f4f5] px-2 py-0.5 border border-[#a1a1aa] shadow-inner font-bold uppercase tracking-tight">
          <span className="text-[#1d4ed8]">FRA {Math.floor(state.frenchLosses).toLocaleString()}</span>
          <span className="text-neutral-400">|</span>
          <span className="text-[#b91c1c]">ALL {Math.floor(state.alliedLosses).toLocaleString()}</span>
        </div>
      </div>

      {/* CLUSTER 3 & 4: Tactical View & Staff Hubs (Right) */}
      <div className="flex items-center gap-2">
        {/* Consolidated VIEW & LAYERS Popover */}
        <div className="relative">
          <button
            onClick={() => setIsLayersOpen((prev) => !prev)}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold border transition-colors cursor-pointer ${
              isLayersOpen || showHexGrid || state.fogOfWarEnabled || showRangeRings || state.showOperationalGraphics || activeFilter !== 'all'
                ? 'bg-[#1e3a8a] text-white border-[#1e40af]'
                : 'bg-[#f4f4f5] text-neutral-700 border-[#a1a1aa] hover:bg-white'
            }`}
            title="Configure Map Overlays, Troop Filters, and Symbology"
          >
            <Layers size={11} />
            <span>VIEW & LAYERS{activeFilter !== 'all' ? ` (${activeFilter.toUpperCase()})` : ''}</span>
            <ChevronDown size={11} className={`transition-transform ${isLayersOpen ? 'rotate-180' : ''}`} />
          </button>

          {isLayersOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsLayersOpen(false)} />

              <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-[#f4f4f5] border-2 border-[#a1a1aa] shadow-xl p-2 flex flex-col gap-1.5 text-black font-sans text-xs">
                {/* 1. Troop Category Filter Rail */}
                <div className="text-[10px] font-bold text-neutral-600 uppercase px-1 border-b border-[#a1a1aa] pb-1">
                  Troop Filter
                </div>
                <div className="grid grid-cols-5 gap-1 bg-[#d4d4d8] p-1 border border-[#a1a1aa]">
                  {(['all', 'infantry', 'cavalry', 'artillery', 'headquarters'] as TroopFilterType[]).map((f) => {
                    const label = f === 'all' ? `ALL (${aliveUnits.length})` : f === 'infantry' ? `INF (${infCount})` : f === 'cavalry' ? `CAV (${cavCount})` : f === 'artillery' ? `ART (${artCount})` : `HQ (${hqCount})`;
                    const shortLabel = f === 'all' ? 'ALL' : f === 'infantry' ? 'INF' : f === 'cavalry' ? 'CAV' : f === 'artillery' ? 'ART' : 'HQ';
                    return (
                      <button
                        key={f}
                        onClick={() => onSelectFilter(f)}
                        title={label}
                        className={`py-0.5 text-[9px] uppercase font-bold text-center border transition-colors cursor-pointer ${
                          activeFilter === f
                            ? 'bg-[#1e3a8a] text-white border-[#1e40af]'
                            : 'bg-[#f4f4f5] text-neutral-700 border-transparent hover:bg-white'
                        }`}
                      >
                        {shortLabel}
                      </button>
                    );
                  })}
                </div>

                {/* 2. Tactical Symbology Mode */}
                <div className="text-[10px] font-bold text-neutral-600 uppercase px-1 border-b border-[#a1a1aa] pb-1 mt-1">
                  Symbology & Doctrine
                </div>
                <button
                  onClick={() => engine.toggleSymbologyMode()}
                  className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-neutral-600 font-bold text-xs">◇</span>
                    <span>NATO APP-6 (◇ OPFOR)</span>
                  </div>
                  {state.wargameSymbology === 'nato' && <Check size={13} className="text-[#1e3a8a]" />}
                </button>

                <button
                  onClick={() => engine.toggleFullHistoricalReplay()}
                  className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                  title="Player Direct Command: French units stand fast awaiting orders. Historical Demo Replay: AI executes Napoleon's maneuvers automatically."
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-neutral-600 font-bold text-xs">⚑</span>
                    <span>{state.isFullHistoricalReplay ? 'Demo: Historical Replay' : 'Player Direct Command'}</span>
                  </div>
                  {!state.isFullHistoricalReplay && <Check size={13} className="text-[#1e3a8a]" />}
                </button>

                {/* 3. Cartographic & Tactical Overlays */}
                <div className="text-[10px] font-bold text-neutral-600 uppercase px-1 border-b border-[#a1a1aa] pb-1 mt-1">
                  Map Overlays
                </div>

                {/* Topography */}
                <button
                  onClick={() => engine.toggleTopography()}
                  className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                  title="Toggle NATO Military Topographic Contour Levels, Spot Elevations & Hypsometric Relief (T)"
                >
                  <div className="flex items-center gap-2">
                    <Mountain size={12} className="text-amber-800" />
                    <span>Topography & Contours (T)</span>
                  </div>
                  {state.showTopography !== false && <Check size={13} className="text-[#1e3a8a]" />}
                </button>

                {/* Range Rings */}
                <button
                  onClick={onToggleRangeRings}
                  className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Crosshair size={12} />
                    <span>Range Rings (R)</span>
                  </div>
                  {showRangeRings && <Check size={13} className="text-[#1e3a8a]" />}
                </button>

                {/* Killzones */}
                <button
                  onClick={() => engine.toggleArtilleryKillzones()}
                  className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                  title="Toggle Artillery Killzone & Dispersion Footprints (K)"
                >
                  <div className="flex items-center gap-2">
                    <Target size={12} />
                    <span>Artillery Killzones (K)</span>
                  </div>
                  {state.showArtilleryKillzones && <Check size={13} className="text-[#1e3a8a]" />}
                </button>

                {/* C2 Graphics & TRPs */}
                <button
                  onClick={() => engine.toggleOperationalGraphics()}
                  className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Map size={12} />
                    <span>C2 Graphics & TRPs</span>
                  </div>
                  {state.showOperationalGraphics && <Check size={13} className="text-[#1e3a8a]" />}
                </button>

                {/* Corps & C2 Overlay */}
                {onToggleCorpsOverlay && (
                  <button
                    onClick={onToggleCorpsOverlay}
                    className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Users size={12} />
                      <span>Corps & C2 Links (C)</span>
                    </div>
                    {showCorpsOverlay && <Check size={13} className="text-[#1e3a8a]" />}
                  </button>
                )}

                {/* Tactical Grid */}
                <button
                  onClick={onToggleHexGrid}
                  className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-neutral-500">#</span>
                    <span>Tactical Grid</span>
                  </div>
                  {showHexGrid && <Check size={13} className="text-[#1e3a8a]" />}
                </button>

                {/* Fog of War */}
                <button
                  onClick={() => engine.toggleFogOfWar()}
                  className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-semibold hover:bg-white border border-transparent hover:border-[#a1a1aa] cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {state.fogOfWarEnabled ? <EyeOff size={12} /> : <Eye size={12} />}
                    <span>Fog of War (Mist)</span>
                  </div>
                  {state.fogOfWarEnabled && <Check size={13} className="text-[#1e3a8a]" />}
                </button>
              </div>
            </>
          )}
        </div>

        {/* CLUSTER 4: Staff Hubs (SITREP, DISPATCH, ORBAT, LOG, MANUAL) */}
        <div className="flex items-center gap-1 bg-[#d4d4d8] border border-[#a1a1aa] p-0.5 shadow-inner">
          {/* SITREP Trigger */}
          <button
            type="button"
            onClick={() => handleTabClick('sitrep')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold border transition-colors relative cursor-pointer ${
              isTabActive('sitrep')
                ? 'bg-[#1e3a8a] text-white border-[#1e40af] shadow-xs'
                : unreadContactsCount > 0
                ? 'bg-red-50 text-red-700 border-red-500 hover:bg-red-100 animate-pulse'
                : needsReinforcementsCount > 0
                ? 'bg-amber-50 text-amber-800 border-amber-400 hover:bg-amber-100 animate-pulse'
                : 'bg-[#f4f4f5] text-neutral-700 border-transparent hover:bg-white'
            }`}
            title="Toggle General SITREP (Active Contacts & Sector Engagements)"
          >
            <ShieldAlert size={11} className={unreadContactsCount > 0 || needsReinforcementsCount > 0 ? 'text-red-600' : ''} />
            <span>SITREP</span>
            {unreadContactsCount > 0 ? (
              <span className="px-1 py-0.1 rounded text-[8px] font-bold bg-red-600 text-white animate-bounce">
                {unreadContactsCount} NEW
              </span>
            ) : activeEngagementsCount > 0 ? (
              <span
                className={`px-1 py-0.1 rounded text-[8px] font-bold ${
                  needsReinforcementsCount > 0 ? 'bg-red-600 text-white' : 'bg-[#1e3a8a] text-white'
                }`}
              >
                {activeEngagementsCount}
              </span>
            ) : null}
          </button>

          {/* DISPATCH Trigger */}
          <button
            type="button"
            onClick={() => handleTabClick('dispatch')}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] uppercase font-bold border transition-all cursor-pointer select-none active:scale-95 ${
              isTabActive('dispatch')
                ? 'bg-[#1e3a8a] text-white border-[#1e40af] shadow-xs'
                : 'bg-blue-100 text-[#1e3a8a] border-blue-300 hover:bg-blue-200'
            }`}
            title="Operational Dispatch Desk: Dictate orders to field commanders (Alt+D or `)"
          >
            <Send size={11} />
            <span>DISPATCH</span>
          </button>

          {/* ORBAT Trigger */}
          <button
            type="button"
            onClick={() => handleTabClick('orbat')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold border transition-colors cursor-pointer ${
              isTabActive('orbat') ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'bg-[#f4f4f5] text-neutral-700 border-transparent hover:bg-white'
            }`}
            title="Toggle Order of Battle (ORBAT)"
          >
            <Users size={11} />
            <span>ORBAT</span>
          </button>

          {/* LOG Trigger */}
          <button
            type="button"
            onClick={() => handleTabClick('log')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold border transition-colors cursor-pointer ${
              isTabActive('log') ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'bg-[#f4f4f5] text-neutral-700 border-transparent hover:bg-white'
            }`}
            title="Toggle Combat Dispatches & Event Log"
          >
            <MessageSquare size={11} />
            <span>LOG</span>
          </button>

          {/* MANUAL Trigger */}
          <button
            type="button"
            onClick={onToggleDoctrine}
            title="Open Tactical Doctrine & Symbology Manual"
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold border bg-[#f4f4f5] text-neutral-700 border-transparent hover:bg-white cursor-pointer"
          >
            <BookOpen size={11} />
            <span>MANUAL</span>
          </button>
        </div>
      </div>
    </header>
  );
});
