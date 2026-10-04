import { Unit, Vector2D, ManeuverOrder, Formation, OrderCondition, TargetReferencePoint } from '../types/game';
import { useState, useEffect } from 'react';
import {
  parseCompassDirection,
  headingToBearing,
  bearingToHeading,
  getCardinalDirection,
  extractArcOptions,
  generateArcPath,
} from '../engine/tacticalNavigation';

export interface TacticalLandmarkContext {
  name: string;
  position: Vector2D;
  type?: string;
  elevation?: number;
  sector?: string;
}

export interface TacticalDispatchContext {
  playerUnits: Unit[];
  enemyUnits: Unit[];
  landmarks: TacticalLandmarkContext[];
  currentTimeMinutes: number;
  trps?: TargetReferencePoint[];
}

export interface ParsedDispatchResult {
  recipientUnitId: string;
  recipientName: string;
  orderType: ManeuverOrder['type'];
  destination: Vector2D;
  waypoints?: Vector2D[];
  curveControl?: Vector2D;
  targetFormation?: Formation;
  acknowledgment: string;
  delayMinutes: number;
  modelUsed: string;
  confidence: 'llm' | 'rule_fallback';
  isSmokeMission?: boolean;
  isTrpFire?: boolean;
  trpCode?: string;
  isCorpsOrder?: boolean;
  corpsName?: string;
  targetUnitIds?: string[];
  finalHeading?: number;
  bearingDeg?: number;
  cardinalCode?: string;
  isArcManeuver?: boolean;
  arcDescription?: string;
  isForcedMarch?: boolean;
  startTime?: number;
  endTime?: number;
  durationMinutes?: number;
  condition?: OrderCondition;
  chainedOrder?: Omit<ManeuverOrder, 'id' | 'status'>;
  conditionDescription?: string;
  timingDescription?: string;
  observerUnitId?: string;
  supportingBatteryId?: string;
  holdFireThreshold?: number;
  suppressionTargetId?: string;
  isCounterBattery?: boolean;
  isGrandBattery?: boolean;
  isSkirmishScreen?: boolean;
}

export interface OllamaConnectionStatus {
  online: boolean | null; // null = checking, true = detected & ready, false = offline
  model: string;
  endpoint: string;
  availableModels: string[];
}

type StatusListener = (status: OllamaConnectionStatus) => void;

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
const DEFAULT_MODEL = 'gemma4:e2b';

/**
 * Normalizes unicode diacritics / accents (e.g. Bessières -> Bessieres, Étienne -> Etienne)
 */
export function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Escapes regex special characters to prevent regex syntax errors
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts battlefield grid coordinates from freeform operational dispatches.
 * Supports:
 * - (1420, 680), [1420, 680], (1420 680)
 * - 1420, 680 or 1420,680
 * - x: 1420, y: 680 or x=1420 y=680
 * - coords 1420, 680, grid 1420 680, target 1420, 680
 */
