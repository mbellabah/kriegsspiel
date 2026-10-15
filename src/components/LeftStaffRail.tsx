import React from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { Vector2D } from '../types/game';
import { EngagementsDrawer } from './EngagementsDrawer';
import { ImperialDispatchDesk } from './ImperialDispatchDesk';
import { OrderOfBattle } from './OrderOfBattle';
import { CombatDispatches } from './CombatDispatches';
import { GlyphClose } from './glyphs';

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
  if (!activeTab) return null;

  const activeEngagementsCount = state.activeEngagements?.length || 0;
  const unreadContactsCount = (state.sitrepNotifications || []).filter((s) => !s.read && !s.dismissed).length;
  const needsReinforcementsCount = state.activeEngagements?.filter((e) => e.needsReinforcements).length || 0;

  const tabs: { id: StaffTab; label: string; title: string; badge?: { text: string; alert: boolean } }[] = [
    {
      id: 'sitrep',
      label: 'SITREP',
      title: 'Contacts and sector engagements',
      badge:
        unreadContactsCount > 0
          ? { text: `${unreadContactsCount}`, alert: true }
          : activeEngagementsCount > 0
          ? { text: `${activeEngagementsCount}`, alert: needsReinforcementsCount > 0 }
          : undefined,
    },
    { id: 'dispatch', label: 'Orders', title: 'Write and transmit orders (Alt+D or `)' },
    { id: 'orbat', label: 'ORBAT', title: 'Order of battle' },
    { id: 'log', label: 'Log', title: 'Battle log' },
  ];

  const isDispatch = activeTab === 'dispatch';

  return (
    <aside
      aria-label="Staff panel"
      className={`fixed z-40 left-0 top-10 bottom-7 ${isDispatch ? 'w-[420px]' : 'w-[360px]'} max-w-[calc(100vw-16px)] bg-[#fbfbfa] border-r border-[#a1a1aa] text-black font-sans select-none flex flex-col overflow-hidden`}
    >
      <div className="flex items-stretch justify-between h-7 bg-[#e4e4e7] border-b border-[#a1a1aa] flex-shrink-0">
        <div className="flex items-stretch">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTab(t.id)}
                title={t.title}
                className={`flex items-center gap-1.5 px-3 text-[10px] font-semibold border-r border-[#a1a1aa] cursor-pointer transition-colors ${
                  active ? 'bg-[#fbfbfa] text-black -mb-px' : 'text-neutral-600 hover:text-black hover:bg-[#f4f4f5]'
                }`}
              >
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    className={`min-w-[14px] px-1 text-[8.5px] font-mono font-bold leading-[13px] text-white ${
                      t.badge.alert ? 'bg-[#b91c1c]' : 'bg-[#52525b]'
                    }`}
                  >
                    {t.badge.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onSelectTab(null)}
          className="px-2 text-neutral-500 hover:text-black hover:bg-[#d4d4d8] transition-colors cursor-pointer"
          title="Close panel"
        >
          <GlyphClose size={11} />
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
            onFocusLocation={onFocusLocation}
            isOpen={true}
            onClose={() => onSelectTab(null)}
            embedded={true}
          />
        )}
      </div>
    </aside>
  );
});
