import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BattleEngine, SimulationState } from './engine/simulation';
import { REALISTIC_AUSTERLITZ_SCENARIO } from './data/austerlitzScenario';
import { SandtableCanvas } from './components/SandtableCanvas';
import { WarRoomHUD } from './components/WarRoomHUD';
import { UnitDossier } from './components/UnitDossier';
import { LeftStaffRail, StaffTab } from './components/LeftStaffRail';
import { TroopDoctrineModal } from './components/TroopDoctrineModal';

import { TroopFilterType, Vector2D } from './types/game';
import type { DispatchInsert } from './components/ImperialDispatchDesk';

export const App: React.FC = () => {
  const engine = useMemo(() => new BattleEngine(REALISTIC_AUSTERLITZ_SCENARIO), []);
  const [state, setState] = useState<SimulationState>(engine.getState());
  const [showRangeRings, setShowRangeRings] = useState(false);
  const [showLineOfSight, setShowLineOfSight] = useState(true);
  const [showCorpsOverlay, setShowCorpsOverlay] = useState(false);
  const [hoveredCorps, setHoveredCorps] = useState<string | null>(null);
  // Text pushed into the Orders input; `id` makes repeated identical inserts still apply
  const [dispatchInsert, setDispatchInsert] = useState<DispatchInsert | null>(null);
  const [isBombardTargeting, setIsBombardTargeting] = useState(false);
  const [isDoctrineOpen, setIsDoctrineOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<TroopFilterType>('all');

  // Unified Left Staff Operations Rail ('sitrep' | 'dispatch' | 'orbat' | 'log' | null)
  const [activeStaffTab, setActiveStaffTab] = useState<StaffTab | null>(null);
  const isDispatchDeskOpen = activeStaffTab === 'dispatch';

  const [focusLocation, setFocusLocation] = useState<Vector2D | null>(null);
  const [isPickingCoordinates, setIsPickingCoordinates] = useState(false);
  const [pinpointedCoords, setPinpointedCoords] = useState<Vector2D | null>(null);

  // Coalesce engine notifications (some actions notify per mouse move) into one render per frame
  useEffect(() => {
    let frame = 0;
    const unsubscribe = engine.subscribe(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setState({ ...engine.getState() });
      });
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
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

  // Global hotkey: '`' or Alt+D toggles the Orders panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        return;
      }
      if (e.key === '`' || (e.code === 'KeyD' && e.altKey)) {
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
  const handleToggleRangeRings = useCallback(() => setShowRangeRings((v) => !v), []);
  const handleToggleLineOfSight = useCallback(() => setShowLineOfSight((v) => !v), []);
  const handleToggleCorpsOverlay = useCallback(() => setShowCorpsOverlay((v) => !v), []);
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
    setDispatchInsert({ text: `@${cleanName}, `, mode: 'replace', id: Date.now() });
    setActiveStaffTab('dispatch');
  }, []);
  const handleInsertCompassText = useCallback((text: string) => {
    setActiveStaffTab('dispatch');
    setDispatchInsert({ text, mode: 'append', id: Date.now() });
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#f5f3ee] text-neutral-900 font-sans">
      {/* Top Universal Tactical Command Rail (Consolidated 4-Cluster HUD) */}
      <WarRoomHUD
        engine={engine}
        state={state}
        showRangeRings={showRangeRings}
        onToggleRangeRings={handleToggleRangeRings}
        showLineOfSight={showLineOfSight}
        onToggleLineOfSight={handleToggleLineOfSight}
        showCorpsOverlay={showCorpsOverlay}
        onToggleCorpsOverlay={handleToggleCorpsOverlay}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
        activeStaffTab={activeStaffTab}
        onSelectStaffTab={setActiveStaffTab}
        onToggleDoctrine={handleToggleDoctrine}
      />

      {/* Main Tactical Map Canvas */}
      <SandtableCanvas
        engine={engine}
        state={state}
        activeFilter={activeFilter}
        showRangeRings={showRangeRings}
        onToggleRangeRings={handleToggleRangeRings}
        showLineOfSight={showLineOfSight}
        onToggleLineOfSight={handleToggleLineOfSight}
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
      <LeftStaffRail
        engine={engine}
        state={state}
        activeTab={activeStaffTab}
        onSelectTab={setActiveStaffTab}
        isPickingCoordinates={isPickingCoordinates}
        onTogglePickCoordinates={handleTogglePickCoordinates}
        pinpointedCoords={pinpointedCoords}
        onClearPinpointedCoords={handleClearPinpointedCoords}
        dispatchInsert={dispatchInsert}
        onFocusLocation={handleFocusLocation}
        onHoverCorps={handleHoverCorps}
        onDispatchCorps={handleDispatchCorps}
      />

      {/* Right: selected unit inspector */}
      {selectedUnit && (
        <UnitDossier
          unit={selectedUnit}
          engine={engine}
          onClose={handleCloseUnitDossier}
          isBombardTargeting={isBombardTargeting}
          onStartBombardTargeting={handleStartBombardTargeting}
        />
      )}

      {/* Tactical Doctrine & Symbology Manual Modal */}
      <TroopDoctrineModal
        isOpen={isDoctrineOpen}
        onClose={() => setIsDoctrineOpen(false)}
      />
    </div>
  );
};

export default App;