export function extractCoordinates(text: string, trps?: TargetReferencePoint[]): Vector2D | null {
  if (!text) return null;

  // 0. Pre-planned Target Reference Points (TRP 01, TRP 1, TRP-02, TRP 3, etc.)
  if (trps && trps.length > 0) {
    const trpFound = trps.find((t) => {
      const codeRegex = new RegExp(`\\b${escapeRegex(t.code)}\\b`, 'i');
      const nameRegex = new RegExp(`\\b${escapeRegex(t.name)}\\b`, 'i');
      return codeRegex.test(text) || nameRegex.test(text);
    });
    if (trpFound) {
      return { ...trpFound.position };
    }
  }

  const trpMatch = /\b(?:trp|target\s*ref(?:erence)?\s*(?:point)?)\s*[-_#]?\s*(0?[1-9])\b/i.exec(text);
  if (trpMatch) {
    const num = parseInt(trpMatch[1], 10);
    const standardTrpCoords: Record<number, Vector2D> = {
      1: { x: 960, y: 990 },   // Sokolnitz Defile
      2: { x: 915, y: 1215 },  // Telnitz Crossing
      3: { x: 1500, y: 735 },  // Pratzen Crest
      4: { x: 1335, y: 232 },  // Santon Hill Redoubt
      5: { x: 1028, y: 660 },  // Puntowitz Stone Bridge
      6: { x: 1042, y: 750 },  // Kobelnitz Mill Bridge
    };
    if (standardTrpCoords[num]) {
      return standardTrpCoords[num];
    }
  }

  // 1. Bracketed or parenthesized coordinates: (1420, 680), [1420, 680], (1420 680), (50, 80)
  const bracketMatch = /[\(\[]\s*([0-9]+(?:\.[0-9]+)?)\s*[,;\s]\s*([0-9]+(?:\.[0-9]+)?)\s*[\)\]]/.exec(text);
  if (bracketMatch) {
    const x = Math.round(parseFloat(bracketMatch[1]));
    const y = Math.round(parseFloat(bracketMatch[2]));
    if (x >= 0 && x <= 2400 && y >= 0 && y <= 1500) {
      return { x, y };
    }
  }

  // 2. Explicit coordinate key-value pairs: x: 1420, y: 680 or x=1420 y=680
  const labeledMatch = /x\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*[,;\s]\s*y\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i.exec(text);
  if (labeledMatch) {
    const x = Math.round(parseFloat(labeledMatch[1]));
    const y = Math.round(parseFloat(labeledMatch[2]));
    if (x >= 0 && x <= 2400 && y >= 0 && y <= 1500) {
      return { x, y };
    }
  }

  // 3. Coordinate keywords & prepositions: advance to, march to, grid, coords, coordinates, at, target, pos followed by numbers
  const keywordMatch = /(?:grid|coord(?:inate)?s?|target|pos(?:ition)?|location|point|at|to)\s*[:=]?\s*[\(\[]?\s*([0-9]+(?:\.[0-9]+)?)\s*[,;\s]\s*([0-9]+(?:\.[0-9]+)?)\s*[\)\]]?/i.exec(text);
  if (keywordMatch) {
    const x = Math.round(parseFloat(keywordMatch[1]));
    const y = Math.round(parseFloat(keywordMatch[2]));
    if (x >= 0 && x <= 2400 && y >= 0 && y <= 1500) {
      return { x, y };
    }
  }

  // 4. Standalone comma-separated numbers: 1420, 680 or 1420,680 or 50, 80
  const commaMatch = /\b([0-9]{2,4})\s*,\s*([0-9]{2,4})\b/.exec(text);
  if (commaMatch) {
    const x = parseInt(commaMatch[1], 10);
    const y = parseInt(commaMatch[2], 10);
    if (x >= 0 && x <= 2400 && y >= 0 && y <= 1500) {
      return { x, y };
    }
  }

  // 5. Standalone space-separated 3-4 digit coordinate pair: 1420 680
  const spaceMatch = /\b([0-9]{3,4})\s+([0-9]{3,4})\b/.exec(text);
  if (spaceMatch) {
    const x = parseInt(spaceMatch[1], 10);
    const y = parseInt(spaceMatch[2], 10);
    if (x >= 0 && x <= 2400 && y >= 0 && y <= 1500) {
      return { x, y };
    }
  }

  return null;
}

/**
 * Converts battle minutes from 07:00 AM into human-readable 12-hour military clock string
 */
export function formatBattleClock(minutesFromStart: number): string {
  const baseHour = 7;
  const totalMins = Math.floor(baseHour * 60 + minutesFromStart);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const h12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  return `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
}

export interface ParsedTiming {
  startTime?: number;
  endTime?: number;
  durationMinutes?: number;
  timingDescription?: string;
}

/**
 * Extracts tactical timing specifications from dispatches:
 * - Start time: "at 08:30 AM", "at 08:00", "commence at 09:15", "in 20 minutes", "at T+90"
 * - End / Till time: "until 09:00", "hold until 08:45 AM", "till T+120"
 * - Duration: "for 20 minutes", "for 30m", "for 1 hour", "for half an hour"
 */
export function parseTemporalConstraints(
  text: string,
  currentTimeMinutes: number,
  delayMinutes: number
): ParsedTiming {
  const norm = stripDiacritics(text.toLowerCase());
  let startTime: number | undefined = undefined;
  let endTime: number | undefined = undefined;
  let durationMinutes: number | undefined = undefined;

  const parseClockTimeToBattleMinutes = (hStr: string, mStr?: string, ampmStr?: string): number => {
    let hours = parseInt(hStr, 10);
    const mins = mStr ? parseInt(mStr, 10) : 0;
    const ampm = ampmStr?.toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    if (!ampm && hours >= 1 && hours <= 6) hours += 12;

    return Math.max(0, (hours - 7) * 60 + mins);
  };

  // 1. Explicit Start Time: "at 08:30", "at 08:00 AM", "commencing at 09:15", "at 0830"
  const startClockMatch = /\b(?:at|start(?:ing)?\s+at|commenc(?:e|ing)\s+at)\s+([0-1]?[0-9]|2[0-3]):([0-5][0-9])\s*(am|pm)?\b/i.exec(norm);
  if (startClockMatch) {
    startTime = parseClockTimeToBattleMinutes(startClockMatch[1], startClockMatch[2], startClockMatch[3]);
  } else {
    const startAmPmMatch = /\b(?:at|start(?:ing)?\s+at|commenc(?:e|ing)\s+at)\s+([0-1]?[0-9]|2[0-3])\s*(am|pm)\b/i.exec(norm);
    if (startAmPmMatch) {
      startTime = parseClockTimeToBattleMinutes(startAmPmMatch[1], undefined, startAmPmMatch[2]);
    } else {
      const startMilMatch = /\b(?:at|start(?:ing)?\s+at|commenc(?:e|ing)\s+at)\s+(0[7-9]|1[0-6])([0-5][0-9])\s*(?:hrs|hours)?\b/i.exec(norm);
      if (startMilMatch) {
        startTime = parseClockTimeToBattleMinutes(startMilMatch[1], startMilMatch[2]);
      }
    }
  }

  // Relative Start Time: "in 15 minutes", "in 30m", "in 1 hour"
  if (startTime === undefined) {
    const relMinMatch = /\bin\s+(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?|m)\b/i.exec(norm);
    if (relMinMatch) {
      startTime = Math.round(currentTimeMinutes + parseFloat(relMinMatch[1]));
    } else {
      const relHrMatch = /\bin\s+(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\b/i.exec(norm);
      if (relHrMatch) {
        startTime = Math.round(currentTimeMinutes + parseFloat(relHrMatch[1]) * 60);
      }
    }
  }

  // T+ Start Time: "at T+60", "T+90"
  if (startTime === undefined) {
    const tPlusMatch = /\b(?:at\s+)?t\s*\+\s*(\d+)\s*(?:m|min|mins)?\b/i.exec(norm);
    if (tPlusMatch) {
      startTime = parseInt(tPlusMatch[1], 10);
    }
  }

  // 2. End / Until Time: "until 09:00", "till 08:30 AM", "hold until 08:30", "up to 10:00"
  const endClockMatch = /\b(?:until|till|hold\s+until|hold\s+till|up\s+to)\s+([0-1]?[0-9]|2[0-3]):([0-5][0-9])\s*(am|pm)?\b/i.exec(norm);
  if (endClockMatch) {
    endTime = parseClockTimeToBattleMinutes(endClockMatch[1], endClockMatch[2], endClockMatch[3]);
  } else {
    const endAmPmMatch = /\b(?:until|till|hold\s+until|hold\s+till|up\s+to)\s+([0-1]?[0-9]|2[0-3])\s*(am|pm)\b/i.exec(norm);
    if (endAmPmMatch) {
      endTime = parseClockTimeToBattleMinutes(endAmPmMatch[1], undefined, endAmPmMatch[2]);
    } else {
      const endMilMatch = /\b(?:until|till|hold\s+until|hold\s+till|up\s+to)\s+(0[7-9]|1[0-6])([0-5][0-9])\s*(?:hrs|hours)?\b/i.exec(norm);
      if (endMilMatch) {
        endTime = parseClockTimeToBattleMinutes(endMilMatch[1], endMilMatch[2]);
      } else {
        const endTMatch = /\b(?:until|till)\s+t\s*\+\s*(\d+)\s*(?:m|min|mins)?\b/i.exec(norm);
        if (endTMatch) {
          endTime = parseInt(endTMatch[1], 10);
        }
      }
    }
  }

  // 3. Duration: "for 20 minutes", "for 30m", "for 1 hour", "for half an hour"
  const durMinMatch = /\bfor\s+(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?|m)\b/i.exec(norm);
  if (durMinMatch) {
    durationMinutes = Math.round(parseFloat(durMinMatch[1]));
  } else {
    const durHrMatch = /\bfor\s+(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\b/i.exec(norm);
    if (durHrMatch) {
      durationMinutes = Math.round(parseFloat(durHrMatch[1]) * 60);
    } else if (/\bfor\s+(?:an?|one)\s+hour\b/i.test(norm)) {
      durationMinutes = 60;
    } else if (/\bfor\s+half\s+(?:an?\s+)?hour\b/i.test(norm)) {
      durationMinutes = 30;
    }
  }

  // Cross-reconcile duration, start time, and end time
  if (durationMinutes !== undefined) {
    if (startTime !== undefined && endTime === undefined) {
      endTime = startTime + durationMinutes;
    } else if (startTime === undefined && endTime !== undefined) {
      startTime = Math.max(0, endTime - durationMinutes);
    } else if (startTime === undefined && endTime === undefined) {
      const effectiveStart = currentTimeMinutes + delayMinutes;
      endTime = effectiveStart + durationMinutes;
    }
  } else if (startTime !== undefined && endTime !== undefined) {
    durationMinutes = Math.max(0, endTime - startTime);
  }

  let timingDescription: string | undefined = undefined;
  if (startTime !== undefined && endTime !== undefined) {
    timingDescription = `From ${formatBattleClock(startTime)} until ${formatBattleClock(endTime)} (${durationMinutes}m)`;
  } else if (startTime !== undefined) {
    timingDescription = `Standby until ${formatBattleClock(startTime)} (T+${startTime}m)`;
  } else if (endTime !== undefined) {
    timingDescription = `Until ${formatBattleClock(endTime)} (T+${endTime}m)`;
  } else if (durationMinutes !== undefined) {
    timingDescription = `For ${durationMinutes} minutes (until ${formatBattleClock(endTime!)})`;
  }

  return { startTime, endTime, durationMinutes, timingDescription };
}

export interface ParsedConditionAndChaining {
  condition?: OrderCondition;
  chainedClause?: string;
  conditionDescription?: string;
}

/**
 * Extracts tactical condition triggers and chained sequential directives:
 * - If attacked / under fire / on contact -> form square / retreat / charge
 * - If enemy within X meters -> retreat / fall back / charge
 * - If morale drops below X% -> retreat
 * - If casualties exceed X% -> retreat
 * - Chained directives: "then assault Pratzen", "then hold"
 */
export function parseConditionAndChaining(
  text: string,
  landmarks: TacticalLandmarkContext[]
): ParsedConditionAndChaining {
  const norm = stripDiacritics(text);
  const textLower = norm.toLowerCase();

  let condition: OrderCondition | undefined = undefined;
  let chainedClause: string | undefined = undefined;

  // 1. Detect chained follow-up clause ("then ...", "afterwards ...", "subsequently ...")
  const chainedMatch = /\b(?:then|afterwards|subsequently|followed\s+by)\s+(.+)$/i.exec(norm);
  if (chainedMatch) {
    chainedClause = chainedMatch[1].trim();
  }

  // Helper to find landmark target in retreat clause
  const findContingencyRetreatDestination = (text: string): { dest?: Vector2D; name?: string } => {
    const retreatMatch = /\b(?:retreat|fall\s+back|withdraw)\b/i.exec(text);
    if (!retreatMatch) return {};
    const retreatSubstr = text.slice(retreatMatch.index);
    for (const lm of landmarks) {
      const cleanLm = stripDiacritics(lm.name.toLowerCase().replace(/[^a-z0-9]/g, ' '));
      const tokens = cleanLm.split(' ').filter((t) => t.length >= 3);
      if (tokens.some((t) => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(retreatSubstr))) {
        return { dest: { ...lm.position }, name: lm.name };
      }
    }
    return {};
  };

  // 2. Detect conditional trigger
  // Category A: If attacked / under fire / on contact / engaged
  const attackedMatch = /\b(?:if\s+(?:attacked|under\s+fire|engaged|taking\s+fire|fired\s+upon)|on\s+(?:contact|engagement))\b/i.exec(textLower);
  if (attackedMatch) {
    let contingencyAction: OrderCondition['contingencyAction'] = undefined;
    let contingencyDest: Vector2D | undefined = undefined;
    let contingencyDestName: string | undefined = undefined;

    // Check what to do if attacked
    if (/\b(?:form(?:ing)?\s+)?square\b/i.test(textLower)) {
      contingencyAction = 'square';
    } else if (/\b(?:counter\s*attack|charge|assault)\b/i.test(textLower)) {
      contingencyAction = 'charge';
    } else if (/\b(?:retreat|fall\s+back|withdraw)\b/i.test(textLower)) {
      contingencyAction = 'retreat';
      const resolved = findContingencyRetreatDestination(textLower);
      contingencyDest = resolved.dest;
      contingencyDestName = resolved.name;
    } else if (/\bhold\b/i.test(textLower)) {
      contingencyAction = 'hold';
    }

    condition = {
      type: 'if_attacked',
      description: 'If attacked / engaged',
      contingencyAction: contingencyAction || 'square',
      contingencyDestination: contingencyDest,
      contingencyDestinationName: contingencyDestName,
    };
  }

  // Category B: Enemy distance threshold ("if enemy within 250m", "if hostile within 200")
  if (!condition) {
    const enemyDistMatch =
      /\bif\s+(?:the\s+)?enem(?:y|ies)\s+(?:comes?|is|are|gets?|approach(?:es)?)\s*(?:within)?\s*(\d+)\s*(?:m|meters)?\b/i.exec(textLower) ||
      /\bif\s+enem(?:y|ies)\s+within\s+(\d+)\s*(?:m|meters)?\b/i.exec(textLower);
    if (enemyDistMatch) {
      const dist = parseInt(enemyDistMatch[1], 10);
      let contingencyAction: OrderCondition['contingencyAction'] = 'retreat';
      if (/\bsquare\b/i.test(textLower)) contingencyAction = 'square';
      else if (/\bcharge|assault|attack\b/i.test(textLower)) contingencyAction = 'charge';
      const resolved = contingencyAction === 'retreat' ? findContingencyRetreatDestination(textLower) : {};

      condition = {
        type: 'enemy_within',
        triggerValue: dist,
        description: `If enemy within ${dist}m`,
        contingencyAction,
        contingencyDestination: resolved.dest,
        contingencyDestinationName: resolved.name,
      };
    }
  }

  // Category C: Morale threshold ("if morale drops below 50%", "if wavering")
  if (!condition) {
    const moraleMatch =
      /\bif\s+(?:morale|cohesion)\s*(?:drops|falls|is)?\s*(?:below|<)\s*(\d+)%?\b/i.exec(textLower) ||
      /\bif\s+(?:unit\s+)?wavers\b/i.exec(textLower);
    if (moraleMatch) {
      const val = moraleMatch[1] ? parseInt(moraleMatch[1], 10) : 50;
      const resolved = findContingencyRetreatDestination(textLower);
      condition = {
        type: 'morale_below',
        triggerValue: val,
        description: `If morale drops below ${val}%`,
        contingencyAction: 'retreat',
        contingencyDestination: resolved.dest,
        contingencyDestinationName: resolved.name,
      };
    }
  }

  // Category D: Casualties threshold ("if casualties exceed 25%")
  if (!condition) {
    const casMatch = /\bif\s+casualties\s*(?:exceed|>|reach|surpass)\s*(\d+)%?\b/i.exec(textLower);
    if (casMatch) {
      const val = parseInt(casMatch[1], 10);
      const resolved = findContingencyRetreatDestination(textLower);
      condition = {
        type: 'casualties_above',
        triggerValue: val,
        description: `If casualties exceed ${val}%`,
        contingencyAction: 'retreat',
        contingencyDestination: resolved.dest,
        contingencyDestinationName: resolved.name,
      };
    }
  }

  // Category E: Outflanked
  if (!condition) {
    if (/\bif\s+(?:outflanked|encircled|surrounded|flanked)\b/i.test(textLower)) {
      const resolved = findContingencyRetreatDestination(textLower);
      condition = {
        type: 'outflanked',
        description: 'If outflanked or encircled',
        contingencyAction: 'retreat',
        contingencyDestination: resolved.dest,
        contingencyDestinationName: resolved.name,
      };
    }
  }

  let conditionDescription: string | undefined = undefined;
  if (condition) {
    conditionDescription = condition.description;
    if (condition.contingencyAction) {
      conditionDescription += ` -> ${condition.contingencyAction.toUpperCase()}${
        condition.contingencyDestinationName ? ` (${condition.contingencyDestinationName})` : ''
      }`;
    }
  }

  return { condition, chainedClause, conditionDescription };
}

/**
 * Translates a secondary chained directive (e.g. "assault Pratzen", "hold Puntowitz") into a structured order
 */
export function parseChainedDirective(
  clause: string,
  context: TacticalDispatchContext,
  defaultDestination: Vector2D
): { orderType: ManeuverOrder['type']; destination: Vector2D; targetFormation?: Formation } {
  const norm = stripDiacritics(clause.toLowerCase());
  let orderType: ManeuverOrder['type'] = 'assault';
  let targetFormation: Formation | undefined = undefined;

  if (/\b(?:charge|bayonet|melee|storm)\b/i.test(norm)) {
    orderType = 'charge';
    targetFormation = 'column';
  } else if (/\b(?:bombard|fire|barrage|shell)\b/i.test(norm)) {
    orderType = 'bombard';
    targetFormation = 'unlimbered';
  } else if (/\b(?:hold|defend|stand)\b/i.test(norm)) {
    orderType = 'hold';
    targetFormation = 'line';
  } else if (/\b(?:entrench|dig\s*in)\b/i.test(norm)) {
    orderType = 'entrench';
    targetFormation = 'line';
  } else if (/\b(?:retreat|fall\s*back|withdraw)\b/i.test(norm)) {
    orderType = 'retreat';
  } else if (/\b(?:march|advance)\b/i.test(norm)) {
    orderType = 'march';
  }

  const explicitCoords = extractCoordinates(clause, context.trps);
  let destination = explicitCoords ? { ...explicitCoords } : { ...defaultDestination };

  if (!explicitCoords) {
    for (const lm of context.landmarks) {
      const cleanLm = stripDiacritics(lm.name.toLowerCase().replace(/[^a-z0-9]/g, ' '));
      const tokens = cleanLm.split(' ').filter((t) => t.length >= 3);
      for (const t of tokens) {
        if (new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(norm)) {
          destination = { ...lm.position };
          break;
        }
      }
    }
  }

  return { orderType, destination, targetFormation };
}

export class LLMDispatchService {
  private endpoint: string;
  private model: string;
  private isOllamaOnline: boolean | null = null;
  private availableModels: string[] = [];
  private lastCheckTime = 0;
  private listeners: StatusListener[] = [];
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(endpoint = DEFAULT_OLLAMA_ENDPOINT, model = DEFAULT_MODEL) {
    this.endpoint = endpoint;
    this.model = model;
  }

  public getStatus(): OllamaConnectionStatus {
    return {
      online: this.isOllamaOnline,
      model: this.model,
      endpoint: this.endpoint,
      availableModels: this.availableModels,
    };
  }

  public subscribe(listener: StatusListener): () => void {
    this.listeners.push(listener);
    listener(this.getStatus());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[LLMDispatchService] Listener error:', err);
      }
    }
  }

  public startAutoPolling(intervalMs = 4000) {
    if (this.pollingTimer !== null) return;
    this.checkConnection(true);
    this.pollingTimer = setInterval(() => {
      this.checkConnection(true);
    }, intervalMs);
  }

  public stopAutoPolling() {
    if (this.pollingTimer !== null) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  public setEndpoint(endpoint: string) {
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.isOllamaOnline = null;
    this.checkConnection(true);
  }

  public setModel(model: string) {
    this.model = model;
    this.notify();
  }

  public getEndpoint() {
    return this.endpoint;
  }

  public getModel() {
    return this.model;
  }

  /**
   * Probes localhost:11434/api/tags to detect if a local Ollama daemon is active
   */
  public async checkConnection(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && this.isOllamaOnline !== null && now - this.lastCheckTime < 4000) {
      return !!this.isOllamaOnline;
    }

    this.lastCheckTime = now;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    try {
      const res = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const models = Array.isArray(data?.models)
          ? data.models.map((m: { name: string }) => m.name)
          : [];
        this.availableModels = models;
        const wasOnline = this.isOllamaOnline;
        this.isOllamaOnline = true;
        if (wasOnline !== true) {
          console.log(`[DispatchService] Session active at ${this.endpoint}. Models:`, models);
          this.notify();
        }
        return true;
      } else {
        const wasOnline = this.isOllamaOnline;
        this.isOllamaOnline = false;
        if (wasOnline !== false) this.notify();
        return false;
      }
    } catch {
      clearTimeout(timeoutId);
      const wasOnline = this.isOllamaOnline;
      this.isOllamaOnline = false;
      if (wasOnline !== false) this.notify();
      return false;
    }
  }

  /**
   * Main dispatch entry point with tactical awareness of places, landmarks, friendly units and enemy contacts
   */
  public async processDispatch(
    rawText: string,
    context: TacticalDispatchContext
  ): Promise<ParsedDispatchResult> {
    const isOnline = await this.checkConnection();

    if (isOnline) {
      try {
        const ollamaResult = await this.queryOllama(rawText, context);
        if (ollamaResult) {
          return ollamaResult;
        }
      } catch (err) {
        console.warn('[Dispatch] Local engine query failed, engaging tactical staff parser:', err);
      }
    }

    // High-fidelity rule-based tactical fallback
    return this.parseWithRuleEngine(rawText, context);
  }

  /**
   * Query local AI /api/chat with a calibrated military staff officer system prompt
   */
  private async queryOllama(
    rawText: string,
    context: TacticalDispatchContext
  ): Promise<ParsedDispatchResult | null> {
    const unitsBrief = context.playerUnits.map((u) => {
      let sector = 'Central Heights';
      if (u.position.y < 450) sector = 'Northern Flank';
      else if (u.position.y >= 850) sector = 'Southern Flank';
      else if (u.position.x < 1100) sector = 'Western Valley / HQ';

      return {
        id: u.id,
        commander: u.commander,
        unitName: u.name,
        type: u.type,
        formation: u.formation,
        strength: u.strength,
        position: { x: Math.round(u.position.x), y: Math.round(u.position.y) },
        sector,
        status: u.status,
      };
    });

    const landmarksBrief = context.landmarks.map((l) => ({
      name: l.name,
      type: l.type || 'landmark',
      elevation: l.elevation ? `${l.elevation}m` : undefined,
      sector: l.sector || (l.position.y < 450 ? 'North' : l.position.y >= 850 ? 'South' : 'Center'),
      position: { x: Math.round(l.position.x), y: Math.round(l.position.y) },
    }));

    // Realistic reconnaissance reports: troop types, approximate positions, and estimated strengths
    const enemyContactsBrief = context.enemyUnits
      .filter((u) => u.status !== 'shattered' && u.strength > 0)
      .map((u) => {
        let sector = 'Central Heights (Pratzen)';
        if (u.position.y < 450) sector = 'Northern Flank (near Santon / Road)';
        else if (u.position.y >= 850) sector = 'Southern Flank (near Sokolnitz / Telnitz)';
        else if (u.position.x > 1400) sector = 'Central Plateau (Pratzen / Staré Vinohrady)';

        const approxStrength = Math.round(u.strength / 250) * 250;
        const typeStr = u.type === 'artillery' ? 'Artillery Battery' : u.type === 'cavalry' ? 'Cavalry' : 'Infantry';
        const contactDesc = `Hostile ${typeStr} (~${approxStrength} men)`;

        return {
          contactId: u.id,
          report: contactDesc,
          type: u.type,
          formation: u.formation,
          position: { x: Math.round(u.position.x), y: Math.round(u.position.y) },
          sector,
          status: u.status,
        };
      });

    const systemPrompt = `You are the Imperial Chief of Staff coordinating tactical maneuvers on the Austerlitz 1805 battlefield (Map dimensions: 2400x1500).
Your duty is to translate operational dispatches from the commanding general into structured tactical orders for your field commanders.
Be honest, realistic, concise, and professional.
THINKING MODE: OFF. Do NOT output <think> tags, reasoning thoughts, explanations, or markdown fences. Output strictly raw JSON.

1. CURRENT FRIENDLY UNITS & COMMANDERS:
${JSON.stringify(unitsBrief)}

2. KEY GEOGRAPHICAL LANDMARKS & SECTORS:
${JSON.stringify(landmarksBrief)}

3. SCOUT RECONNAISSANCE - ENEMY POSITIONS & CONTACTS:
(Note: Real reconnaissance provides troop types, approximate positions, and estimated strengths rather than formal enemy regiment names)
${JSON.stringify(enemyContactsBrief)}

OPERATIONAL RULES:
1. The addressee at the beginning of the dispatch (e.g. "@Oudinot ...", "@d'Aboville ...", "@V Corps ...", "Davout, ...") is ALWAYS the recipient. Prepositional mentions later in the message (e.g. "to relieve the V Corps", "support Murat") indicate objectives or allies, NOT the recipient.
2. Determine orderType: 'assault' (advance/attack), 'charge' (bayonet charge/sabre charge), 'hold' (defend position), 'bombard' (artillery Call-For-Fire/bombardment), 'entrench' (dig in), 'retreat' (withdraw), 'march' (reposition).
3. If user mentions "bombard", "fire", "barrage", "shell", "strike", "battery", or if an artillery battery is ordered to engage/attack, set orderType to "bombard" and targetFormation to "unlimbered".
4. If user mentions "bayonets", "charge", "melee", or "storm", use orderType: "charge" and targetFormation: "column".
5. Determine target coordinates {x, y}:
   - If explicit coordinates are specified (e.g. "(1420, 680)", "1420, 680", "coords 1500 700"): targetCoords MUST be { "x": 1420, "y": 680 }.
   - If holding/defending/entrenching at a landmark (e.g. "hold Santon Hill"), targetCoords MUST be that landmark's coordinates, ignoring descriptions of enemy movements (e.g. "enemies converging due East").
   - If targeting an enemy (e.g. "attack the enemy on Pratzen", "intercept hostile forces in Sokolnitz", "charge the enemy cavalry in the north"): identify the corresponding enemy contact from the recon list and use its position {x, y}.
   - If a landmark is named with towards/to (e.g. "march towards Bosenitz", "advance to Pratzen"): use that landmark's coordinates.
   - If another friendly general/unit is named to reinforce/support (e.g. "reinforce Murat", "support Davout"): use that friendly commander's current coordinates.
   - NEVER set targetCoords to the recipient unit's own current position.
   - If no destination is named: advance 160 units along current heading.
6. Create a concise, realistic military acknowledgment: "[ACK] <CommanderName>: Understood. <Action brief>."
7. Respond with ONLY valid JSON with keys:
{
  "recipientUnitId": string,
  "orderType": string,
  "targetCoords": { "x": number, "y": number },
  "targetFormation": "column" | "line" | "square" | "unlimbered" | null,
  "ackMessage": string,
  "delayMinutes": number
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText },
        ],
        stream: false,
        format: 'json',
        think: false, // Disables thinking tokens in models
        options: {
          temperature: 0.1,
          num_predict: 256,
        },
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    let content = data?.message?.content;
    if (!content) return null;

    // Strip any thinking tags if the model outputs them despite instructions
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Extract JSON object bounds
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(content);
    let unit = context.playerUnits.find((u) => u.id === parsed.recipientUnitId) || context.playerUnits[0];

    // Check if user requested artillery bombardment: ensure an artillery unit is selected if possible
    const isBombardmentIntent =
      rawText.toLowerCase().includes('bombard') ||
      rawText.toLowerCase().includes('barrage') ||
      rawText.toLowerCase().includes('shell') ||
      rawText.toLowerCase().includes('battery') ||
      rawText.toLowerCase().includes('cannon') ||
      unit.type === 'artillery';

    if (isBombardmentIntent && unit.type !== 'artillery') {
      const arty = context.playerUnits.find((u) => u.type === 'artillery' && u.status !== 'shattered');
      if (arty) unit = arty;
    }

    // Safeguard: exact user coordinate extraction takes precedence over any LLM rounding
    const explicitUserCoords = extractCoordinates(rawText, context.trps);
    const destination = explicitUserCoords || parsed.targetCoords || { ...unit.position };

    // Arc pathfinding if user requested curved sweep / wheeling
    const arcAnalysis = extractArcOptions(rawText, unit.position, destination, context.landmarks);
    let waypoints: Vector2D[] = [];
    let curveControl: Vector2D | undefined = undefined;
    let isArcManeuver = false;
    let arcDescription = '';

    if (arcAnalysis.hasArc) {
      const arcResult = generateArcPath(unit.position, destination, arcAnalysis.options);
      if (arcResult.isArc) {
        waypoints = arcResult.waypoints;
        curveControl = arcResult.curveControl;
        isArcManeuver = true;
        arcDescription = arcResult.arcDescription || 'curved arc maneuver';
      }
    }

    const orderType = (isBombardmentIntent && (parsed.orderType === 'assault' || parsed.orderType === 'march' || !parsed.orderType))
      ? 'bombard'
      : (['assault', 'charge', 'hold', 'bombard', 'entrench', 'retreat', 'march'].includes(parsed.orderType)
        ? parsed.orderType
        : 'assault') as ManeuverOrder['type'];

    const targetFormation = orderType === 'bombard'
      ? 'unlimbered'
      : orderType === 'charge'
      ? 'column'
      : parsed.targetFormation;

    // Compute delay based on distance from HQ
    const hq = context.playerUnits.find((u) => u.type === 'headquarters') || context.playerUnits[0];
    const distToUnit = Math.hypot(unit.position.x - hq.position.x, unit.position.y - hq.position.y);
    const delayMinutes = Math.max(1.5, Math.round(distToUnit / 380));

    const isForcedMarch = /\b(?:force|forced)\s+march\b|\bat\s+the\s+double\b|\bdouble\s+time\b|\bhaste\b|\bpas\s+de\s+charge\b/i.test(rawText);

    // Apply temporal and condition parsing as reliable guarantees
    const temporal = parseTemporalConstraints(rawText, context.currentTimeMinutes, delayMinutes);
    const conditionInfo = parseConditionAndChaining(rawText, context.landmarks);

    let chainedOrder: Omit<ManeuverOrder, 'id' | 'status'> | undefined = undefined;
    if (conditionInfo.chainedClause) {
      const chainedData = parseChainedDirective(conditionInfo.chainedClause, context, destination);
      chainedOrder = {
        unitId: unit.id,
        type: chainedData.orderType,
        destination: chainedData.destination,
        waypoints: [],
        targetFormation: chainedData.targetFormation,
        plannedTime: temporal.endTime ?? temporal.startTime ?? context.currentTimeMinutes,
      };
    }

    let ackMessage = parsed.ackMessage || `[ACK] ${unit.commander}: Received orders. Executing.`;
    if (temporal.timingDescription && !ackMessage.includes(temporal.timingDescription)) {
      ackMessage += ` [TIMING: ${temporal.timingDescription}]`;
    }
    if (conditionInfo.conditionDescription && !ackMessage.includes('CONTINGENCY')) {
      ackMessage += ` [CONTINGENCY: ${conditionInfo.conditionDescription}]`;
    }
    if (chainedOrder && !ackMessage.includes('FOLLOW-UP')) {
      ackMessage += ` [FOLLOW-UP: ${chainedOrder.type.toUpperCase()}]`;
    }

    return {
      recipientUnitId: unit.id,
      recipientName: unit.commander || unit.name,
      orderType,
      destination,
      waypoints: waypoints.length > 0 ? waypoints : undefined,
      curveControl,
      targetFormation,
      acknowledgment: ackMessage,
      delayMinutes,
      modelUsed: `Staff Dispatch (AI Engine)`,
      confidence: 'llm',
      isArcManeuver,
      arcDescription: isArcManeuver ? arcDescription : undefined,
      isForcedMarch,
      startTime: temporal.startTime,
      endTime: temporal.endTime,
      durationMinutes: temporal.durationMinutes,
      condition: conditionInfo.condition,
      chainedOrder,
      conditionDescription: conditionInfo.conditionDescription,
      timingDescription: temporal.timingDescription,
    };
  }

  /**
   * Fast, reliable rule-based military NLP parser with deep positional and recon awareness
   */
  private parseWithRuleEngine(
    rawText: string,
    context: TacticalDispatchContext
  ): ParsedDispatchResult {
    const normText = rawText.replace(/[’‘`]/g, "'").trim();
    const textLower = normText.toLowerCase();

    // Check if user specifically ordered artillery bombardment or battery fire
    const isBombardmentKeyword =
      /\b(bombard|bombardment|fire|battery|artillery|barrage|cannon|shell|salvo|strike|call\s+for\s+fire|cff|fire\s+mission)\b/i.test(normText);

    // 1. Identify Target Corps or Individual Unit / Commander
    let isCorpsOrder = false;
    let matchedCorps: string | null = null;
    let matchedUnit: Unit | null = null;
    let targetUnitIds: string[] | undefined = undefined;

    // Extract leading addressee (e.g. @Oudinot, @d'Aboville, @V Corps, @Guard Horse Battery, Marshal Davout, General Oudinot, Oudinot,)
    const leadAtWithDelim = /^@([^,\n;:]+?)(?:,\s*|:\s*|\s+(?:advance|march|attack|assault|bombard|fire|hold|form|deploy|retire|withdraw|halt|fall|engage|support|screen|charge|move|dig|wheel|limber|unlimber|prepare|take|secure|converge|link|remain|stand|counter|double|refuse|shift|smoke|defend|pivot|suppress|volley|call\s+for\s+fire|cff|covering)\b)/i.exec(normText);
    const leadAtFallback = /^@([a-zA-Z0-9_'\-]+(?:\s+[a-zA-Z0-9_'\-]+)*)/i.exec(normText);
    const leadAt = leadAtWithDelim || leadAtFallback;

    const rankMatch = /^(?:marshal|general|colonel|major|prince|emperor|tsar)\s+([a-zA-Z0-9_'\-]+(?:\s+(?:corps|division|battery|column|reserve|guard))?)/i.exec(normText);
    const leadPlain = /^([a-zA-Z0-9_'\-]+(?:\s+(?:corps|division|battery|column|reserve|guard))?)[\s,:]+/i.exec(normText);

    const rawLead = leadAt ? leadAt[1] : (rankMatch ? rankMatch[1] : (leadPlain ? leadPlain[1] : null));
    const leadToken = rawLead ? rawLead.replace(/^(?:marshal|general|colonel|major|prince)\s+/i, '').toLowerCase().trim() : null;

    const availableCorps = Array.from(new Set(context.playerUnits.map((u) => u.corps)));

    // Strict regex check for French Army Corps avoiding Roman numeral collision (e.g. V Corps vs IV Corps)
    const matchCorpsName = (str: string): string | null => {
      const s = stripDiacritics(str.toLowerCase());
      if (/\b(?<!i)v\s+corps\b|\b5th\s+corps\b/.test(s)) return 'V Corps (Lannes)';
      if (/\biv\s+corps\b|\b4th\s+corps\b/.test(s)) return 'IV Corps (Soult)';
      if (/\biii\s+corps\b|\b3rd\s+corps\b/.test(s)) return 'III Corps (Davout)';
      if (/\b(?<![iv])i\s+corps\b|\b1st\s+corps\b/.test(s)) return 'I Corps (Bernadotte)';
      if (/\bcavalry\s+(?:reserve|corps)?\b/.test(s)) return 'Cavalry Reserve (Murat)';
      if (/\bimperial\s+guard\b/.test(s)) return 'Imperial Guard Reserve';
      if (/\bgrenadier\s+reserve\b/.test(s)) return 'Grenadier Reserve (Oudinot)';
      for (const c of availableCorps) {
        const cClean = stripDiacritics(c.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim());
        if (s === cClean || s === stripDiacritics(c.toLowerCase())) return c;
      }
      return null;
    };

    // Priority 1a: Check if leading addressee is an Army Corps
    if (leadToken) {
      const corpsMatch = matchCorpsName(leadToken);
      if (corpsMatch) {
        isCorpsOrder = true;
        matchedCorps = corpsMatch;
      }
    }

    // Priority 1b: Check if leading addressee is an individual Commander or Regiment (with diacritic stripping)
    const normLead = leadToken ? stripDiacritics(leadToken) : null;
    if (!isCorpsOrder && normLead) {
      // Step 1: Exact commander surname or exact full commander name
      for (const u of context.playerUnits) {
        const cleanCmd = stripDiacritics(u.commander.replace(/[’‘`]/g, "'").toLowerCase());
        const surname = stripDiacritics((u.commander.split(' ').pop() || u.commander).replace(/[’‘`]/g, "'").toLowerCase());
        if (normLead === surname || cleanCmd === normLead) {
          matchedUnit = u;
          break;
        }
      }
      // Step 2: Exact clean unit name or full unit name (e.g. "guard horse battery")
      if (!matchedUnit) {
        for (const u of context.playerUnits) {
          const cleanName = stripDiacritics(u.name.replace(/\s*\([^)]*\)/g, '').replace(/[’‘`]/g, "'").toLowerCase().trim());
          const fullName = stripDiacritics(u.name.replace(/[’‘`]/g, "'").toLowerCase().trim());
          if (cleanName === normLead || fullName === normLead) {
            matchedUnit = u;
            break;
          }
        }
      }
      // Step 3: Word-subset match on unit name (e.g. "guard battery" in "guard horse battery")
      if (!matchedUnit) {
        const leadWords = normLead.split(/\s+/).filter((w) => w.length > 2);
        if (leadWords.length > 1) {
          for (const u of context.playerUnits) {
            const fullName = stripDiacritics(u.name.replace(/[’‘`]/g, "'").toLowerCase().trim());
            const nameWords = fullName.split(/[^a-z0-9]+/);
            if (leadWords.every((w) => nameWords.includes(w))) {
              matchedUnit = u;
              break;
            }
          }
        }
      }
      // Step 4: Substring match on commander
      if (!matchedUnit) {
        for (const u of context.playerUnits) {
          const cleanCmd = stripDiacritics(u.commander.replace(/[’‘`]/g, "'").toLowerCase());
          if (cleanCmd.includes(normLead)) {
            matchedUnit = u;
            break;
          }
        }
      }
      // Step 5: Substring match on unit name
      if (!matchedUnit) {
        for (const u of context.playerUnits) {
          const cleanName = stripDiacritics(u.name.replace(/\s*\([^)]*\)/g, '').replace(/[’‘`]/g, "'").toLowerCase().trim());
          const fullName = stripDiacritics(u.name.replace(/[’‘`]/g, "'").toLowerCase().trim());
          if (cleanName.includes(normLead) || normLead.includes(cleanName) || fullName.includes(normLead)) {
            matchedUnit = u;
            break;
          }
        }
      }
    }

    // Priority 1c: If no leading addressee matched, search text for explicit corps or commander surname
    if (!isCorpsOrder && !matchedUnit) {
      const cFound = matchCorpsName(textLower);
      if (cFound) {
        isCorpsOrder = true;
        matchedCorps = cFound;
      }
    }

    if (!isCorpsOrder && !matchedUnit) {
      const strippedNorm = stripDiacritics(normText);
      for (const u of context.playerUnits) {
        const surname = stripDiacritics((u.commander.split(' ').pop() || u.commander).replace(/[’‘`]/g, "'").toLowerCase());
        const surnameRegex = new RegExp(`\\b${surname}\\b`, 'i');
        if (surnameRegex.test(strippedNorm)) {
          matchedUnit = u;
          break;
        }
      }
    }

    // Fallback for bombardment commands without named unit: assign to active artillery
    if (!matchedUnit && !isCorpsOrder && isBombardmentKeyword) {
      matchedUnit = context.playerUnits.find((u) => u.type === 'artillery' && u.status !== 'shattered') || null;
    }

    // If Corps order confirmed, populate regiments and find headquarters
    if (isCorpsOrder && matchedCorps) {
      const corpsUnits = context.playerUnits.filter(
        (u) => u.corps.toLowerCase() === matchedCorps!.toLowerCase() && u.status !== 'shattered'
      );
      if (corpsUnits.length > 0) {
        targetUnitIds = corpsUnits.map((u) => u.id);
        matchedUnit = corpsUnits.find((u) => u.type === 'headquarters') || corpsUnits[0];
      }
    }

    if (!matchedUnit) {
      matchedUnit = context.playerUnits.find((u) => u.type === 'infantry' && u.status !== 'shattered') || context.playerUnits[0];
    }

    // 2. Identify Target Location / Destination
    // PRIORITY 1: Check for explicit grid coordinates (e.g. (1420, 680), 1420, 680)
    const explicitCoords = extractCoordinates(normText, context.trps);
    let destination: Vector2D = explicitCoords ? { ...explicitCoords } : { ...matchedUnit.position };
    let destinationName = '';

    if (explicitCoords) {
      // Find if there is a nearby landmark to enrich acknowledgment
      let nearestLm: TacticalLandmarkContext | null = null;
      let minLmDist = 140;
      for (const lm of context.landmarks) {
        const d = Math.hypot(lm.position.x - explicitCoords.x, lm.position.y - explicitCoords.y);
        if (d < minLmDist) {
          minLmDist = d;
          nearestLm = lm;
        }
      }
      destinationName = nearestLm
        ? `grid (${explicitCoords.x}, ${explicitCoords.y}) near ${nearestLm.name.replace(/\s*\([^)]*\)/g, '').trim()}`
        : `grid coordinates (${explicitCoords.x}, ${explicitCoords.y})`;
    }

    // If no explicit coordinates, check enemy attack phrasing, landmarks, and friendly units
    if (!explicitCoords) {
      // Check landmarks with whole-token matching, prioritizing destination landmarks and filtering origin landmarks
      let matchedLandmark: TacticalLandmarkContext | null = null;
      const destMatches: { lm: TacticalLandmarkContext; isDestPreposition: boolean }[] = [];

      for (const lm of context.landmarks) {
        const cleanLm = stripDiacritics(lm.name.toLowerCase().replace(/[^a-z0-9]/g, ' '));
        const tokens = cleanLm.split(' ').filter((t) => t.length >= 3);
        for (const t of tokens) {
          const regex = new RegExp(`\\b${t}\\b`, 'gi');
          let match: RegExpExecArray | null;
          while ((match = regex.exec(normText)) !== null) {
            const matchIdx = match.index;
            const textBefore = normText.slice(Math.max(0, matchIdx - 35), matchIdx);

            const isDestPrep = /\b(?:to|towards?|at|reach|storm|take|occupy|near|on)\s+@?[a-z0-9]*\s*$/i.test(textBefore);
            const isOrigin = !isDestPrep && /\b(?:from|leaving|departing|out\s+of|starting\s+(?:from|at))\s+@?[a-z0-9]*\s*$/i.test(textBefore);

            if (!isOrigin) {
              destMatches.push({ lm, isDestPreposition: isDestPrep });
            }
          }
        }
      }

      const prepMatches = destMatches.filter((m) => m.isDestPreposition);
      if (prepMatches.length > 0) {
        matchedLandmark = prepMatches[prepMatches.length - 1].lm;
      } else if (destMatches.length > 0) {
        matchedLandmark = destMatches[0].lm;
      } else {
        // Fallback to checking any landmark token
        for (const lm of context.landmarks) {
          const cleanLm = stripDiacritics(lm.name.toLowerCase().replace(/[^a-z0-9]/g, ' '));
          const tokens = cleanLm.split(' ').filter((t) => t.length >= 3);
          for (const t of tokens) {
            if (new RegExp(`\\b${t}\\b`, 'i').test(normText)) {
              matchedLandmark = lm;
              break;
            }
          }
          if (matchedLandmark) break;
        }
      }

      const isHoldOrder = /\b(hold|defend|entrench|stand|dig\s*in)\b/i.test(textLower);

      // If holding/defending at a landmark, destination IS the landmark itself!
      if (isHoldOrder && matchedLandmark) {
        destination = { ...matchedLandmark.position };
        destinationName = matchedLandmark.name.replace(/\s*\([^)]*\)/g, '').trim();
      } else {
        // Check if user specifically ordered an attack or engagement against enemy forces
        const attacksEnemy =
          textLower.includes('enemy') ||
          textLower.includes('hostile') ||
          textLower.includes('attack') ||
          textLower.includes('intercept') ||
          textLower.includes('engage') ||
          textLower.includes('charge') ||
          textLower.includes('storm') ||
          textLower.includes('destroy');

        if (attacksEnemy) {
          if (matchedLandmark) {
            let closestEnemyAtLandmark: Unit | null = null;
            let minDist = 450;
            for (const enemy of context.enemyUnits) {
              if (enemy.status !== 'shattered' && enemy.strength > 0) {
                const d = Math.hypot(enemy.position.x - matchedLandmark.position.x, enemy.position.y - matchedLandmark.position.y);
                if (d < minDist) {
                  minDist = d;
                  closestEnemyAtLandmark = enemy;
                }
              }
            }
            if (closestEnemyAtLandmark) {
              destination = { ...closestEnemyAtLandmark.position };
              destinationName = `hostile forces near ${matchedLandmark.name.replace(/\s*\([^)]*\)/g, '').trim()}`;
            } else {
              destination = { ...matchedLandmark.position };
              destinationName = matchedLandmark.name.replace(/\s*\([^)]*\)/g, '').trim();
            }
          } else {
            let targetType: Unit['type'] | null = null;
            if (textLower.includes('cavalry') || textLower.includes('horse')) targetType = 'cavalry';
            else if (textLower.includes('artillery') || textLower.includes('battery') || textLower.includes('guns')) targetType = 'artillery';
            else if (textLower.includes('infantry')) targetType = 'infantry';

            let targetEnemy: Unit | null = null;
            let minDist = 3000;
            for (const enemy of context.enemyUnits) {
              if (enemy.status !== 'shattered' && enemy.strength > 0) {
                if (targetType && enemy.type !== targetType) continue;
                const d = Math.hypot(enemy.position.x - matchedUnit.position.x, enemy.position.y - matchedUnit.position.y);
                if (d < minDist) {
                  minDist = d;
                  targetEnemy = enemy;
                }
              }
            }

            if (targetEnemy) {
              destination = { ...targetEnemy.position };
              destinationName = targetType
                ? `hostile ${targetType} formation`
                : `closest hostile contact`;
            }
          }
        }

        // If landmark was explicitly targeted with towards / to / at / reach
        if (!destinationName && matchedLandmark) {
          const towardsMatch = /(?:towards?|to|at|reach|storm|take)\s+@?([a-zA-Z0-9_\s]+)/i.exec(normText);
          const compassIntent = parseCompassDirection(normText);
          const isEnemyCompass = /enem(?:y|ies)|hostile|contact/i.test(normText) && /converging|advancing|coming/i.test(normText);

          if (compassIntent && !isEnemyCompass && towardsMatch) {
            const dist = compassIntent.distancePx || 120;
            destination = {
              x: Math.max(50, Math.min(2350, matchedLandmark.position.x + compassIntent.vector.x * dist)),
              y: Math.max(50, Math.min(1450, matchedLandmark.position.y + compassIntent.vector.y * dist)),
            };
            destinationName = `${Math.round(dist * 5)}m ${getCardinalDirection(compassIntent.bearing).label} of ${matchedLandmark.name.replace(/\s*\([^)]*\)/g, '').trim()} (Bearing ${String(compassIntent.bearing).padStart(3, '0')}°)`;
          } else {
            destination = { ...matchedLandmark.position };
            destinationName = matchedLandmark.name.replace(/\s*\([^)]*\)/g, '').trim();
          }
        }

        // Check if another friendly unit was mentioned specifically to reinforce/support (never self)
        if (!destinationName) {
          const reinforceMatch = /(?:reinforce|support|relieve|join)\s+@?([a-zA-Z0-9_'\-]+)/i.exec(normText);
          if (reinforceMatch) {
            const targetToken = reinforceMatch[1].toLowerCase();
            for (const other of context.playerUnits) {
              if (other.id !== matchedUnit.id) {
                const otherCmd = other.commander.replace(/[’‘`]/g, "'").toLowerCase();
                const otherSurname = (other.commander.split(' ').pop() || other.commander).replace(/[’‘`]/g, "'").toLowerCase();
                if (targetToken === otherSurname || otherCmd.includes(targetToken)) {
                  destination = { ...other.position };
                  destinationName = other.commander.replace(/[’‘`]/g, "'");
                  break;
                }
              }
            }
          }
        }

        // Compass Direction without landmark (e.g. "advance North 400m", "march due East")
        if (!destinationName) {
          const compassIntent = parseCompassDirection(normText);
          const isEnemyCompass = /enem(?:y|ies)|hostile|contact/i.test(normText) && /converging|advancing|coming/i.test(normText);
          if (compassIntent && !isEnemyCompass) {
            const dist = compassIntent.distancePx || 220;
            destination = {
              x: Math.max(50, Math.min(2350, matchedUnit.position.x + compassIntent.vector.x * dist)),
              y: Math.max(50, Math.min(1450, matchedUnit.position.y + compassIntent.vector.y * dist)),
            };
            destinationName = `${Math.round(dist * 5)}m towards the ${getCardinalDirection(compassIntent.bearing).label} (Bearing ${String(compassIntent.bearing).padStart(3, '0')}°)`;
          }
        }

        // Default: advance forward along heading
        if (!destinationName) {
          destination = {
            x: Math.max(50, Math.min(2350, matchedUnit.position.x + Math.cos(matchedUnit.heading) * 160)),
            y: Math.max(50, Math.min(1450, matchedUnit.position.y + Math.sin(matchedUnit.heading) * 160)),
          };
          destinationName = 'designated sector';
        }
      }
    }

    // 2e. Explicit Facing Command (e.g. "face East", "forming line facing South")
    let finalHeading: number | undefined = undefined;
    const facingMatch = /(?:face|facing|orient(?:ed)?|look(?:ing)?)\s+(north|south|east|west|ne|nw|se|sw|due\s+east|due\s+north|due\s+south|due\s+west)/i.exec(normText);
    if (facingMatch) {
      const faceCompass = parseCompassDirection(facingMatch[1]);
      if (faceCompass) {
        finalHeading = bearingToHeading(faceCompass.bearing);
      }
    }

    // 2f. Precision Curved Arc Pathfinding:
    // If the commander specified an arc, curved sweep, or wheeling maneuver, generate accurate waypoints.
    // Otherwise, defaults to straight direct line for speed.
    const arcAnalysis = extractArcOptions(rawText, matchedUnit.position, destination, context.landmarks);
    let waypoints: Vector2D[] = [];
    let curveControl: Vector2D | undefined = undefined;
    let isArcManeuver = false;
    let arcDescription = '';

    if (arcAnalysis.hasArc) {
      const arcResult = generateArcPath(matchedUnit.position, destination, arcAnalysis.options);
      if (arcResult.isArc) {
        waypoints = arcResult.waypoints;
        curveControl = arcResult.curveControl;
        isArcManeuver = true;
        arcDescription = arcResult.arcDescription || 'curved arc maneuver';
        if (finalHeading === undefined && arcResult.finalHeading !== undefined) {
          finalHeading = arcResult.finalHeading;
        }
      }
    }

    // Compute route bearing and cardinal direction
    const routeDx = destination.x - matchedUnit.position.x;
    const routeDy = destination.y - matchedUnit.position.y;
    const routeHeading = Math.atan2(routeDy, routeDx);
    const bearingDeg = headingToBearing(routeHeading);
    const cardinalInfo = getCardinalDirection(bearingDeg);

    // Extract tactical condition and chained directive (e.g. "if attacked form square", "then assault Pratzen")
    const conditionInfo = parseConditionAndChaining(normText, context.landmarks);

    // If there is a chained follow-up clause ("... then assault Pratzen"), strip it from primary evaluation
    const chainedSplit = /\b(?:then|afterwards|subsequently|followed\s+by)\b/i.exec(textLower);
    const primaryTextLower = chainedSplit ? textLower.slice(0, chainedSplit.index) : textLower;

    // 3. Determine Order Type & Formation
    let explicitFormation: Formation | undefined = undefined;
    if (/\b(?:in|into|as|form(?:ing)?)\s+square\b|\bsquare\s+formation\b/i.test(normText)) {
      explicitFormation = 'square';
    } else if (/\b(?:in|into|as|form(?:ing)?)\s+line\b|\bline\s+formation\b/i.test(normText)) {
      explicitFormation = 'line';
    } else if (/\b(?:in|into|as|form(?:ing)?)\s+column\b|\bcolumn\s+formation\b/i.test(normText)) {
      explicitFormation = 'column';
    } else if (/\bunlimber(?:ed)?\b/i.test(normText)) {
      explicitFormation = 'unlimbered';
    }

    let orderType: ManeuverOrder['type'] = 'march';
    let formation: Formation | undefined = explicitFormation;
    let actionDesc = '';

    let supportingBatteryId: string | undefined = undefined;
    let observerUnitId: string | undefined = undefined;
    let holdFireThreshold: number | undefined = undefined;
    let suppressionTargetId: string | undefined = undefined;

    const isSmoke = /\b(smoke|smoke\s*screen|obscurant|screen)\b/i.test(rawText);
    const isVolleyFire = /\b(?:volley|fire\s+by\s+ranks|whites\s+of\s+their\s+eyes|hold\s+fire(?:\s+for\s+volley)?|mass\s+volley)\b/i.test(normText);
    const isSuppressiveFire = /\b(?:suppress|suppressive|covering\s+fire|base\s+of\s+fire|pin\s+down|pinning\s+fire)\b/i.test(normText);
    const isCounterBattery = /\b(?:counter[- ]?battery|contre[- ]?batterie|silence\s+(?:enemy\s+)?guns|knock\s*out\s+(?:enemy\s+)?battery)\b/i.test(normText);
    const isGrandBattery = /\b(?:grand\s+battery|grande\s+batterie|mass(?:ed)?\s+artillery|mass(?:ed)?\s+batter(?:y|ies)|tot\s+barrage|time\s+on\s+target|converge\s+artillery)\b/i.test(normText);
    const isSkirmishScreen = /\b(?:skirmish\s+screen|tirailleurs?|peltasts?|recon\s+pickets?|deploy\s+screen|screen\s+flank|screen\s+front)\b/i.test(normText);
    const trpMatch = /\b(?:trp|target\s*ref(?:erence)?\s*(?:point)?)\s*[-_#]?\s*(0?[1-9])\b/i.exec(rawText);
    const isTrpFire = !!trpMatch;
    const trpCode = trpMatch ? `TRP 0${parseInt(trpMatch[1], 10)}` : undefined;

    if (isSkirmishScreen) {
      orderType = 'hold';
      formation = explicitFormation || 'line';
      actionDesc = `Deploying forward skirmish screen line (35% incoming fire absorption & shock charge disruption)`;
    } else if (isCounterBattery) {
      orderType = 'bombard';
      formation = explicitFormation || 'unlimbered';
      actionDesc = `Executing counter-battery mission on ${destinationName} targeting enemy guns and caissons`;
    } else if (isGrandBattery) {
      orderType = 'bombard';
      formation = explicitFormation || 'unlimbered';
      actionDesc = `Executing Grand Battery Time-On-Target (TOT) massed barrage on ${destinationName}`;
    } else if (isVolleyFire) {
      orderType = 'volley';
      formation = explicitFormation || 'line';
      const rangeMatch = /(?:until|at|within)\s+(\d{2,3})\s*(?:m|meters|paces|yards)/i.exec(normText);
      holdFireThreshold = rangeMatch ? Math.round(parseInt(rangeMatch[1], 10) / 5) : 65;
      actionDesc = `Deploying in line and holding fire for mass battalion volley within ${Math.round(holdFireThreshold * 5)}m (the whites of their eyes)`;
    } else if (isSuppressiveFire) {
      orderType = 'suppress';
      formation = explicitFormation || 'line';
      actionDesc = `Laying continuous suppressive covering fire on ${destinationName} to pin hostile positions`;
    } else if (isSmoke) {
      orderType = 'bombard';
      formation = explicitFormation || 'unlimbered';
      actionDesc = `Laying tactical artillery smoke screen on ${destinationName} to obscure line of sight`;
    } else if (isBombardmentKeyword || matchedUnit.type === 'artillery') {
      orderType = 'bombard';
      if (matchedUnit.type !== 'artillery') {
        observerUnitId = matchedUnit.id;
        const batteryMatch = /(?:using|from|with|requesting|via)\s+([a-zA-Z0-9_\s'\-]+?(?:battery|guns|artillery))/i.exec(normText);
        if (batteryMatch) {
          const batteryToken = stripDiacritics(batteryMatch[1].toLowerCase());
          const tokenWords = batteryToken.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
          for (const u of context.playerUnits) {
            if (u.type === 'artillery') {
              const uName = stripDiacritics(u.name.toLowerCase());
              const uCmd = stripDiacritics(u.commander.toLowerCase());
              const uCorps = stripDiacritics(u.corps.toLowerCase());
              const fullSearchable = `${uName} ${uCmd} ${uCorps}`;
              const allWordsMatch = tokenWords.length > 0 && tokenWords.every((w) => fullSearchable.includes(w));
              if (uName.includes(batteryToken) || batteryToken.includes(uName) || uCmd.includes(batteryToken) || allWordsMatch) {
                supportingBatteryId = u.id;
                break;
              }
            }
          }
        }
        if (!supportingBatteryId) {
          const defaultArty = context.playerUnits.find((u) => u.type === 'artillery' && u.status !== 'shattered');
          if (defaultArty) {
            supportingBatteryId = defaultArty.id;
          }
        }
        formation = explicitFormation || 'line';
        const batteryName = supportingBatteryId
          ? (context.playerUnits.find((u) => u.id === supportingBatteryId)?.name || 'supporting battery')
          : 'supporting artillery';
        actionDesc = `Designating target and establishing Forward Observer (FO) fire-support link with ${batteryName} on ${destinationName} (precision C2 adjustment)`;
      } else {
        formation = explicitFormation || 'unlimbered';
        actionDesc = isTrpFire
          ? `Laying pre-registered artillery fire on ${trpCode} (${destinationName}) with pre-dialed elevation`
          : `Unlimbering guns and laying artillery bombardment on ${destinationName}`;
      }
    } else if (primaryTextLower.includes('bayonet') || primaryTextLower.includes('charge') || primaryTextLower.includes('melee') || primaryTextLower.includes('storm')) {
      orderType = 'charge';
      formation = explicitFormation || 'column';
      actionDesc = `Advancing to assault ${destinationName}`;
    } else if (primaryTextLower.includes('assault') || primaryTextLower.includes('attack')) {
      orderType = 'assault';
      formation = explicitFormation || 'column';
      actionDesc = `Advancing to assault ${destinationName}`;
    } else if (primaryTextLower.includes('reinforce') || primaryTextLower.includes('support') || primaryTextLower.includes('join')) {
      orderType = 'assault';
      formation = explicitFormation || 'column';
      actionDesc = `Marching in column to reinforce ${destinationName}`;
    } else if (primaryTextLower.includes('hold') || primaryTextLower.includes('defend') || primaryTextLower.includes('stand')) {
      orderType = 'hold';
      formation = explicitFormation || 'line';
      actionDesc = `Holding defensive position at ${destinationName}`;
    } else if (primaryTextLower.includes('entrench') || primaryTextLower.includes('dig')) {
      orderType = 'entrench';
      formation = explicitFormation || 'line';
      actionDesc = `Constructing field fortifications at ${destinationName}`;
    } else if (primaryTextLower.includes('retreat') || primaryTextLower.includes('fall back')) {
      orderType = 'retreat';
      formation = explicitFormation || 'column';
      actionDesc = `Conducting fighting withdrawal to ${destinationName}`;
    } else {
      orderType = 'march';
      formation = explicitFormation || 'column';
      actionDesc = `Marching to ${destinationName}`;
    }

    if (explicitFormation) {
      if (explicitFormation === 'square') {
        actionDesc += `, forming square`;
      } else if (explicitFormation === 'line') {
        actionDesc += `, deploying in line`;
      } else if (explicitFormation === 'column') {
        actionDesc += `, in column`;
      }
    }

    // Forced march detection
    const isForcedMarch = /\b(?:force|forced)\s+march\b|\bat\s+the\s+double\b|\bdouble\s+time\b|\bhaste\b|\bpas\s+de\s+charge\b|\bhurry\b|\bpress\s+on\b/i.test(normText);
    if (isForcedMarch) {
      if (orderType === 'march' || orderType === 'assault') {
        actionDesc = `Executing forced march to ${destinationName}`;
      } else {
        actionDesc += ` (forced march)`;
      }
    }

    // Append arc or compass bearing details to action description for realistic military flair
    if (isArcManeuver && arcDescription) {
      actionDesc += ` via ${arcDescription.toLowerCase()}`;
    } else if (orderType !== 'hold' && orderType !== 'entrench' && orderType !== 'bombard') {
      actionDesc += ` on bearing ${String(bearingDeg).padStart(3, '0')}° (${cardinalInfo.code})`;
    }

    if (finalHeading !== undefined) {
      const arrivingCard = getCardinalDirection(headingToBearing(finalHeading));
      actionDesc += `, forming line facing ${arrivingCard.label}`;
    }

    // Calculate realistic courier delay based on distance from HQ (TRPs are pre-registered = expedited)
    const hq = context.playerUnits.find((u) => u.type === 'headquarters') || context.playerUnits[0];
    const distToUnit = Math.hypot(matchedUnit.position.x - hq.position.x, matchedUnit.position.y - hq.position.y);
    const baseDelay = Math.max(1.2, Math.round(distToUnit / 380));
    const delayMinutes = isTrpFire ? Math.max(0.5, Math.round(baseDelay * 0.5 * 10) / 10) : baseDelay;

    // Extract temporal timing constraints (e.g. "at 08:30", "hold until 09:00", "for 20 minutes")
    const temporal = parseTemporalConstraints(normText, context.currentTimeMinutes, delayMinutes);

    // Chained directive follow-up (e.g. "then assault Pratzen")
    let chainedOrder: Omit<ManeuverOrder, 'id' | 'status'> | undefined = undefined;
    if (conditionInfo.chainedClause) {
      const chainedData = parseChainedDirective(conditionInfo.chainedClause, context, destination);
      chainedOrder = {
        unitId: matchedUnit.id,
        type: chainedData.orderType,
        destination: chainedData.destination,
        waypoints: [],
        targetFormation: chainedData.targetFormation,
        plannedTime: temporal.endTime ?? temporal.startTime ?? context.currentTimeMinutes,
      };
    }

    if (temporal.timingDescription) {
      actionDesc += ` [TIMING: ${temporal.timingDescription}]`;
    }
    if (conditionInfo.conditionDescription) {
      actionDesc += ` [CONTINGENCY: ${conditionInfo.conditionDescription}]`;
    }
    if (chainedOrder) {
      actionDesc += ` [FOLLOW-UP: ${chainedOrder.type.toUpperCase()}]`;
    }

    const cleanCommander = (matchedUnit.commander || matchedUnit.name).replace(/[’‘`]/g, "'");
    const recipientDisplayName = isCorpsOrder && matchedCorps ? matchedCorps : cleanCommander;
    const ackMessage = isCorpsOrder && matchedCorps && targetUnitIds
      ? `[ACK - CORPS COMMAND] ${matchedCorps}: Orders received for all ${targetUnitIds.length} regiments. ${actionDesc}. ETA ~${delayMinutes}m.`
      : `[ACK] ${cleanCommander}: Understood. ${actionDesc}. ${isTrpFire ? 'EXPEDITED ' : ''}ETA ~${delayMinutes}m.`;

    return {
      recipientUnitId: matchedUnit.id,
      recipientName: recipientDisplayName,
      orderType,
      destination,
      waypoints: waypoints.length > 0 ? waypoints : undefined,
      curveControl,
      targetFormation: formation,
      acknowledgment: ackMessage,
      delayMinutes,
      modelUsed: isCorpsOrder ? 'Corps Headquarters Dispatch' : 'Staff Dispatch (HQ Protocol)',
      confidence: 'rule_fallback',
      isSmokeMission: isSmoke,
      isTrpFire,
      trpCode,
      isCorpsOrder,
      corpsName: matchedCorps || undefined,
      targetUnitIds,
      finalHeading,
      bearingDeg,
      cardinalCode: cardinalInfo.code,
      isArcManeuver,
      arcDescription: isArcManeuver ? arcDescription : undefined,
      isForcedMarch,
      startTime: temporal.startTime,
      endTime: temporal.endTime,
      durationMinutes: temporal.durationMinutes,
      condition: conditionInfo.condition,
      chainedOrder,
      conditionDescription: conditionInfo.conditionDescription,
      timingDescription: temporal.timingDescription,
      observerUnitId,
      supportingBatteryId,
      holdFireThreshold,
      suppressionTargetId,
      isCounterBattery,
      isGrandBattery,
      isSkirmishScreen,
    };
  }
}

export const dispatchService = new LLMDispatchService();

export function useOllamaStatus(): OllamaConnectionStatus {
  const [status, setStatus] = useState<OllamaConnectionStatus>(() => dispatchService.getStatus());

  useEffect(() => {
    dispatchService.startAutoPolling(4000);
    const unsubscribe = dispatchService.subscribe(setStatus);
    return () => {
      unsubscribe();
    };
  }, []);

  return status;
}
