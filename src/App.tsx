import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BattleEngine, SimulationState } from './engine/simulation';
import { REALISTIC_AUSTERLITZ_SCENARIO } from './data/austerlitzScenario';
import { SandtableCanvas } from './components/SandtableCanvas';
import { WarRoomHUD } from './components/WarRoomHUD';
import { UnitDossier } from './components/UnitDossier';
import { LeftStaffRail, StaffTab } from './components/LeftStaffRail';
import { HistoricalModal } from './components/HistoricalModal';
import { TroopDoctrineModal } from './components/TroopDoctrineModal';

import { TroopFilterType, Vector2D } from './types/game';

export const App: React.FC = () => {
  const engine = useMemo(() => new BattleEngine(REALISTIC_AUSTERLITZ_SCENARIO), []);
  const [state, setState] = useState<SimulationState>(engine.getState());
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [showHexGrid, setShowHexGrid] = useState(false);
  const [showRangeRings, setShowRangeRings] = useState(false);
  const [showCorpsOverlay, setShowCorpsOverlay] = useState(false);
  const [hoveredCorps, setHoveredCorps] = useState<string | null>(null);
  const [dispatchDeskInitialText, setDispatchDeskInitialText] = useState<string>('');
  const [isBombardTargeting, setIsBombardTargeting] = useState(false);
  const [isDoctrineOpen, setIsDoctrineOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<TroopFilterType>('all');
  const [isCinematicMode, setIsCinematicMode] = useState(false);

  // Unified Left Staff Operations Rail ('sitrep' | 'dispatch' | 'orbat' | 'log' | null)
  const [activeStaffTab, setActiveStaffTab] = useState<StaffTab | null>('sitrep');
  const isDispatchDeskOpen = activeStaffTab === 'dispatch';

  const [focusLocation, setFocusLocation] = useState<Vector2D | null>(null);
  const [isPickingCoordinates, setIsPickingCoordinates] = useState(false);
  const [pinpointedCoords, setPinpointedCoords] = useState<Vector2D | null>(null);

  useEffect(() => {
    const unsubscribe = engine.subscribe((newState) => {
      setState({ ...newState });
    });
    return unsubscribe;
  }, [engine]);

  // Auto-cancel CFF targeting if selected unit is no longer an artillery battery
  useEffect(() => {
    if (!state.selectedUnitId) {
      setIsBombardTargeting(false);
      return;
    }
    const unit = state.units.find((u) => u.id === state.selectedUnitId);
    if (!unit || unit.type !== 'artillery') {
      setIsBombardTargeting(false);
    }
  }, [state.selectedUnitId, state.units]);

  // Global hotkeys: 'Shift+C' toggles Cinematic Mode, '`' or 'Alt+D' toggles Dispatch Rail
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        return;
      }
      if (e.key.toLowerCase() === 'c' && e.shiftKey) {
        setIsCinematicMode((prev) => !prev);
      } else if (e.key === '`' || (e.key.toLowerCase() === 'd' && e.altKey)) {
        setActiveStaffTab((prev) => (prev === 'dispatch' ? null : 'dispatch'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectedUnit = useMemo(() => {
    if (!state.selectedUnitId) return null;
    return state.units.find((u) => u.id === state.selectedUnitId) || null;
  }, [state.selectedUnitId, state.units]);

  // Stable memoized callbacks to prevent downstream re-render churn
  const handleToggleHexGrid = useCallback(() => setShowHexGrid((v) => !v), []);
  const handleToggleRangeRings = useCallback(() => setShowRangeRings((v) => !v), []);
  const handleToggleCorpsOverlay = useCallback(() => setShowCorpsOverlay((v) => !v), []);
  const handleToggleCinematic = useCallback(() => setIsCinematicMode((c) => !c), []);
  const handleToggleDoctrine = useCallback(() => setIsDoctrineOpen((v) => !v), []);
  const handleStartBombardTargeting = useCallback(() => setIsBombardTargeting(true), []);
  const handleCancelBombardTargeting = useCallback(() => setIsBombardTargeting(false), []);
  const handleTogglePickCoordinates = useCallback(() => setIsPickingCoordinates((v) => !v), []);
  const handleCancelPickCoordinates = useCallback(() => setIsPickingCoordinates(false), []);
  const handleClearPinpointedCoords = useCallback(() => setPinpointedCoords(null), []);
  const handlePickCoordinates = useCallback((coords: Vector2D) => {
    setPinpointedCoords(coords);
    setIsPickingCoordinates(false);
  }, []);
  const handleOpenSitrep = useCallback(() => setActiveStaffTab('sitrep'), []);
  const handleCloseUnitDossier = useCallback(() => {
    engine.setSelectedUnit(null);
    setIsBombardTargeting(false);
  }, [engine]);
  const handleFocusLocation = useCallback((loc: Vector2D) => setFocusLocation({ ...loc }), []);
  const handleHoverCorps = useCallback((c: string | null) => setHoveredCorps(c), []);
  const handleDispatchCorps = useCallback((corpsName: string) => {
    const cleanName = corpsName.replace(/\s*\([^)]*\)/g, '').trim();
    setDispatchDeskInitialText(`@${cleanName}, `);
    setActiveStaffTab('dispatch');
  }, []);
  const handleInsertCompassText = useCallback((text: string) => {
    setActiveStaffTab('dispatch');
    setDispatchDeskInitialText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) {
        const curState = engine.getState();
        const sel = curState.units.find((u) => u.id === curState.selectedUnitId);
        const cmdName = sel?.commander ? `@${sel.commander.split(' ').pop()}, ` : '';
        return `${cmdName}advance ${text}`;
      }
      return `${trimmed} ${text}`;
    });
  }, [engine]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#f4f4f5] text-neutral-900 font-sans">
      {/* Top Universal Tactical Command Rail (Consolidated 4-Cluster HUD) */}
      <WarRoomHUD
        engine={engine}
        state={state}
        showHexGrid={showHexGrid}
        onToggleHexGrid={handleToggleHexGrid}
        showRangeRings={showRangeRings}
        onToggleRangeRings={handleToggleRangeRings}
        showCorpsOverlay={showCorpsOverlay}
        onToggleCorpsOverlay={handleToggleCorpsOverlay}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
        isCinematicMode={isCinematicMode}
        onToggleCinematic={handleToggleCinematic}
        activeStaffTab={activeStaffTab}
        onSelectStaffTab={setActiveStaffTab}
        onToggleDoctrine={handleToggleDoctrine}
      />

      {/* Main Tactical Map Canvas */}
      <SandtableCanvas
        engine={engine}
        state={state}
        showHexGrid={showHexGrid}
        activeFilter={activeFilter}
        showRangeRings={showRangeRings}
        onToggleRangeRings={handleToggleRangeRings}
        showCorpsOverlay={showCorpsOverlay}
        onToggleCorpsOverlay={handleToggleCorpsOverlay}
        hoveredCorps={hoveredCorps}
        isBombardTargeting={isBombardTargeting}
        onStartBombardTargeting={handleStartBombardTargeting}
        onCancelBombardTargeting={handleCancelBombardTargeting}
        focusLocation={focusLocation}
        isPickingCoordinates={isPickingCoordinates}
        onPickCoordinates={handlePickCoordinates}
        onCancelPickCoordinates={handleCancelPickCoordinates}
        isDispatchDeskOpen={isDispatchDeskOpen}
        onInsertCompassText={handleInsertCompassText}
        onOpenSitrep={handleOpenSitrep}
      />

      {/* Unified Left Staff Operations Rail (SITREP, DISPATCH, ORBAT, LOG) */}
      {!isCinematicMode && (
        <LeftStaffRail
          engine={engine}
          state={state}
          activeTab={activeStaffTab}
          onSelectTab={setActiveStaffTab}
          isPickingCoordinates={isPickingCoordinates}
          onTogglePickCoordinates={handleTogglePickCoordinates}
          pinpointedCoords={pinpointedCoords}
          onClearPinpointedCoords={handleClearPinpointedCoords}
          initialDispatchText={dispatchDeskInitialText}
          onFocusLocation={handleFocusLocation}
          onHoverCorps={handleHoverCorps}
          onDispatchCorps={handleDispatchCorps}
        />
      )}

      {/* Right: Selected Unit Tactical Card (Cleanly docked at right-0, hidden in cinematic mode) */}
      {selectedUnit && !isCinematicMode && (
        <UnitDossier
          unit={selectedUnit}
          engine={engine}
          onClose={handleCloseUnitDossier}
          isBombardTargeting={isBombardTargeting}
          onStartBombardTargeting={handleStartBombardTargeting}
        />
      )}

      {/* Scenario Briefing Modal */}
      <HistoricalModal
        scenario={REALISTIC_AUSTERLITZ_SCENARIO}
        isOpen={isBriefingOpen}
        onClose={() => setIsBriefingOpen(false)}
      />

      {/* Tactical Doctrine & Symbology Manual Modal */}
      <TroopDoctrineModal
        isOpen={isDoctrineOpen}
        onClose={() => setIsDoctrineOpen(false)}
      />
    </div>
  );
};

export default App;
