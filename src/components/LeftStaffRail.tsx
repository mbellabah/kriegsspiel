import React, { useState, useRef } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { Vector2D } from '../types/game';
import { EngagementsDrawer } from './EngagementsDrawer';
import { ImperialDispatchDesk, DispatchInsert } from './ImperialDispatchDesk';
import { OrderOfBattle } from './OrderOfBattle';
import { CombatDispatches } from './CombatDispatches';
import { Grip, X } from './glyphs';
import { ui, cx } from './ui';

export type StaffTab = 'sitrep' | 'dispatch' | 'orbat' | 'log';

interface LeftStaffRailProps {
  engine: BattleEngine;
  state: SimulationState;
  activeTab: StaffTab | null;
  onSelectTab: (tab: StaffTab | null) => void;
  // Dispatch Desk callbacks
  isPickingCoordinates?: boolean;
  onTogglePickCoordinates?: () => void;
  pinpointedCoords?: Vector2D | null;
  onClearPinpointedCoords?: () => void;
  dispatchInsert?: DispatchInsert | null;
  // Map / Camera callbacks
  onFocusLocation?: (loc: Vector2D) => void;
  onHoverCorps?: (corpsName: string | null) => void;
  onDispatchCorps?: (corpsName: string) => void;
}

export const LeftStaffRail: React.FC<LeftStaffRailProps> = React.memo(({
  engine,
  state,
  activeTab,
  onSelectTab,
  isPickingCoordinates = false,
  onTogglePickCoordinates,
  pinpointedCoords,
  onClearPinpointedCoords,
  dispatchInsert = null,
  onFocusLocation,
  onHoverCorps,
  onDispatchCorps,
}) => {
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    return { x: 6, y: 42 };
  });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startMouseX: number; startMouseY: number; startPosX: number; startPosY: number }>({
    startMouseX: 0,
    startMouseY: 0,
    startPosX: 8,
    startPosY: 42,
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('select')) {
      return;
    }
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.startMouseX;
      const dy = moveEvent.clientY - dragStartRef.current.startMouseY;
      const maxX = Math.max(0, window.innerWidth - 240);
      const maxY = Math.max(42, window.innerHeight - 80);
      setPosition({
        x: Math.max(8, Math.min(maxX, dragStartRef.current.startPosX + dx)),
        y: Math.max(42, Math.min(maxY, dragStartRef.current.startPosY + dy)),
      });
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const TAB_META: Record<StaffTab, { title: string }> = {
    sitrep: { title: 'Situation report' },
    dispatch: { title: 'Orders' },
    orbat: { title: 'Order of battle' },
    log: { title: 'Combat log' },
  };
  const meta = activeTab ? TAB_META[activeTab] : null;
  const isDispatch = activeTab === 'dispatch';

  // The rail stays mounted while closed so the dispatch desk keeps its queue and history
  return (
    <aside
      aria-label="Staff panel"
      aria-hidden={!activeTab}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className={cx(
        ui.panel,
        'fixed z-40',
        isDispatch ? 'w-[440px]' : 'w-[380px]',
        'max-w-[calc(100vw-16px)] h-[560px] max-h-[calc(100vh-76px)] min-h-[320px] text-stone-900 font-sans select-none flex flex-col overflow-hidden',
        !activeTab && 'hidden'
      )}
    >
      <div
        onPointerDown={handlePointerDown}
        onDoubleClick={() => setPosition({ x: 6, y: 42 })}
        className={cx(ui.windowHeader, 'flex-shrink-0 cursor-grab active:cursor-grabbing')}
        title="Drag to move · double-click to reset"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Grip size={12} className="text-stone-400 flex-shrink-0" />
          <span className="truncate">{meta?.title}</span>
        </div>
        <button type="button" onClick={() => onSelectTab(null)} className={cx(ui.btnIcon, 'h-6 w-6')} title="Close panel">
          <X size={14} />
        </button>
      </div>

      {/* Embedded Panel Body */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'sitrep' && (
          <EngagementsDrawer
            isOpen={true}
            onClose={() => onSelectTab(null)}
            engagements={state.activeEngagements || []}
            sitreps={state.sitrepNotifications || []}
            frenchLosses={state.frenchLosses}
            alliedLosses={state.alliedLosses}
            onFocusSector={(loc) => onFocusLocation?.(loc)}
            onLocateUnit={(unitId, loc) => {
              engine.locateUnit(unitId);
              onFocusLocation?.(loc);
            }}
            onDismissAllSitreps={() => engine.dismissAllSitreps()}
            onDismissSitrep={(id) => engine.dismissSitrep(id)}
            embedded={true}
          />
        )}

        <div className={cx('flex-1 min-h-0 flex flex-col', activeTab !== 'dispatch' && 'hidden')}>
          <ImperialDispatchDesk
            engine={engine}
            state={state}
            isOpen={true}
            onClose={() => onSelectTab(null)}
            isPickingCoordinates={isPickingCoordinates}
            onTogglePickCoordinates={onTogglePickCoordinates}
            pinpointedCoords={pinpointedCoords}
            onClearPinpointedCoords={onClearPinpointedCoords}
            insert={dispatchInsert}
            embedded={true}
          />
        </div>

        {activeTab === 'orbat' && (
          <OrderOfBattle
            units={state.units}
            selectedUnitId={state.selectedUnitId}
            engine={engine}
            onClose={() => onSelectTab(null)}
            onDispatchCorps={onDispatchCorps}
            onHoverCorps={onHoverCorps}
            onFocusLocation={onFocusLocation}
            embedded={true}
          />
        )}

        {activeTab === 'log' && (
          <CombatDispatches
            logs={state.combatLogs}
            isOpen={true}
            onClose={() => onSelectTab(null)}
            embedded={true}
          />
        )}
      </div>
    </aside>
  );
});
