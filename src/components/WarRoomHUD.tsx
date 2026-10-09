import React, { useState } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import {
  Play,
  Pause,
  RotateCcw,
  Users,
  MessageSquare,
  BookOpen,
  Layers,
  ChevronDown,
  ShieldAlert,
  Send,
} from 'lucide-react';
import { REALISTIC_AUSTERLITZ_SCENARIO } from '../data/austerlitzScenario';
import { sounds } from '../engine/soundEffects';
import { TroopFilterType } from '../types/game';
import { StaffTab } from './LeftStaffRail';
import { ui, cx } from './ui';

interface WarRoomHUDProps {
  engine: BattleEngine;
  state: SimulationState;
  showRangeRings: boolean;
  onToggleRangeRings: () => void;
  showCorpsOverlay?: boolean;
  onToggleCorpsOverlay?: () => void;
  activeFilter: TroopFilterType;
  onSelectFilter: (filter: TroopFilterType) => void;
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
  showRangeRings,
  onToggleRangeRings,
  showCorpsOverlay = false,
  onToggleCorpsOverlay,
  activeFilter,
  onSelectFilter,
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

  const pad = (n: number) => String(n).padStart(2, '0');
  const clockMin = 7 * 60 + state.timeMinutes;
  const clock = `${pad(Math.floor(clockMin / 60) % 24)}:${pad(Math.floor(clockMin % 60))}`;

  const ratioValue = (label: string, r?: { ratio: number; status: string }) => {
    if (!r) return null;
    const tone =
      r.status === 'favorable' ? 'text-[#0b5ea8]' : r.status === 'critical' ? 'text-[#c2272d]' : 'text-stone-900';
    return (
      <span className="inline-flex items-baseline gap-1 px-1.5">
        <span className="text-[9px] font-semibold text-stone-500">{label}</span>
        <span className={cx(ui.mono, 'text-[12px] font-semibold', tone)}>{r.ratio.toFixed(1)}</span>
      </span>
    );
  };

  const checkRow = (label: string, hotkey: string | null, checked: boolean, onClick: () => void, title?: string) => (
    <button type="button" onClick={onClick} title={title} className={ui.menuItem}>
      <span
        className={cx(
          'flex h-3 w-3 items-center justify-center border',
          checked ? 'bg-[#23324a] border-[#23324a] group-hover:bg-white group-hover:border-white' : 'bg-white border-[#8f897e]'
        )}
      >
        {checked && (
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-white group-hover:text-[#23324a]">
            <path d="M1.5 5.2 4 7.6 8.6 2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </span>
      <span className="flex-1">{label}</span>
      {hotkey && <kbd className="font-mono text-[10px] text-stone-400 group-hover:text-stone-300">{hotkey}</kbd>}
    </button>
  );

  const menuHeader = (label: string) => (
    <div className="px-2 pt-2 pb-1 border-t border-[#d6d1c6] first:border-t-0 first:pt-1">
      <span className={ui.caption}>{label}</span>
    </div>
  );

  const staffTab = (tab: StaffTab, icon: React.ReactNode, label: string, badge?: React.ReactNode, title?: string) => (
    <button
      type="button"
      onClick={() => handleTabClick(tab)}
      title={title}
      className={cx(ui.btn, 'relative', isTabActive(tab) && ui.btnActive)}
    >
      {icon}
      <span>{label}</span>
      {badge}
    </button>
  );

  return (
    <header className="absolute top-0 left-0 right-0 z-50 select-none font-sans">
      <div className={cx(ui.bar, 'relative h-9 px-2 flex items-center justify-between gap-2')}>
        {/* Battle progress */}
        <div className="absolute left-0 right-0 bottom-[-1px] h-[2px] pointer-events-none">
          <div className="h-full bg-[#23324a]" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Left: scenario & time control */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="pl-1 pr-1.5 flex items-baseline gap-1.5 leading-none">
            <span className="text-[13px] font-semibold text-stone-900">Austerlitz</span>
            <span className="text-[11px] text-stone-500">2 Dec 1805</span>
          </div>

          <span className={ui.divider} />

          <button
            type="button"
            onClick={handleTogglePlay}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 h-6 w-[70px] border text-[12px] font-semibold cursor-pointer transition-colors',
              state.isRunning
                ? 'bg-[#f7f5f0] border-[#8f897e] text-stone-900 hover:bg-white'
                : 'bg-[#23324a] border-[#23324a] text-white hover:bg-[#2e4160]'
            )}
            title="Start / pause (Space)"
          >
            {state.isRunning ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            <span>{state.isRunning ? 'Pause' : 'Start'}</span>
          </button>

          <div className={ui.field} title={currentFormattedTime}>
            <span className={cx(ui.fieldValue, 'text-[13px] font-semibold px-2')}>{clock}</span>
          </div>

          <div className={ui.group} title="Simulation speed">
            {[0.5, 1, 2, 5].map((s) => {
              const isActive = Math.abs(state.speedMultiplier - s) < 0.05;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    engine.setSpeedMultiplier(s);
                    try { sounds.playClick(); } catch {}
                  }}
                  className={cx(ui.groupItem, ui.mono, isActive && ui.groupItemActive)}
                >
                  {s}×
                </button>
              );
            })}
          </div>

