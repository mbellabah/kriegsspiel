import React, { useState, useEffect, useMemo } from 'react';
import { BattleEngine, SimulationState } from './engine/simulation';
import { REALISTIC_AUSTERLITZ_SCENARIO } from './data/austerlitzScenario';
import { SandtableCanvas } from './components/SandtableCanvas';
import { WarRoomHUD } from './components/WarRoomHUD';
import { UnitDossier } from './components/UnitDossier';
import { OrderOfBattle } from './components/OrderOfBattle';
import { CombatDispatches } from './components/CombatDispatches';
import { HistoricalModal } from './components/HistoricalModal';

export const App: React.FC = () => {
  const engine = useMemo(() => new BattleEngine(REALISTIC_AUSTERLITZ_SCENARIO), []);
  const [state, setState] = useState<SimulationState>(engine.getState());
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [showHexGrid, setShowHexGrid] = useState(false);
  const [symbology, setSymbology] = useState<'tactical' | 'nato'>('tactical');
  const [isCinematicMode, setIsCinematicMode] = useState(false);
  const [isOOBOpen, setIsOOBOpen] = useState(false);
  const [isDispatchesOpen, setIsDispatchesOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = engine.subscribe((newState) => {
      setState({ ...newState });
    });
    return unsubscribe;
  }, [engine]);

  // Global hotkey: 'c' or 'C' toggles Cinematic Broadcast Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input field
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key.toLowerCase() === 'c') {
        setIsCinematicMode((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectedUnit = useMemo(() => {
    if (!state.selectedUnitId) return null;
    return state.units.find((u) => u.id === state.selectedUnitId) || null;
  }, [state.selectedUnitId, state.units]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Top Universal Tactical Command Rail */}
      <WarRoomHUD
        engine={engine}
        state={state}
        showHexGrid={showHexGrid}
        onToggleHexGrid={() => setShowHexGrid((v) => !v)}
        symbology={symbology}
        onToggleSymbology={() => setSymbology((s) => (s === 'tactical' ? 'nato' : 'tactical'))}
        isCinematicMode={isCinematicMode}
        onToggleCinematic={() => setIsCinematicMode((c) => !c)}
        isOOBOpen={isOOBOpen}
        onToggleOOB={() => setIsOOBOpen((v) => !v)}
        isDispatchesOpen={isDispatchesOpen}
        onToggleDispatches={() => setIsDispatchesOpen((v) => !v)}
      />

      {/* Main Tactical Map Canvas */}
      <SandtableCanvas
        engine={engine}
        state={state}
        showHexGrid={showHexGrid}
        symbology={symbology}
      />

      {/* Left: Collapsible Order of Battle Drawer (hidden in cinematic mode) */}
      {isOOBOpen && !isCinematicMode && (
        <OrderOfBattle
          units={state.units}
          selectedUnitId={state.selectedUnitId}
          engine={engine}
          onClose={() => setIsOOBOpen(false)}
        />
      )}

      {/* Right: Selected Unit Tactical Card (hidden in cinematic mode) */}
      {selectedUnit && !isCinematicMode && (
        <UnitDossier
          unit={selectedUnit}
          engine={engine}
          onClose={() => engine.setSelectedUnit(null)}
        />
      )}

      {/* Bottom Left: Frontline Dispatches Drawer (hidden in cinematic mode) */}
      {isDispatchesOpen && !isCinematicMode && (
        <CombatDispatches
          logs={state.combatLogs}
          isOpen={isDispatchesOpen}
          onClose={() => setIsDispatchesOpen(false)}
        />
      )}

      {/* Scenario Briefing Modal */}
      <HistoricalModal
        scenario={REALISTIC_AUSTERLITZ_SCENARIO}
        isOpen={isBriefingOpen}
        onClose={() => setIsBriefingOpen(false)}
      />
    </div>
  );
};

export default App;
