import React, { useState, useRef } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { Vector2D } from '../types/game';
import { EngagementsDrawer } from './EngagementsDrawer';
import { ImperialDispatchDesk } from './ImperialDispatchDesk';
import { OrderOfBattle } from './OrderOfBattle';
import { CombatDispatches } from './CombatDispatches';
import { ShieldAlert, Send, Users, MessageSquare, Minus, X, Maximize2, GripVertical } from 'lucide-react';

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
  initialDispatchText?: string;
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
  initialDispatchText = '',
  onFocusLocation,
  onHoverCorps,
  onDispatchCorps,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    return { x: 16, y: 56 };
  });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startMouseX: number; startMouseY: number; startPosX: number; startPosY: number }>({
    startMouseX: 0,
    startMouseY: 0,
    startPosX: 16,
    startPosY: 56,
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
      const maxY = Math.max(48, window.innerHeight - 80);
      setPosition({
        x: Math.max(8, Math.min(maxX, dragStartRef.current.startPosX + dx)),
        y: Math.max(48, Math.min(maxY, dragStartRef.current.startPosY + dy)),
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

  if (!activeTab) return null;

  const activeEngagementsCount = state.activeEngagements?.length || 0;
  const unreadContactsCount = (state.sitrepNotifications || []).filter((s) => !s.read && !s.dismissed).length;
  const needsReinforcementsCount = state.activeEngagements?.filter((e) => e.needsReinforcements).length || 0;

  // Minimized Floating Pill Dock
  if (isMinimized) {
    return (
      <div
        onPointerDown={handlePointerDown}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed z-40 flex items-center bg-[#fbfbfa] border-2 border-[#71717a] shadow-xl rounded p-1 gap-1 text-black font-sans text-[10px] font-bold select-none cursor-grab active:cursor-grabbing animate-in slide-in-from-left-2 duration-150"
      >
        <div className="flex items-center text-neutral-400 pl-0.5" title="Click and drag to move">
          <GripVertical size={12} />
        </div>

        <button
          type="button"
          onClick={() => {
            setIsMinimized(false);
            onSelectTab('sitrep');
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors cursor-pointer ${
            activeTab === 'sitrep' ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'hover:bg-white text-neutral-800 border-transparent'
          }`}
          title="Open Situation Report"
        >
          <ShieldAlert size={12} className={unreadContactsCount > 0 ? 'text-red-500' : ''} />
          <span>SITREP</span>
          {unreadContactsCount > 0 ? (
            <span className="px-1 py-0.2 rounded bg-red-600 text-white text-[8px] animate-pulse">
              {unreadContactsCount}
            </span>
          ) : activeEngagementsCount > 0 ? (
            <span className="px-1 py-0.2 rounded bg-[#1e3a8a] text-white text-[8px]">
              {activeEngagementsCount}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsMinimized(false);
            onSelectTab('dispatch');
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors cursor-pointer ${
            activeTab === 'dispatch' ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'hover:bg-white text-neutral-800 border-transparent'
          }`}
          title="Open Dispatch Desk"
        >
          <Send size={12} />
          <span>DISPATCH</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsMinimized(false);
            onSelectTab('orbat');
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors cursor-pointer ${
            activeTab === 'orbat' ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'hover:bg-white text-neutral-800 border-transparent'
          }`}
          title="Open Order of Battle"
        >
          <Users size={12} />
          <span>ORBAT</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsMinimized(false);
            onSelectTab('log');
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors cursor-pointer ${
            activeTab === 'log' ? 'bg-[#1e3a8a] text-white border-[#1e40af]' : 'hover:bg-white text-neutral-800 border-transparent'
          }`}
          title="Open Combat Log"
        >
          <MessageSquare size={12} />
          <span>LOG</span>
        </button>

        <div className="w-px h-4 bg-[#a1a1aa] mx-0.5" />

        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-1 hover:bg-[#e4e4e7] text-neutral-600 hover:text-black rounded cursor-pointer"
          title="Expand Left Staff Rail"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    );
  }

  // Expanded Left Staff Operations Rail (Compact, Draggable, Translucent)
  const isDispatch = activeTab === 'dispatch';
  const widthClasses = isDispatch ? 'w-[440px]' : 'w-[390px]';

  return (
    <aside
      aria-label="Staff Operations Rail"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className={`fixed z-40 ${widthClasses} max-w-[calc(100vw-32px)] h-[560px] max-h-[72vh] min-h-[360px] bg-[#fbfbfa] border-2 border-[#71717a] shadow-2xl rounded-md text-black font-sans select-none flex flex-col overflow-hidden transition-all duration-150 animate-in slide-in-from-left-2`}
    >
      {/* Universal Staff Rail Master Tab Bar (Draggable Header) */}
      <div
        onPointerDown={handlePointerDown}
        onDoubleClick={() => setPosition({ x: 16, y: 56 })}
        className="flex items-center justify-between px-2 py-1.5 bg-[#e4e4e7] border-b border-[#a1a1aa] flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
        title="Click & drag to move window (double click to reset)"
      >
        {/* Navigation Tabs with Drag Grip Handle */}
        <div className="flex items-center gap-1">
          <div
            className="flex items-center gap-0.5 text-neutral-400 hover:text-black pr-1 mr-0.5 border-r border-[#d4d4d8]"
            title="Click and drag to move window"
          >
            <GripVertical size={13} />
            <span className="text-[8.5px] font-mono font-bold uppercase tracking-wider text-neutral-600 hidden sm:inline">C2</span>
          </div>

          <button
            type="button"
            onClick={() => onSelectTab('sitrep')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold rounded border transition-colors cursor-pointer ${
              activeTab === 'sitrep'
                ? 'bg-[#1e3a8a] text-white border-[#1e40af] shadow-xs'
                : unreadContactsCount > 0
                ? 'bg-red-50 text-red-700 border-red-400 hover:bg-red-100 animate-pulse'
                : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300'
            }`}
            title="General SITREP: In-Contact Alerts & Sector Engagements"
          >
            <ShieldAlert size={11} className={unreadContactsCount > 0 || needsReinforcementsCount > 0 ? 'text-red-500' : ''} />
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

          <button
            type="button"
            onClick={() => onSelectTab('dispatch')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold rounded border transition-colors cursor-pointer ${
              activeTab === 'dispatch'
                ? 'bg-[#1e3a8a] text-white border-[#1e40af] shadow-xs'
                : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300'
            }`}
            title="Operational Dispatch Desk: Transmit tactical battle orders (Alt+D or `)"
          >
            <Send size={11} />
            <span>DISPATCH</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('orbat')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold rounded border transition-colors cursor-pointer ${
              activeTab === 'orbat'
                ? 'bg-[#1e3a8a] text-white border-[#1e40af] shadow-xs'
                : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300'
            }`}
            title="Order of Battle: Corps structure, strengths, and formation reassignments"
          >
            <Users size={11} />
            <span>ORBAT</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('log')}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase font-bold rounded border transition-colors cursor-pointer ${
              activeTab === 'log'
                ? 'bg-[#1e3a8a] text-white border-[#1e40af] shadow-xs'
                : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300'
            }`}
            title="Combat Dispatches & Historical Signal Ledger"
          >
            <MessageSquare size={11} />
            <span>LOG</span>
          </button>
        </div>

        {/* Master Controls: Minimize & Close */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1 text-neutral-500 hover:text-black hover:bg-[#d4d4d8] rounded transition-colors cursor-pointer"
            title="Minimize Left Staff Rail"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            onClick={() => onSelectTab(null)}
            className="p-1 text-neutral-500 hover:text-black hover:bg-[#d4d4d8] rounded transition-colors cursor-pointer"
            title="Close Staff Rail"
          >
            <X size={14} />
          </button>
        </div>
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

        {activeTab === 'dispatch' && (
          <ImperialDispatchDesk
            engine={engine}
            state={state}
            isOpen={true}
            onClose={() => onSelectTab(null)}
            isPickingCoordinates={isPickingCoordinates}
            onTogglePickCoordinates={onTogglePickCoordinates}
            pinpointedCoords={pinpointedCoords}
            onClearPinpointedCoords={onClearPinpointedCoords}
            initialText={initialDispatchText}
            embedded={true}
          />
        )}

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
