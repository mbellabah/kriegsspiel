import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { dispatchService, stripDiacritics, parseTemporalConstraints, parseConditionAndChaining } from '../services/llmDispatchService';
import { DispatchEntry, Vector2D, HistoricalDispatch, OrderSource } from '../types/game';
import { Check, X } from './glyphs';

export interface DispatchInsert {
  text: string;
  mode: 'replace' | 'append';
  id: number;
}

interface ImperialDispatchDeskProps {
  engine: BattleEngine;
  state: SimulationState;
  isOpen: boolean;
  onClose: () => void;
  isPickingCoordinates?: boolean;
  onTogglePickCoordinates?: () => void;
  pinpointedCoords?: Vector2D | null;
  onClearPinpointedCoords?: () => void;
  insert?: DispatchInsert | null;
  embedded?: boolean;
}

interface TacticalMention {
  id: string;
  category: 'corps' | 'commander' | 'location' | 'unit';
  token: string;
  name: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  keywords: string[];
}

export interface QueuedDispatch {
  id: string;
  rawText: string;
  timestamp: number;
  formattedTime: string;
  recipientHint: string;
  badge: string;
  badgeColor: string;
  timingHint?: string;
  conditionHint?: string;
}

export const ImperialDispatchDesk: React.FC<ImperialDispatchDeskProps> = ({
  engine,
  state,
  isOpen,
  onClose,
  isPickingCoordinates = false,
  onTogglePickCoordinates,
  pinpointedCoords = null,
  onClearPinpointedCoords,
  insert,
  embedded = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dispatches, setDispatches] = useState<DispatchEntry[]>([]);
  const [queuedDispatches, setQueuedDispatches] = useState<QueuedDispatch[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'history' | 'auto_general'>('queue');
  const [isBatchTransmitting, setIsBatchTransmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [executedHistoricalIds, setExecutedHistoricalIds] = useState<Set<string>>(new Set());

  const historicalDispatches = useMemo(() => state.historicalDispatches || [], [state.historicalDispatches]);

  const [isInputFocused, setIsInputFocused] = useState(false);
  const [activeHelperCategory, setActiveHelperCategory] = useState<'actions' | 'timing' | 'conditions' | 'trps' | 'none'>('actions');

  // Command history buffer for ArrowUp / ArrowDown recall
  const [historyList, setHistoryList] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  // Autocomplete "@" mention state
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const mentionsListRef = useRef<HTMLDivElement | null>(null);

  // Selected friendly unit quick context helpers
  const selectedUnit = useMemo(() => {
    if (!state.selectedUnitId) return null;
    return state.units.find((u) => u.id === state.selectedUnitId && u.faction === state.playerFaction) || null;
  }, [state.selectedUnitId, state.units, state.playerFaction]);

  const selectedCommanderSurname = useMemo(() => {
    if (!selectedUnit?.commander) return null;
    return (selectedUnit.commander.split(' ').pop() || selectedUnit.commander).replace(/[’‘`]/g, "'");
  }, [selectedUnit]);

  const selectedCleanName = useMemo(() => {
    if (!selectedUnit?.name) return null;
    return selectedUnit.name.replace(/\s*\([^)]*\)/g, '').trim().replace(/[’‘`]/g, "'");
  }, [selectedUnit]);

  const selectedCorps = useMemo(() => {
    if (!selectedUnit?.corps) return null;
    return selectedUnit.corps.replace(/\s*\([^)]*\)/g, '').trim();
  }, [selectedUnit]);

  const appendToInput = (text: string) => {
    setInputText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      return `${trimmed} ${text}`;
    });
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const appendTrpToInput = (trpCode: string, trpCoords: string) => {
    const targetText = `${trpCode} ${trpCoords}`;
    setInputText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) {
        if (selectedUnit) {
          const cmd = selectedCommanderSurname || selectedCleanName;
          return `@${cmd}, advance to ${targetText}`;
        }
        return `Advance to ${targetText}`;
      }
      return `${trimmed} ${targetText}`;
    });
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  // If the user clicks anywhere outside the dispatch drawer, blur the textarea so WASD camera panning works immediately
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        inputRef.current?.blur();
        setIsInputFocused(false);
        setIsMentionOpen(false);
      }
    };
    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown);
  }, []);

  // Whenever user pinpoints coordinates on the tactical sandtable map, insert them directly
  useEffect(() => {
    if (pinpointedCoords) {
      const coordStr = `(${pinpointedCoords.x}, ${pinpointedCoords.y})`;
      setInputText((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) {
          if (selectedUnit) {
            const cmd = selectedCommanderSurname || selectedCleanName;
            return `@${cmd}, advance to ${coordStr}`;
          }
          return `Advance to ${coordStr}`;
        }
        if (trimmed.endsWith(',')) return `${trimmed} advance to ${coordStr}`;
        return `${trimmed} ${coordStr}`;
      });
      onClearPinpointedCoords?.();
      setTimeout(() => {
        inputRef.current?.focus();
        setIsInputFocused(true);
      }, 60);
    }
  }, [pinpointedCoords, onClearPinpointedCoords, selectedUnit, selectedCommanderSurname, selectedCleanName]);

  useEffect(() => {
    if (!insert) return;
    if (insert.mode === 'replace') {
      setInputText(insert.text);
    } else {
      // Append to whatever is being written; start a fresh order for the selected unit if empty
      setInputText((prev) => {
        const trimmed = prev.trim();
        if (trimmed) return `${trimmed} ${insert.text}`;
        const live = engine.getState();
        const sel = live.units.find((u) => u.id === live.selectedUnitId);
        const cmd = sel?.commander ? `@${sel.commander.split(' ').pop()}, ` : '';
        return `${cmd}advance ${insert.text}`;
      });
    }
    const t = setTimeout(() => {
      inputRef.current?.focus();
      setIsInputFocused(true);
    }, 60);
    return () => clearTimeout(t);
  }, [insert?.id]);

  // Build comprehensive tactical mentions catalog from scenario state
  const tacticalMentions = useMemo<TacticalMention[]>(() => {
    const list: TacticalMention[] = [];
    const seenIds = new Set<string>();

    // 0. Friendly Army Corps (Prioritized for strategic army-level commands)
    const friendlyCorpsMap = new Map<string, number>();
    for (const unit of state.units) {
      if (unit.faction === state.playerFaction && unit.corps) {
        friendlyCorpsMap.set(unit.corps, (friendlyCorpsMap.get(unit.corps) || 0) + 1);
      }
    }
    for (const [corpsName, count] of friendlyCorpsMap.entries()) {
      const cleanToken = `@${corpsName.replace(/\s*\([^)]*\)/g, '').trim()}`;
      list.push({
        id: `corps_${corpsName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        category: 'corps',
        token: cleanToken,
        name: corpsName,
        subtitle: `${count} Regiments & Batteries • Full Corps Command`,
        badge: 'CORPS',
        badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
        keywords: [corpsName.toLowerCase(), 'corps', cleanToken.toLowerCase()],
      });
    }

    // 1. Friendly Formations & Commanders (Unified: EXACTLY ONE entry per physical unit counter)
    for (const unit of state.units) {
      if (unit.faction === state.playerFaction) {
        const id = `unit_${unit.id}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const cleanCommander = (unit.commander || '').replace(/[’‘`]/g, "'").trim();
        const rawSurname = cleanCommander ? (cleanCommander.split(' ').pop() || cleanCommander) : '';
        const surname = rawSurname.replace(/[’‘`]/g, "'");
        const cleanUnitName = unit.name ? unit.name.replace(/\s*\([^)]*\)/g, '').replace(/[’‘`]/g, "'").trim() : '';

        // Token: Prefer commander surname (historical Napoleonic doctrine), fallback to unit name
        const token = surname ? `@${surname}` : `@${cleanUnitName}`;

        let displayName = cleanCommander || cleanUnitName;
        let subtitle = `${unit.corps || 'Grande Armée'}`;

        const isArty = unit.type === 'artillery';
        const isCav = unit.type === 'cavalry';
        const isHq = unit.type === 'headquarters';
        const isLog = unit.type === 'supply';

        let badge = 'INF';
        let badgeColor = 'bg-blue-100 text-blue-900 border-blue-300';

        if (isArty) {
          badge = 'ARTY';
          badgeColor = 'bg-amber-100 text-amber-900 border-amber-300';
          if (cleanCommander && cleanUnitName && cleanCommander.toLowerCase() !== cleanUnitName.toLowerCase()) {
            displayName = `${cleanCommander} (${cleanUnitName})`;
          }
          subtitle = `${unit.corps} • Artillery (${unit.strength} guns)`;
        } else if (isCav) {
          badge = 'CAV';
          badgeColor = 'bg-sky-100 text-sky-900 border-sky-300';
          subtitle = `${cleanUnitName} • ${unit.corps} (${unit.strength.toLocaleString()} sabres)`;
        } else if (isHq) {
          badge = 'HQ';
          badgeColor = 'bg-purple-100 text-purple-900 border-purple-300';
          subtitle = `${unit.corps} • Corps Headquarters`;
        } else if (isLog) {
          badge = 'LOG';
          badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
          displayName = cleanCommander ? `${cleanCommander} (${cleanUnitName})` : cleanUnitName;
          subtitle = `${unit.corps} • Logistics & Supply`;
        } else {
          // Infantry
          subtitle = `${cleanUnitName} • ${unit.corps} (${unit.strength.toLocaleString()} men)`;
        }

        // Keywords: match commander surname, full commander name, unit name, corps, type
        const keywords = [
          surname.toLowerCase(),
          cleanCommander.toLowerCase(),
          cleanUnitName.toLowerCase(),
          unit.type.toLowerCase(),
          (unit.corps || '').toLowerCase(),
        ];
        if (cleanUnitName.includes(' ')) {
          keywords.push(...cleanUnitName.toLowerCase().split(/\s+/));
        }

        list.push({
          id,
          category: 'commander',
          token,
          name: displayName,
          subtitle,
          badge,
          badgeColor,
          keywords: Array.from(new Set(keywords.filter(Boolean))),
        });
      }
    }

    // Hostile Force Contacts (for attack/recon orders e.g. "Assault @Bagration")
    for (const unit of state.units) {
      if (unit.faction !== state.playerFaction && unit.commander) {
        const rawSurname = unit.commander.split(' ').pop() || unit.commander;
        const surname = rawSurname.replace(/[’‘`]/g, "'");
        const id = `cmd_enemy_${surname.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          const cleanCommander = unit.commander.replace(/[’‘`]/g, "'");
          list.push({
            id,
            category: 'commander',
            token: `@${surname}`,
            name: `${cleanCommander} (Hostile)`,
            subtitle: `${unit.corps} • Hostile Contact`,
            badge: 'ENEMY',
            badgeColor: 'bg-red-100 text-red-900 border-red-300',
            keywords: [surname.toLowerCase(), cleanCommander.toLowerCase(), 'enemy', 'hostile'],
          });
        }
      }
    }

    // 2. Tactical Locations & Strategic Landmarks
    for (const terrain of state.terrain) {
      if (terrain.name) {
        const cleanName = terrain.name.replace(/\s*\([^)]*\)/g, '').trim().replace(/[’‘`]/g, "'");
        const id = `loc_${cleanName.toLowerCase()}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          const elev = terrain.elevation ? ` • ${terrain.elevation}m` : '';
          list.push({
            id,
            category: 'location',
            token: `@${cleanName}`,
            name: cleanName,
            subtitle: `${terrain.type.toUpperCase()}${elev} • Sector Objective`,
            badge: 'LOC',
            badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
            keywords: [cleanName.toLowerCase(), terrain.name.toLowerCase(), terrain.type.toLowerCase()],
          });
        }
      }
    }

    // 2.5 Pre-planned Target Reference Points (TRPs)
    if (state.targetReferencePoints) {
      for (const trp of state.targetReferencePoints) {
        list.push({
          id: trp.id,
          category: 'location',
          token: `@${trp.code}`,
          name: `${trp.code}: ${trp.name}`,
          subtitle: `(${trp.position.x}, ${trp.position.y}) • Pre-registered TRP`,
          badge: 'TRP',
          badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
          keywords: [trp.code.toLowerCase(), trp.name.toLowerCase(), 'trp', 'target', 'fires', 'smoke'],
        });
      }
    }

    return list;
  }, [state.units, state.playerFaction, state.terrain, state.targetReferencePoints]);

  // Autocomplete filtering based on query
  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return tacticalMentions.slice(0, 10);
    const q = mentionQuery.toLowerCase();
    return tacticalMentions
      .filter((item) => item.keywords.some((k) => k.includes(q)) || item.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [tacticalMentions, mentionQuery]);

  // Keep selection index bounded
  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery]);

  useEffect(() => {
    if (isMentionOpen && mentionsListRef.current) {
      const activeEl = mentionsListRef.current.children[selectedMentionIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedMentionIndex, isMentionOpen]);

  // Check mention trigger at current input cursor position
  const evaluateMentionTrigger = (text: string, cursor: number) => {
    const beforeCursor = text.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');

    if (lastAt === -1) {
      setIsMentionOpen(false);
      return;
    }

    const isPrecededBySpace = lastAt === 0 || /\s/.test(beforeCursor[lastAt - 1]);
    if (!isPrecededBySpace) {
      setIsMentionOpen(false);
      return;
    }

    const query = beforeCursor.slice(lastAt + 1);
    if (/[,.;!?\n\t]/.test(query) || query.length > 25) {
      setIsMentionOpen(false);
      return;
    }

    setMentionQuery(query);
    setIsMentionOpen(true);
  };

  const handleSelectMention = (item: TacticalMention) => {
    const input = inputRef.current;
    if (!input) return;

    const cursor = input.selectionStart ?? inputText.length;
    const beforeCursor = inputText.slice(0, cursor);
    const afterCursor = inputText.slice(cursor);

    const lastAt = beforeCursor.lastIndexOf('@');
    if (lastAt === -1) return;

    const textBeforeAt = beforeCursor.slice(0, lastAt);
    const replacement = `${item.token} `;
    const newText = `${textBeforeAt}${replacement}${afterCursor}`;
    const newCursor = textBeforeAt.length + replacement.length;

    setInputText(newText);
    setIsMentionOpen(false);

    setTimeout(() => {
      input.focus();
      input.setSelectionRange(newCursor, newCursor);
    }, 10);
  };

  // Helper to extract a quick recipient badge preview for queued orders
  const extractRecipientHint = (text: string): { name: string; badge: string; badgeColor: string } => {
    const textNormalized = text.replace(/[’‘`]/g, "'").trim();
    const textLower = stripDiacritics(textNormalized.toLowerCase());

    // 1. Check for @ mention at the beginning or first @ mention (stopping at punctuation or words)
    const atMatch = /@([a-zA-Z0-9_'\-]+(?:\s+(?:corps|division|battery|column|reserve|guard))?)/i.exec(textNormalized);
    if (atMatch) {
      const token = atMatch[1].trim();
      const tokenLower = stripDiacritics(token.toLowerCase());

      // Check if this token matches a corps
      for (const unit of state.units) {
        if (unit.faction === state.playerFaction && unit.corps) {
          const cClean = stripDiacritics(unit.corps.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase());
          if (tokenLower === cClean || tokenLower === stripDiacritics(unit.corps.toLowerCase())) {
            return { name: unit.corps, badge: 'CORPS', badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300' };
          }
        }
      }

      // Check if this token matches a commander
      for (const unit of state.units) {
        if (unit.faction === state.playerFaction && unit.commander) {
          const surname = stripDiacritics((unit.commander.split(' ').pop() || unit.commander).replace(/[’‘`]/g, "'").toLowerCase());
          if (tokenLower === surname || tokenLower === stripDiacritics(unit.commander.toLowerCase())) {
            const isArty = unit.type === 'artillery';
            return {
              name: unit.commander.replace(/[’‘`]/g, "'"),
              badge: isArty ? 'ARTY' : 'GEN',
              badgeColor: isArty ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-blue-100 text-blue-900 border-blue-300',
            };
          }
        }
      }

      // Check if this token matches a unit name
      for (const unit of state.units) {
        if (unit.faction === state.playerFaction && unit.name) {
          const cleanName = stripDiacritics(unit.name.replace(/\s*\([^)]*\)/g, '').replace(/[’‘`]/g, "'").trim().toLowerCase());
          if (tokenLower === cleanName || cleanName.includes(tokenLower) || tokenLower.includes(cleanName)) {
            const isArty = unit.type === 'artillery';
            return {
              name: unit.commander ? unit.commander.replace(/[’‘`]/g, "'") : unit.name.replace(/[’‘`]/g, "'"),
              badge: isArty ? 'ARTY' : unit.type === 'cavalry' ? 'CAV' : 'INF',
              badgeColor: isArty ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-blue-100 text-blue-900 border-blue-300',
            };
          }
        }
      }

      if (tokenLower.includes('corps')) {
        return { name: token, badge: 'CORPS', badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300' };
      }
      if (tokenLower.includes('artillery') || tokenLower.includes('battery')) {
        return { name: token, badge: 'ARTY', badgeColor: 'bg-amber-100 text-amber-900 border-amber-300' };
      }
      return { name: token, badge: 'CMD', badgeColor: 'bg-blue-100 text-blue-900 border-blue-300' };
    }

    // 2. Check if a commander surname is at the start of the dispatch
    for (const unit of state.units) {
      if (unit.faction === state.playerFaction && unit.commander) {
        const surname = stripDiacritics((unit.commander.split(' ').pop() || unit.commander).replace(/[’‘`]/g, "'").toLowerCase());
        const startRegex = new RegExp(`^\\b${surname}\\b`, 'i');
        if (startRegex.test(stripDiacritics(textNormalized))) {
          const isArty = unit.type === 'artillery';
          return {
            name: unit.commander.replace(/[’‘`]/g, "'"),
            badge: isArty ? 'ARTY' : 'GEN',
            badgeColor: isArty ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-blue-100 text-blue-900 border-blue-300',
          };
        }
      }
    }

    // 3. Fallback: check corps anywhere if mentioned
    for (const unit of state.units) {
      if (unit.faction === state.playerFaction && unit.corps) {
        const cleanC = stripDiacritics(unit.corps.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase());
        if (textLower.includes(cleanC)) {
          return { name: unit.corps, badge: 'CORPS', badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300' };
        }
      }
    }

    // 4. Check for artillery keywords
    if (textLower.includes('artillery') || textLower.includes('battery') || textLower.includes('bombard') || textLower.includes('smoke')) {
      return { name: 'Artillery Battery', badge: 'ARTY', badgeColor: 'bg-amber-100 text-amber-900 border-amber-300' };
    }

    return { name: 'Field Command', badge: 'STAFF', badgeColor: 'bg-neutral-100 text-neutral-800 border-neutral-300' };
  };

  // Add order to local staged queue WITHOUT calling LLM or advancing state (works even when game is paused)
  const handleQueueDispatch = () => {
    const text = inputText.trim();
    if (!text) return;

    setHistoryList((prev) => (prev[0] === text ? prev : [text, ...prev].slice(0, 50)));
    setHistoryIndex(null);

    const hours = Math.floor(state.timeMinutes / 60) + 7;
    const mins = Math.floor(state.timeMinutes % 60);
    const timeFormatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const hint = extractRecipientHint(text);

    const timing = parseTemporalConstraints(text, state.timeMinutes, 0);
    const cond = parseConditionAndChaining(text, state.terrain.filter(t => t.center).map(t => ({ name: t.name, position: t.center })));

    const newQueued: QueuedDispatch = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      rawText: text,
      timestamp: state.timeMinutes,
      formattedTime: timeFormatted,
      recipientHint: hint.name,
      badge: hint.badge,
      badgeColor: hint.badgeColor,
      timingHint: timing.timingDescription,
      conditionHint: cond.conditionDescription,
    };

    setQueuedDispatches((prev) => [...prev, newQueued]);
    setInputText('');
    setIsMentionOpen(false);
    setActiveTab('queue');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Process a single dispatch text through NLP/rule parser and register with engine
  const processSingleDispatch = async (
    text: string,
    source: OrderSource = 'player',
    customSender?: string
  ): Promise<DispatchEntry | null> => {
    const playerUnits = state.units.filter((u) => u.faction === state.playerFaction && u.status !== 'shattered');
    const enemyUnits = state.units.filter((u) => u.faction !== state.playerFaction && u.status !== 'shattered');

    const landmarks = state.terrain
      .filter((t) => t.center && (t.type === 'village' || t.type === 'hill' || t.type === 'ridge' || t.type === 'lake' || t.type === 'bridge' || t.type === 'road'))
      .map((t) => {
        let sector = 'Central Heights';
        if (t.center.y < 450) sector = 'Northern Flank (Santon Hill / Road)';
        else if (t.center.y >= 850) sector = 'Southern Flank (Sokolnitz / Telnitz / Ponds)';
        else if (t.center.x < 800) sector = 'French Rear / Brünn';
        else sector = 'Central Heights (Pratzen / Staré Vinohrady / Puntowitz)';

        return {
          name: t.name,
          position: t.center,
          type: t.type,
          elevation: t.elevation,
          sector,
        };
      });

    const result = await dispatchService.processDispatch(text, {
      playerUnits,
      enemyUnits,
      landmarks,
      currentTimeMinutes: engine.getState().timeMinutes,
      trps: state.targetReferencePoints,
      defaultRecipientId: (() => {
        const live = engine.getState();
        const sel = live.units.find((u) => u.id === live.selectedUnitId);
        return sel && sel.faction === live.playerFaction ? sel.id : null;
      })(),
    });

    // The parse may take seconds; date the order from the clock when it is actually sent
    const sentAt = engine.getState().timeMinutes;
    const arrivalTime = sentAt + result.delayMinutes;

    if (result.isCorpsOrder && result.corpsName) {
      engine.issueCorpsOrder(result.corpsName, {
        type: result.orderType,
        destination: result.destination,
        waypoints: result.waypoints,
        curveControl: result.curveControl,
        targetFormation: result.targetFormation,
        delayMinutes: result.delayMinutes,
        isSmokeMission: result.isSmokeMission,
        isForcedMarch: result.isForcedMarch,
        source: source,
        startTime: result.startTime,
        endTime: result.endTime,
        durationMinutes: result.durationMinutes,
        condition: result.condition,
        chainedOrder: result.chainedOrder,
        conduct: result.conduct,
        observerUnitId: result.observerUnitId,
        supportingBatteryId: result.supportingBatteryId,
        holdFireThreshold: result.holdFireThreshold,
        suppressionTargetId: result.suppressionTargetId,
        isCounterBattery: result.isCounterBattery,
        isGrandBattery: result.isGrandBattery,
      });
    } else {
      if (result.isSkirmishScreen) {
        engine.toggleSkirmishScreen(result.recipientUnitId, true);
      }
      engine.issueOrder(result.recipientUnitId, {
        unitId: result.recipientUnitId,
        type: result.orderType,
        destination: result.destination,
        waypoints: result.waypoints || [],
        curveControl: result.curveControl,
        targetFormation: result.targetFormation,
        finalHeading: result.finalHeading,
        plannedTime: sentAt,
        dispatchArrivalTime: arrivalTime,
        isSmokeMission: result.isSmokeMission,
        isForcedMarch: result.isForcedMarch,
        source: source,
        startTime: result.startTime,
        endTime: result.endTime,
        durationMinutes: result.durationMinutes,
        condition: result.condition,
        chainedOrder: result.chainedOrder,
        conduct: result.conduct,
        observerUnitId: result.observerUnitId,
        supportingBatteryId: result.supportingBatteryId,
        holdFireThreshold: result.holdFireThreshold,
        suppressionTargetId: result.suppressionTargetId,
        isCounterBattery: result.isCounterBattery,
        isGrandBattery: result.isGrandBattery,
      });
    }

    const hours = Math.floor(sentAt / 60) + 7;
    const mins = Math.floor(sentAt % 60);
    const timeFormatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

    return {
      id: `dispatch_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: sentAt,
      formattedTime: timeFormatted,
      sender: customSender || 'Command Staff',
      rawText: text,
      recipientName: result.recipientName,
      recipientUnitId: result.recipientUnitId,
      orderType: result.orderType,
      acknowledgment: result.acknowledgment,
      status: 'acknowledged',
      delayMinutes: result.delayMinutes,
      modelUsed: result.modelUsed,
      isSmokeMission: result.isSmokeMission,
      startTime: result.startTime,
      endTime: result.endTime,
      durationMinutes: result.durationMinutes,
      conditionDescription: result.conditionDescription,
      timingDescription: result.timingDescription,
    };
  };

  // Auto-General Reactive Dispatch Execution (when Auto-Coordination Mode is Active)
  useEffect(() => {
    if (!state.autoGeneralEnabled || historicalDispatches.length === 0) return;

    const dueDispatches = historicalDispatches.filter(
      (d) => d.timeMinutes <= state.timeMinutes && !executedHistoricalIds.has(d.id)
    );

    if (dueDispatches.length === 0) return;

    for (const d of dueDispatches) {
      setExecutedHistoricalIds((prev) => new Set([...prev, d.id]));
      processSingleDispatch(d.rawText, 'historical_event', 'Napoleon Bonaparte (Supreme HQ)').then((entry) => {
        if (entry) {
          setDispatches((prev) => [entry, ...prev]);
        }
      });
    }
  }, [state.timeMinutes, state.autoGeneralEnabled, historicalDispatches, executedHistoricalIds]);

  const handleLoadHistoricalMasterplan = () => {
    if (historicalDispatches.length === 0) return;
    const newQueued: QueuedDispatch[] = historicalDispatches.map((d) => ({
      id: `queue_hist_${d.id}_${Date.now()}`,
      rawText: d.rawText,
      timestamp: d.timeMinutes,
      formattedTime: d.timeFormatted,
      recipientHint: d.recipientName,
      badge: d.badge,
      badgeColor: d.badgeColor,
      timingHint: d.timingHint,
      conditionHint: undefined,
    }));

    setQueuedDispatches((prev) => {
      const existingTexts = new Set(prev.map((p) => p.rawText));
      const filtered = newQueued.filter((q) => !existingTexts.has(q.rawText));
      return [...prev, ...filtered];
    });
    setActiveTab('queue');
  };

  const handleDraftHistoricalDispatch = (d: HistoricalDispatch) => {
    setInputText(d.rawText);
    setTimeout(() => {
      inputRef.current?.focus();
      setIsInputFocused(true);
    }, 40);
  };

  const handleQueueHistoricalDispatch = (d: HistoricalDispatch) => {
    const item: QueuedDispatch = {
      id: `queue_hist_${d.id}_${Date.now()}`,
      rawText: d.rawText,
      timestamp: d.timeMinutes,
      formattedTime: d.timeFormatted,
      recipientHint: d.recipientName,
      badge: d.badge,
      badgeColor: d.badgeColor,
      timingHint: d.timingHint,
      conditionHint: undefined,
    };
    setQueuedDispatches((prev) => [...prev, item]);
    setActiveTab('queue');
  };

  const handleTransmitHistoricalDispatch = async (d: HistoricalDispatch) => {
    if (isProcessing) return;
    setExecutedHistoricalIds((prev) => new Set([...prev, d.id]));
    setIsProcessing(true);
    try {
      const entry = await processSingleDispatch(d.rawText, 'player', 'Napoleon Bonaparte (Supreme HQ)');
      if (entry) {
        setDispatches((prev) => [entry, ...prev]);
        setActiveTab('history');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Immediate send (Shift+Enter or Transmit Now button)
  const handleSendImmediate = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isProcessing) return;

    setHistoryList((prev) => (prev[0] === text ? prev : [text, ...prev].slice(0, 50)));
    setHistoryIndex(null);

    setIsProcessing(true);
    setInputText('');
    setIsMentionOpen(false);

    setSendError(null);
    try {
      const entry = await processSingleDispatch(text);
      if (entry) {
        setDispatches((prev) => [entry, ...prev]);
        setActiveTab('history');
      }
    } catch (err) {
      // Keep the text so the order can be corrected rather than retyped
      setInputText(text);
      setSendError(err instanceof Error ? err.message : 'The order could not be sent.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Transmit a single queued dispatch from the staging drawer
  const handleTransmitSingleQueued = async (queuedId: string) => {
    const item = queuedDispatches.find((q) => q.id === queuedId);
    if (!item || isProcessing) return;

    setIsProcessing(true);
    try {
      const entry = await processSingleDispatch(item.rawText);
      if (entry) {
        setDispatches((prev) => [entry, ...prev]);
        setQueuedDispatches((prev) => prev.filter((q) => q.id !== queuedId));
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'The order could not be sent.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Transmit all staged dispatches sequentially as a coordinated batch
  const handleTransmitAllQueued = async () => {
    if (queuedDispatches.length === 0 || isProcessing || isBatchTransmitting) return;

    setIsProcessing(true);
    setIsBatchTransmitting(true);
    setBatchProgress({ current: 0, total: queuedDispatches.length });

    const newEntries: DispatchEntry[] = [];
    const queueToProcess = [...queuedDispatches];

    setSendError(null);
    const failed: { item: QueuedDispatch; message: string }[] = [];
    try {
      for (let i = 0; i < queueToProcess.length; i++) {
        setBatchProgress({ current: i + 1, total: queueToProcess.length });
        const item = queueToProcess[i];
        try {
          const entry = await processSingleDispatch(item.rawText);
          if (entry) newEntries.push(entry);
        } catch (err) {
          failed.push({ item, message: err instanceof Error ? err.message : 'could not be sent' });
        }
      }

      setDispatches((prev) => [...newEntries.reverse(), ...prev]);
      // Orders that failed stay queued for correction
      setQueuedDispatches(failed.map((f) => f.item));
      if (failed.length > 0) {
        setSendError(`${failed.length} order${failed.length > 1 ? 's' : ''} not sent: ${failed[0].message}`);
      } else {
        setActiveTab('history');
      }
    } finally {
      setIsProcessing(false);
      setIsBatchTransmitting(false);
      setBatchProgress(null);
    }
  };

  const handleEditQueued = (item: QueuedDispatch) => {
    setInputText(item.rawText);
    setQueuedDispatches((prev) => prev.filter((q) => q.id !== item.id));
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleDeleteQueued = (id: string) => {
    setQueuedDispatches((prev) => prev.filter((q) => q.id !== id));
  };

  if (!isOpen) return null;

  const containerClasses = embedded
    ? "flex-1 min-h-0 flex flex-col overflow-hidden bg-[#f5f3ee] text-black font-sans select-none"
    : "absolute bottom-12 left-4 z-40 w-[510px] h-[720px] max-h-[calc(100vh-60px)] bg-[#f5f3ee] border border-[#a8a29e] shadow-[0_4px_16px_rgba(28,25,23,0.16)]  text-black font-sans select-none flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-150";

  const ContainerTag = (embedded ? 'div' : 'aside') as any;

  return (
    <ContainerTag
      ref={drawerRef}
      className={containerClasses}
    >
      {!embedded && (
        <div className="flex items-center justify-between h-8 pl-2 pr-0.5 border-b border-[#b3ada2] bg-[#e6e3dc] text-[11px] font-semibold text-stone-900">
          <span>Orders</span>
          <button
            type="button"
            onClick={onClose}
            className="h-6 w-6 inline-flex items-center justify-center text-neutral-600 hover:text-black hover:bg-white cursor-pointer"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs: Staged Orders Queue vs. Transmitted History vs. Auto-General */}
      <div className="flex items-center bg-[#eceae4] border-b border-[#b3ada2] font-sans select-none">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`flex-1 h-8 px-2 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
 activeTab === 'queue'
 ? 'bg-[#f5f3ee] text-[#23324a] border-b-2 border-b-[#23324a]'
 : 'text-neutral-700 hover:bg-[#ebe7df]'
 }`}
        >
          
          <span>Queue</span>
          {queuedDispatches.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-[#23324a] text-white text-[10px] font-semibold">
              {queuedDispatches.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 h-8 px-2 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
 activeTab === 'history'
 ? 'bg-[#f5f3ee] text-[#23324a] border-b-2 border-b-[#23324a]'
 : 'text-neutral-700 hover:bg-[#ebe7df]'
 }`}
        >
          
          <span>Sent</span>
          {dispatches.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-neutral-300 text-neutral-800 text-[10px] font-semibold">
              {dispatches.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('auto_general')}
          className={`flex-1 h-8 px-2 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
 activeTab === 'auto_general'
 ? 'bg-[#f5f3ee] text-[#23324a] border-b-2 border-b-[#23324a]'
 : 'text-neutral-700 hover:bg-[#ebe7df]'
 }`}
        >
          
          <span>Historical plan</span>
          {state.autoGeneralEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 custom-scrollbar bg-[#f5f3ee]">
        {/* VIEW 1: STAGED QUEUE */}
        {activeTab === 'queue' && (
          <>
            {queuedDispatches.length === 0 ? (
              <div className="p-4 text-center text-neutral-500 text-xs">
                <p className="text-[12px] font-semibold text-neutral-800 mb-1">No orders queued</p>
                <p className="text-[11px] leading-relaxed max-w-sm mx-auto text-neutral-600 mb-3">
                  Write an order below and press <strong>Enter</strong> to queue it. Queue several, then send them together.
                </p>

                {historicalDispatches.length > 0 && (
                  <button
                    type="button"
                    onClick={handleLoadHistoricalMasterplan}
                    className="px-3 py-1.5 bg-white border border-[#23324a] hover:bg-blue-50 text-[#23324a] font-sans text-[10px] font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer "
                  >
                    
                    <span>Load the historical plan ({historicalDispatches.length} orders)</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Batch Action Bar */}
                <div className="flex items-center justify-between p-2 bg-blue-50/80 border border-blue-200 ">
                  <div className="flex items-center gap-1.5 text-[10px] font-sans font-semibold text-[#23324a]">
                    <Check size={12} />
                    <span>{queuedDispatches.length} orders queued</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQueuedDispatches([])}
                      disabled={isProcessing}
                      className="px-2 py-1 text-[10.5px] font-sans font-semibold text-neutral-600 hover:text-red-700 hover:bg-neutral-200 cursor-pointer"
                    >
                      Clear
                    </button>

                    <button
                      type="button"
                      onClick={handleTransmitAllQueued}
                      disabled={isProcessing}
                      className="flex items-center gap-1 px-3 py-1 bg-[#15803d] hover:bg-[#16a34a] disabled:opacity-50 text-white text-[10px] font-sans font-semibold cursor-pointer "
                    >
                      
                      <span>
                        {isBatchTransmitting && batchProgress
                          ? `Sending ${batchProgress.current}/${batchProgress.total}…`
                          : `Send all (${queuedDispatches.length})`}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Staged Cards List */}
                <div className="space-y-2">
                  {queuedDispatches.map((q, idx) => (
                    <div
                      key={q.id}
                      className="bg-white border border-[#a8a29e] p-2.5 hover:border-[#23324a] transition-all"
                    >
                      <div className="flex items-center justify-between text-[10px] font-sans mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-neutral-500">#{idx + 1}</span>
                          <span className={`text-[10px] font-sans font-semibold px-1.5 py-0.2 border ${q.badgeColor}`}>
                            {q.badge}
                          </span>
                          <span className="font-semibold text-[#23324a] truncate max-w-[170px]">{q.recipientHint}</span>
                        </div>
                        <span className="text-neutral-500 text-[10.5px]">{q.formattedTime}</span>
                      </div>

                      <p className="text-neutral-900 font-sans text-[10.5px] bg-[#f8fafc] px-2 py-1 border border-[#e2e8f0] mb-2 leading-relaxed">
                        "{q.rawText}"
                      </p>

                      {(q.timingHint || q.conditionHint) && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {q.timingHint && (
                            <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1 ">
                              
                              <span>{q.timingHint}</span>
                            </span>
                          )}
                          {q.conditionHint && (
                            <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 bg-purple-50 text-purple-900 border border-purple-300 flex items-center gap-1 ">
                              
                              <span>{q.conditionHint}</span>
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[10.5px] font-sans">
                        <span className="text-amber-800 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>Queued</span>
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditQueued(q)}
                            disabled={isProcessing}
                            title="Edit this dispatch"
                            className="p-1 text-neutral-600 hover:text-black hover:bg-neutral-100 cursor-pointer"
                          >Edit</button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQueued(q.id)}
                            disabled={isProcessing}
                            title="Discard from queue"
                            className="p-1 text-neutral-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                          >Remove</button>
                          <button
                            type="button"
                            onClick={() => handleTransmitSingleQueued(q.id)}
                            disabled={isProcessing}
                            title="Transmit this dispatch now"
                            className="flex items-center gap-0.5 px-2 py-0.5 bg-[#23324a] hover:bg-[#2e4160] text-white font-semibold cursor-pointer "
                          >
                            
                            <span>SEND</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* VIEW 2: TRANSMITTED HISTORY */}
        {activeTab === 'history' && (
          <>
            {dispatches.length === 0 ? (
              <div className="p-4 text-center text-neutral-500 text-xs">
                <p className="font-sans text-[10.5px] font-semibold text-neutral-800 mb-1">No orders sent</p>
                <p className="text-[10px] leading-relaxed">
                  Dispatches that have been sent out will be displayed here with their acknowledgments and courier arrival status.
                </p>
              </div>
            ) : (
              dispatches.map((d) => {
                const timeSince = state.timeMinutes - d.timestamp;
                const isDelivered = timeSince >= d.delayMinutes;
                const cleanAck = d.acknowledgment.replace(/^\[ACK[^\]]*\]\s*/i, '');

                return (
                  <div
                    key={d.id}
                    className="bg-white border border-neutral-300 p-2.5 text-xs space-y-1.5 hover:border-neutral-400 transition-all"
                  >
                    {/* Header: Recipient + Delivery Status + Battle Clock */}
                    <div className="flex items-center justify-between text-[10px] font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#23324a] font-semibold">{d.recipientName}</span>
                        {isDelivered ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-0.5">
                            <Check size={8} />
                            <span>Delivered</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-0.5">
                            
                            <span>COURIER ETA ~{Math.max(0.5, d.delayMinutes - timeSince).toFixed(1)}m</span>
                          </span>
                        )}
                      </div>
                      <span className="text-neutral-500 font-semibold text-[10.5px]">{d.formattedTime}</span>
                    </div>

                    {/* Order Quote */}
                    <div className="text-neutral-800 font-sans text-[10.5px] pl-2 border-l-2 border-neutral-300 italic py-0.5 leading-snug">
                      "{d.rawText}"
                    </div>

                    {/* Acknowledgment */}
                    <div className="text-[10px] font-sans text-neutral-800 bg-neutral-50 px-2 py-1 border border-neutral-200 leading-snug">
                      <span className="text-emerald-700 font-semibold mr-1">ACK:</span>
                      <span>{cleanAck}</span>
                    </div>

                    {/* Contingency (if present) */}
                    {d.conditionDescription && (
                      <div className="flex items-center gap-1 text-[10px] font-sans text-purple-900 bg-purple-50/70 border border-purple-200 px-1.5 py-0.5">
                        
                        <span>Contingency: {d.conditionDescription}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* VIEW 3: AUTO-GENERAL (HISTORICAL COORDINATION) */}
        {activeTab === 'auto_general' && (
          <div className="space-y-3">
            {/* Napoleon Staff Header Card */}
            <div className="bg-gradient-to-r from-neutral-50 via-amber-50/40 to-neutral-50 border border-amber-400/60 p-3 ">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-100 border border-amber-400 flex items-center justify-center text-amber-900 ">
                    
                  </div>
                  <div>
                    <div className="text-[10.5px] font-sans font-semibold text-neutral-900 flex items-center gap-1.5 ">
                      <span>Napoleon Bonaparte</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-amber-200/80 text-amber-950 font-semibold border border-amber-300">
                        Supreme HQ
                      </span>
                    </div>
                    <div className="text-[10.5px] font-sans text-neutral-500">
                      Grande Armée Imperial Staff • Battle of Austerlitz (December 2, 1805)
                    </div>
                  </div>
                </div>

                {/* Auto-Coordination Mode Toggle */}
                <button
                  type="button"
                  onClick={() => engine.toggleAutoGeneral()}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-sans font-semibold border transition-all cursor-pointer ${
 state.autoGeneralEnabled
 ? 'bg-emerald-600 border-emerald-700 text-white shadow-emerald-200'
 : 'bg-white border-neutral-300 hover:border-neutral-400 text-neutral-700'
 }`}
                  title="Toggle automated historical dispatch coordination"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
 state.autoGeneralEnabled ? 'bg-white ' : 'bg-neutral-400'
 }`}
                  />
                  <span>
                    AUTO-COORDINATION: {state.autoGeneralEnabled ? 'ACTIVE' : 'STANDBY'}
                  </span>
                </button>
              </div>

              <p className="text-[10px] text-neutral-700 font-sans leading-relaxed mb-2.5">
                Authentic battle dispatches issued by Napoleon and Chief of Staff Berthier to coordinate the Grande Armée at Austerlitz. You can load Napoleon's complete masterplan into your staged queue, draft individual orders, or let the Auto-General coordinate autonomously as the battle clock advances.
              </p>

              {/* Master Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-amber-200/80">
                <button
                  type="button"
                  onClick={handleLoadHistoricalMasterplan}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#23324a] hover:bg-[#2e4160] disabled:opacity-50 text-white text-[10px] font-sans font-semibold cursor-pointer transition-colors"
                >
                  
                  <span>LOAD FULL MASTERPLAN ({historicalDispatches.length} DISPATCHES)</span>
                </button>
              </div>
            </div>

            {/* Historical Dispatches List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10.5px] font-sans font-semibold text-neutral-600 px-1">
                <span>Chronological battle directives</span>
                <span>{historicalDispatches.length} HISTORICAL ORDERS</span>
              </div>

              {historicalDispatches.map((d, idx) => {
                const isExecuted = executedHistoricalIds.has(d.id);
                const isDue = state.timeMinutes >= d.timeMinutes;

                return (
                  <div
                    key={d.id}
                    className={`bg-white border p-2.5 transition-all ${
 isExecuted
 ? 'border-emerald-300 bg-emerald-50/20'
 : isDue
 ? 'border-amber-300 hover:border-amber-500'
 : 'border-[#a8a29e] hover:border-[#23324a]'
 }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between text-[10px] font-sans mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-neutral-400">#{idx + 1}</span>
                        <span className={`text-[10px] font-sans font-semibold px-1.5 py-0.2 border ${d.badgeColor}`}>
                          {d.badge}
                        </span>
                        <span className="font-semibold text-[#23324a]">{d.recipientName}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-sans font-semibold px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 text-neutral-700 flex items-center gap-1">
                          
                          <span>{d.timeFormatted}</span>
                        </span>

                        {isExecuted ? (
                          <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-0.5">
                            <Check size={8} />
                            <span>Sent</span>
                          </span>
                        ) : isDue ? (
                          <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300">
                            Time due
                          </span>
                        ) : (
                          <span className="text-[10px] font-sans font-semibold text-neutral-500">
                            T-{d.timeMinutes - state.timeMinutes}m
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dispatch Text */}
                    <div className="text-neutral-900 font-sans text-[10.5px] bg-[#f8fafc] px-2 py-1.5 border border-[#e2e8f0] mb-1.5 leading-relaxed font-semibold">
                      "{d.rawText}"
                    </div>

                    {/* Historical Context / Quote */}
                    <div className="text-[10.5px] font-serif italic text-neutral-600 bg-amber-50/40 border-l-2 border-amber-400 pl-2 py-1 mb-2 leading-snug">
                      "{d.historicalQuote}"
                    </div>

                    {/* Action Footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[10.5px] font-sans">
                      <span className="text-neutral-500 font-semibold">
                        {d.timingHint || 'Standard deployment'}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDraftHistoricalDispatch(d)}
                          disabled={isProcessing}
                          className="px-2 py-0.5 text-neutral-700 hover:text-black hover:bg-neutral-100 border border-neutral-300 font-semibold cursor-pointer transition-colors"
                          title="Load this dispatch into drafter console to edit or customize"
                        >
                          DRAFT
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQueueHistoricalDispatch(d)}
                          disabled={isProcessing}
                          className="px-2 py-0.5 text-blue-900 hover:text-blue-950 hover:bg-blue-50 border border-blue-300 font-semibold cursor-pointer transition-colors"
                          title="Stage this dispatch into the queue"
                        >
                          STAGE
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTransmitHistoricalDispatch(d)}
                          disabled={isProcessing}
                          className="flex items-center gap-0.5 px-2 py-0.5 bg-[#23324a] hover:bg-[#2e4160] text-white font-semibold cursor-pointer transition-colors"
                          title="Immediately transmit this dispatch"
                        >
                          
                          <span>SEND</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Input Zone with Autocomplete Overlay */}
      <div className="relative p-2.5 border-t border-[#a8a29e] bg-[#e8e4db]">
        {/* Autocomplete Dropdown Popover */}
        {isMentionOpen && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 z-50 bg-white border border-[#a8a29e] shadow-[0_4px_16px_rgba(28,25,23,0.16)] rounded-t overflow-hidden flex flex-col">
            <div className="px-2.5 py-1 bg-[#e8e4db] border-b border-[#a8a29e] flex items-center justify-between text-[10.5px] font-sans font-semibold text-neutral-700">
              <span className=" text-[#23324a]">Tactical Reference Catalog</span>
              <span>{filteredMentions.length} matches</span>
            </div>

            <div
              ref={mentionsListRef}
              className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-neutral-200"
            >
              {filteredMentions.map((item, idx) => {
                const isSelected = idx === selectedMentionIndex;
                return (
                  <div
                    key={item.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectMention(item);
                    }}
                    className={`px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors ${
 isSelected
 ? 'bg-blue-50 border-l-4 border-[#23324a] text-black'
 : 'hover:bg-neutral-100 text-neutral-800'
 }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className={`text-[10px] font-sans font-semibold px-1.5 py-0.5 border shrink-0 ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                      <div className="flex flex-col truncate">
                        <span className="font-sans text-[10.5px] font-semibold text-black flex items-center gap-1.5">
                          <span className="w-8 shrink-0 text-[9px] font-semibold uppercase text-neutral-500">
                            {item.category === 'commander' ? 'Unit' : item.category === 'location' ? 'Place' : 'TRP'}
                          </span>
                          <span className="text-neutral-900 font-semibold truncate">{item.name}</span>
                          <span className="text-[#23324a] text-[10px] font-sans font-normal shrink-0">({item.token})</span>
                        </span>
                        <span className="text-[10.5px] font-sans text-neutral-500 truncate">{item.subtitle}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-2.5 py-1 bg-[#f5f3ee] border-t border-[#d9d3c7] flex items-center justify-between text-[10px] font-sans text-neutral-500">
              <span>↑↓ Navigate</span>
              <span>Enter / Tab to Select</span>
              <span>Esc to Dismiss</span>
            </div>
          </div>
        )}

        {/* Selected Unit Quick Addressee Bar (if a friendly unit is selected on map) */}
        {selectedUnit && (
          <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 bg-blue-50/70 border border-blue-200 text-[10.5px] font-sans select-none ">
            <span className="text-neutral-500 font-semibold text-[10px] flex items-center gap-1 shrink-0">
              
              <span>Target:</span>
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
              <button
                type="button"
                onClick={() => {
                  const token = `@${selectedCommanderSurname || selectedCleanName}`;
                  setInputText((prev) => {
                    const trimmed = prev.trim();
                    if (!trimmed) return `${token}, `;
                    if (trimmed.startsWith('@')) return prev;
                    return `${token}, ${trimmed}`;
                  });
                  setTimeout(() => inputRef.current?.focus(), 30);
                }}
                className="px-2 py-0.5 bg-white border border-blue-400 hover:border-blue-600 hover:bg-blue-100 text-blue-950 font-semibold cursor-pointer shrink-0 transition-colors flex items-center gap-1"
                title={`Target unit: ${selectedUnit.commander || selectedCleanName}`}
              >
                <span className="text-[#23324a]">@{selectedCommanderSurname || selectedCleanName}</span>
                {selectedCommanderSurname && selectedCleanName && selectedCommanderSurname.toLowerCase() !== selectedCleanName.toLowerCase() && (
                  <span className="text-neutral-500 font-normal text-[10px]">({selectedCleanName})</span>
                )}
              </button>

              {selectedCorps && (
                <button
                  type="button"
                  onClick={() => {
                    const token = `@${selectedCorps}`;
                    setInputText((prev) => {
                      const trimmed = prev.trim();
                      if (!trimmed) return `${token}, `;
                      if (trimmed.startsWith('@')) return prev;
                      return `${token}, ${trimmed}`;
                    });
                    setTimeout(() => inputRef.current?.focus(), 30);
                  }}
                  className="px-1.5 py-0.5 bg-white border border-indigo-300 hover:border-indigo-500 hover:bg-indigo-100 text-indigo-900 font-semibold cursor-pointer shrink-0 transition-colors "
                  title={`Target entire army corps: ${selectedCorps}`}
                >
                  @{selectedCorps}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sleek Command Helpers Ribbon (Single row with category tabs, zero ugly scrollbars) */}
        <div className="flex flex-col gap-1 mb-2 select-none">
          {/* Category Selector Tabs */}
          <div className="flex items-center justify-between text-[10.5px] font-sans">
            <div className="flex items-center gap-1">
              <span className="text-neutral-500 font-semibold text-[10px] mr-0.5">Insert</span>
              {[
                { id: 'actions', label: 'Actions' },
                { id: 'timing', label: 'Timing' },
                { id: 'conditions', label: 'Conditions' },
                { id: 'trps', label: 'TRPs' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveHelperCategory(activeHelperCategory === cat.id ? 'none' : (cat.id as typeof activeHelperCategory))}
                  className={`px-1.5 py-0.5 font-semibold cursor-pointer transition-colors ${
 activeHelperCategory === cat.id
 ? 'bg-neutral-800 text-white '
 : 'bg-neutral-200/80 hover:bg-neutral-300 text-neutral-700'
 }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setActiveHelperCategory(activeHelperCategory === 'none' ? 'actions' : 'none')}
              className="text-neutral-500 hover:text-neutral-800 text-[10px] cursor-pointer"
              title={activeHelperCategory === 'none' ? 'Show command helper chips' : 'Hide command helper chips'}
            >
              {activeHelperCategory === 'none' ? '+ Show' : 'Hide'}
            </button>
          </div>

          {/* Active Category Chips */}
          {activeHelperCategory !== 'none' && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 text-[10.5px] font-sans">
              {activeHelperCategory === 'actions' && [
                { label: 'Advance', text: 'advance to ' },
                { label: 'Force March', text: 'force march to ' },
                { label: 'Hold', text: 'hold position at ' },
                { label: 'Bombard', text: 'bombard ' },
                { label: 'Assault', text: 'assault ' },
                { label: 'Skirmish Screen', text: 'deploy skirmish screen ' },
                { label: 'Grand Battery', text: 'mass grand battery on ' },
                { label: 'Counter-Battery', text: 'counter-battery on ' },
                { label: 'Square', text: 'in square formation ' },
                { label: 'Line', text: 'in line formation ' },
                { label: 'Column', text: 'in column formation ' },
              ].map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => appendToInput(d.text)}
                  className="px-2 py-0.5 bg-white border border-neutral-300 hover:border-[#23324a] hover:bg-blue-50 text-neutral-800 font-semibold cursor-pointer shrink-0 transition-colors "
                >
                  {d.label}
                </button>
              ))}

              {activeHelperCategory === 'timing' && [
                { label: 'At 07:30', text: 'at 07:30 AM ' },
                { label: 'At 08:00', text: 'at 08:00 AM ' },
                { label: 'At 08:30', text: 'at 08:30 AM ' },
                { label: 'Hold Until 08:30', text: 'hold until 08:30 AM ' },
                { label: 'Hold Until 09:00', text: 'hold until 09:00 AM ' },
                { label: 'For 15m', text: 'for 15 minutes ' },
                { label: 'For 30m', text: 'for 30 minutes ' },
                { label: 'In 15m', text: 'in 15 minutes ' },
              ].map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => appendToInput(t.text)}
                  className="px-2 py-0.5 bg-amber-50/90 border border-amber-300 hover:border-amber-600 hover:bg-amber-100 text-amber-900 font-semibold cursor-pointer shrink-0 transition-colors "
                >
                  {t.label}
                </button>
              ))}

              {activeHelperCategory === 'conditions' && [
                { label: 'If Attacked -> Square', text: 'if attacked form square ' },
                { label: 'If Attacked -> Fall Back', text: 'if attacked fall back ' },
                { label: 'If Enemy < 200m', text: 'if enemy within 200m fall back ' },
                { label: 'If Morale < 50%', text: 'if morale drops below 50% withdraw ' },
                { label: 'On Contact', text: 'on contact assault ' },
                { label: 'Then Assault', text: 'then assault ' },
                { label: 'Then Hold', text: 'then hold ' },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => appendToInput(c.text)}
                  className="px-2 py-0.5 bg-purple-50/90 border border-purple-300 hover:border-purple-600 hover:bg-purple-100 text-purple-900 font-semibold cursor-pointer shrink-0 transition-colors "
                >
                  {c.label}
                </button>
              ))}

              {activeHelperCategory === 'trps' && (state.targetReferencePoints || []).map((trp) => {
                const coordStr = `(${Math.round(trp.position.x)}, ${Math.round(trp.position.y)})`;
                return (
                  <button
                    key={trp.id}
                    type="button"
                    onClick={() => appendTrpToInput(trp.code, coordStr)}
                    className="px-2 py-0.5 bg-white border border-neutral-300 hover:border-[#23324a] hover:bg-blue-50 text-neutral-800 font-semibold cursor-pointer shrink-0 transition-colors flex items-center gap-1"
                    title={`${trp.code}: ${trp.name} ${coordStr} - ${trp.description}`}
                  >
                    <span className="font-semibold text-[#23324a]">{trp.code}</span>
                    <span className="text-neutral-600">{trp.name.split(' ')[0]}</span>
                    <span className="text-neutral-400 text-[10px] font-normal">{coordStr}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Dispatch Input and Actions Cluster */}
        <div className="flex flex-col gap-1.5">
          {sendError && (
            <div role="alert" className="flex items-start justify-between gap-2 px-2 py-1 border-l-2 border-[#c2272d] bg-[#c2272d]/[0.06] text-[11px] text-[#8f1d22]">
              <span>{sendError}</span>
              <button type="button" onClick={() => setSendError(null)} className="text-[#8f1d22]/70 hover:text-[#8f1d22] cursor-pointer" title="Dismiss">
                ×
              </button>
            </div>
          )}
          <div className="flex items-stretch gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                rows={2}
                value={inputText}
                onChange={(e) => {
                  if (sendError) setSendError(null);
                  setInputText(e.target.value);
                  const cursor = e.target.selectionStart ?? e.target.value.length;
                  evaluateMentionTrigger(e.target.value, cursor);
                }}
                onClick={(e) => {
                  const cursor = (e.target as HTMLTextAreaElement).selectionStart ?? inputText.length;
                  evaluateMentionTrigger(inputText, cursor);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();

                  if (isMentionOpen && filteredMentions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedMentionIndex((prev) => (prev + 1) % filteredMentions.length);
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedMentionIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      handleSelectMention(filteredMentions[selectedMentionIndex]);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsMentionOpen(false);
                      return;
                    }
                  }

                  if (e.key === 'Escape') {
                    e.preventDefault();
                    inputRef.current?.blur();
                    setIsInputFocused(false);
                    return;
                  }

                  // Command history recall when cursor is at start or text is empty
                  if (!isMentionOpen && (e.currentTarget.selectionStart === 0 || inputText === '')) {
                    if (e.key === 'ArrowUp' && historyList.length > 0) {
                      e.preventDefault();
                      const nextIdx = historyIndex === null ? 0 : Math.min(historyList.length - 1, historyIndex + 1);
                      setHistoryIndex(nextIdx);
                      setInputText(historyList[nextIdx]);
                      return;
                    }
                    if (e.key === 'ArrowDown' && historyIndex !== null) {
                      e.preventDefault();
                      const nextIdx = historyIndex - 1;
                      if (nextIdx < 0) {
                        setHistoryIndex(null);
                        setInputText('');
                      } else {
                        setHistoryIndex(nextIdx);
                        setInputText(historyList[nextIdx]);
                      }
                      return;
                    }
                  }

                  if (e.key === 'Enter') {
                    if (e.ctrlKey || e.metaKey || e.altKey) {
                      // Insert newline
                      e.preventDefault();
                      const cursor = e.currentTarget.selectionStart ?? inputText.length;
                      const nextText = inputText.slice(0, cursor) + '\n' + inputText.slice(cursor);
                      setInputText(nextText);
                      setTimeout(() => {
                        if (inputRef.current) {
                          inputRef.current.selectionStart = cursor + 1;
                          inputRef.current.selectionEnd = cursor + 1;
                        }
                      }, 0);
                      return;
                    }

                    e.preventDefault();
                    if (e.shiftKey) {
                      handleSendImmediate();
                    } else {
                      handleQueueDispatch();
                    }
                  }
                }}
                onFocus={() => {
                  setIsInputFocused(true);
                  // Load the fallback language model while the order is being written
                  void dispatchService.warmUp();
                }}
                onBlur={() => setIsInputFocused(false)}
                onKeyUp={(e) => {
                  e.stopPropagation();
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                    const cursor = (e.target as HTMLTextAreaElement).selectionStart ?? inputText.length;
                    evaluateMentionTrigger(inputText, cursor);
                  }
                }}
                disabled={isProcessing}
                placeholder={
                  isInputFocused
                    ? 'e.g. @IV Corps, advance to (1420, 760) or @Vandamme, assault Pratzen at 08:30...'
                    : 'Write an order, e.g. @Vandamme advance to Pratzen'
                }
                className={`w-full bg-white px-2.5 py-1.5 text-xs text-black placeholder-neutral-400 outline-none font-sans border min-h-[54px] max-h-[120px] resize-y custom-scrollbar transition-all ${
 isInputFocused ? 'border-[#23324a] ring-1 ring-[#23324a]' : 'border-[#a8a29e]'
 }`}
              />
            </div>

            {/* Action Buttons: Stacked QUEUE and TRANSMIT */}
            <div className="flex flex-col gap-1 shrink-0 justify-between">
              <button
                type="button"
                onClick={handleQueueDispatch}
                disabled={!inputText.trim() || isProcessing}
                title="Queue dispatch to Staged Orders (Enter)"
                className="px-2.5 py-1 bg-white hover:bg-neutral-100 disabled:opacity-40 text-[#23324a] border border-[#23324a] text-[10.5px] font-semibold font-sans flex items-center justify-center gap-1 transition-colors cursor-pointer h-[25px]"
              >
                
                <span>Queue</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendImmediate()}
                disabled={!inputText.trim() || isProcessing}
                title="Transmit immediately (Shift+Enter)"
                className="px-3 py-1 bg-[#23324a] hover:bg-[#2e4160] disabled:opacity-40 text-white text-[10.5px] font-semibold font-sans flex items-center justify-center gap-1 transition-colors cursor-pointer h-[26px]"
              >
                
                <span>{isProcessing ? 'Sending…' : 'Send'}</span>
              </button>
            </div>
          </div>

          {/* Compact Bottom Toolbar with Map Pinpoint & Keyboard Shortcuts */}
          <div className="flex items-center justify-between text-[10.5px] font-sans text-neutral-500 px-0.5">
            <div className="flex items-center gap-2">
              {onTogglePickCoordinates && (
                <button
                  type="button"
                  onClick={onTogglePickCoordinates}
                  title="Pinpoint target coordinates on map (Esc to cancel)"
                  className={`flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-semibold transition-all cursor-pointer ${
 isPickingCoordinates
 ? 'bg-red-600 text-white border-red-700 '
 : 'bg-white hover:bg-neutral-100 text-[#23324a] border-neutral-300'
 }`}
                >
                  
                  <span>{isPickingCoordinates ? 'Picking…' : 'Pick on map'}</span>
                </button>
              )}

              <span className="text-neutral-400">|</span>
              <span className="text-neutral-600">Type <strong className="text-neutral-800">@</strong> to add addressee</span>
            </div>

            <div className="flex items-center gap-1 text-[10px] text-neutral-500">
              <span>Enter: <strong>Queue</strong></span>
              <span>•</span>
              <span>Shift+Enter: <strong>Send</strong></span>
            </div>
          </div>
        </div>
      </div>
    </ContainerTag>
  );
};