          <button type="button" onClick={() => engine.resetBattle()} className={ui.btnIcon} title="Restart from 07:00">
            <RotateCcw size={13} />
          </button>
        </div>

        {/* Centre: situation readouts */}
        <div className="hidden xl:flex items-center gap-2">
          {state.sectorForceRatios && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsRatiosOpen((v) => !v)}
                className={cx(ui.field, 'cursor-pointer hover:border-[#8f897e]')}
                title="Force ratio by sector, French : Allied"
              >
                <span className={ui.fieldLabel}>Force ratio</span>
                {ratioValue('N', state.sectorForceRatios.north)}
                {ratioValue('C', state.sectorForceRatios.center)}
                {ratioValue('S', state.sectorForceRatios.south)}
                <ChevronDown size={11} className="mr-1 text-stone-500" />
              </button>

              {isRatiosOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsRatiosOpen(false)} />
                  <div className={cx(ui.popover, 'absolute left-0 top-full mt-1 z-50 w-72')}>
                    <table className="w-full text-[12px]">
                      <tbody>
                        {([
                          ['North', state.sectorForceRatios.north],
                          ['Centre (Pratzen)', state.sectorForceRatios.center],
                          ['South (Telnitz)', state.sectorForceRatios.south],
                        ] as const).map(([name, r]) => (
                          <tr key={name} className="border-b border-[#e0dcd3]">
                            <td className="px-2 py-1.5 text-stone-800">{name}</td>
                            <td className="px-2 py-1.5 text-stone-500">{r.statusLabel}</td>
                            <td className={cx(ui.mono, 'px-2 py-1.5 text-right font-semibold')}>{r.ratio.toFixed(1)}:1</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-2 py-1.5 text-[11px] leading-snug text-stone-500">
                      An attack generally needs 3:1. Below 1:1, defend or delay.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          <div className={ui.field} title="Casualties">
            <span className={ui.fieldLabel}>Losses</span>
            <span className="inline-flex items-center gap-1.5 px-2">
              <span className="h-2 w-3 bg-[#80e0ff] border border-stone-800" />
              <span className={cx(ui.mono, 'text-[12px] font-semibold')}>{Math.floor(state.frenchLosses).toLocaleString()}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 border-l border-[#d6d1c6]">
              <span className="h-2.5 w-2.5 rotate-45 scale-75 bg-[#ff8080] border border-stone-800" />
              <span className={cx(ui.mono, 'text-[12px] font-semibold')}>{Math.floor(state.alliedLosses).toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* Right: overlays & staff panels */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsLayersOpen((prev) => !prev)}
              className={cx(ui.btn, isLayersOpen && ui.btnActive)}
              title="Map layers"
            >
              <Layers size={13} />
              <span>Layers</span>
              <ChevronDown size={11} />
            </button>

            {isLayersOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsLayersOpen(false)} />
                <div className={cx(ui.popover, 'absolute right-0 top-full mt-1 z-50 w-64 py-1')}>
                  {menuHeader('Units')}
                  <div className="px-2 pb-1.5">
                    <div className={cx(ui.group, 'w-full')}>
                      {(['all', 'infantry', 'cavalry', 'artillery', 'headquarters'] as TroopFilterType[]).map((f) => {
                        const count = f === 'all' ? aliveUnits.length : f === 'infantry' ? infCount : f === 'cavalry' ? cavCount : f === 'artillery' ? artCount : hqCount;
                        const short = f === 'all' ? 'All' : f === 'infantry' ? 'Inf' : f === 'cavalry' ? 'Cav' : f === 'artillery' ? 'Arty' : 'HQ';
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => onSelectFilter(f)}
                            title={`${short} (${count})`}
                            className={cx(ui.groupItem, 'flex-1', activeFilter === f && ui.groupItemActive)}
                          >
                            {short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {menuHeader('Map')}
                  {checkRow('Relief and contours', 'T', state.showTopography !== false, () => engine.toggleTopography())}
                  {checkRow('Control measures', null, !!state.showOperationalGraphics, () => engine.toggleOperationalGraphics())}
                  {checkRow('Fog of war', null, !!state.fogOfWarEnabled, () => engine.toggleFogOfWar())}

                  {menuHeader('Overlays')}
                  {checkRow('Weapon ranges, all units', 'R', showRangeRings, onToggleRangeRings)}
                  {checkRow('Artillery target areas', 'K', !!state.showArtilleryKillzones, () => engine.toggleArtilleryKillzones())}
                  {onToggleCorpsOverlay && checkRow('Corps boundaries', 'C', showCorpsOverlay, onToggleCorpsOverlay)}

                  {menuHeader('Simulation')}
                  {checkRow(
                    'AI commands French (historical)',
                    null,
                    !!state.isFullHistoricalReplay,
                    () => engine.toggleFullHistoricalReplay(),
                    'Off: French units wait for your orders. On: the AI follows the historical plan.'
                  )}
                </div>
              </>
            )}
          </div>

          <span className={cx(ui.divider, 'mx-1')} />

          {staffTab(
            'sitrep',
            <ShieldAlert size={13} />,
            'Sitrep',
            unreadContactsCount > 0 ? (
              <span className="ml-0.5 h-4 min-w-[16px] px-1 bg-[#c2272d] text-white text-[10px] font-bold leading-4 text-center">
                {unreadContactsCount}
              </span>
            ) : activeEngagementsCount > 0 ? (
              <span
                className={cx(
                  'ml-0.5 h-4 min-w-[16px] px-1 text-[10px] font-bold leading-4 text-center',
                  needsReinforcementsCount > 0 ? 'bg-[#d97706] text-white' : 'bg-[#b3ada2] text-stone-900'
                )}
              >
                {activeEngagementsCount}
              </span>
            ) : null,
            'Contacts and engagements'
          )}
          {staffTab('dispatch', <Send size={13} />, 'Orders', null, 'Write orders to commanders (`)')}
          {staffTab('orbat', <Users size={13} />, 'ORBAT', null, 'Order of battle')}
          {staffTab('log', <MessageSquare size={13} />, 'Log', null, 'Combat log')}

          <span className={cx(ui.divider, 'mx-1')} />

          <button type="button" onClick={onToggleDoctrine} className={ui.btnIcon} title="Reference: symbols and doctrine">
            <BookOpen size={14} />
          </button>
        </div>
      </div>
    </header>
  );
});
