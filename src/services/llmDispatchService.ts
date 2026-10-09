import { Unit, Vector2D, ManeuverOrder, Formation, OrderCondition, TargetReferencePoint } from '../types/game';
import { PLACE_NAMES } from '../data/gazetteer';
import { normalizeGridRefs, parseMgrs } from '../engine/grid';
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
  /** Unit that receives an order with no addressee (the player's current selection). */
  defaultRecipientId?: string | null;
}

/** Raised when an order cannot be attributed or understood; the message is shown to the player. */
export type DispatchErrorCode = 'unknown_recipient' | 'no_recipient' | 'unclear' | 'no_battery';

export class DispatchError extends Error {
  constructor(message: string, public code: DispatchErrorCode = 'unclear') {
    super(message);
  }
}

function nearestBattery(units: Unit[], target: Vector2D): Unit | undefined {
  let best: Unit | undefined;
  let bestDist = Infinity;
  for (const u of units) {
    if (u.type !== 'artillery' || u.status === 'shattered' || u.strength <= 0) continue;
    const d = Math.hypot(u.position.x - target.x, u.position.y - target.y);
    if (d < bestDist) {
      bestDist = d;
      best = u;
    }
  }
  return best;
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
  confidence: 'rule' | 'model_rewrite';
  /** When the language model rephrased the order before parsing, the phrasing it produced. */
  interpretedAs?: string;
  /** Set when the parser had to guess; the language model is asked for a cleaner reading. */
  uncertainty?: string;
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



const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
const DEFAULT_MODEL = 'gemma4:latest';
// Small instruction models are enough for rephrasing; the first one installed is used
// Measured on the rewrite task (M3, 24 GB): gemma4 8B 7/8 at ~1.3 s; e2b 6/8 at ~0.7 s; 12B too slow (4.5 s+)
const PREFERRED_MODELS = ['gemma4:e4b', 'gemma4:latest', 'gemma4:e2b', 'gemma3:4b', 'qwen2.5:3b', 'llama3.2:3b', 'gemma3:1b'];
const MODEL_KEEP_ALIVE = '30m';

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
  const gridRef = parseMgrs(text);
  if (gridRef) return gridRef;

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
const HOUR_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/**
 * Spelled-out clock times after a time preposition become HH:MM ("until eleven" -> "until 11:00",
 * "at half past eight" -> "at 08:30", "by noon" -> "by 12:00"). The battle runs 07:00-16:00, so
 * one to six o'clock are afternoon hours unless "in the morning"/"am" is given.
 */
export function normalizeTimeWords(text: string): string {
  const words = Object.keys(HOUR_WORDS).join('|');
  const re = new RegExp(
    `\\b(until|till|til|at|by|before|after|from)\\s+(?:(half\\s+past|quarter\\s+past|quarter\\s+to)\\s+)?(${words}|noon|midday)(?:\\s+o'?clock)?(\\s+(?:in\\s+the\\s+morning|am|a\\.m\\.|pm|p\\.m\\.|in\\s+the\\s+afternoon))?\\b(?=\\s*(?:[,.;:!?)]|$)|\\s+(?:then|and|or|to|at|on|in|before|after|with|while|unless|if|hold|attack|advance|march|move|form|fire)\\b)`,
    'gi'
  );
  return text.replace(re, (_m, prep: string, frac: string | undefined, word: string, ampm: string | undefined) => {
    const w = word.toLowerCase();
    let hour = w === 'noon' || w === 'midday' ? 12 : HOUR_WORDS[w];
    const am = !!ampm && /morning|a\.?m/i.test(ampm);
    if (!am && hour <= 6) hour += 12;
    let minute = 0;
    const f = (frac || '').toLowerCase().replace(/\s+/g, ' ');
    if (f === 'half past') minute = 30;
    else if (f === 'quarter past') minute = 15;
    else if (f === 'quarter to') {
      hour -= 1;
      minute = 45;
    }
    return `${prep} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  });
}

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

  // 3. Duration: "for 20 minutes", "for 30 min", "for 1 hour", "for half an hour".
  // A bare "m" is metres ("on bearing 090° for 750m"), never minutes.
  const durMinMatch = /\bfor\s+(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?)\b/i.exec(norm);
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
      const cleanLm = stripDiacritics(lm.name.toLowerCase()).replace(/[^a-z0-9]/g, ' ');
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
      const cleanLm = stripDiacritics(lm.name.toLowerCase()).replace(/[^a-z0-9]/g, ' ');
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
  private endpoint = DEFAULT_OLLAMA_ENDPOINT;
  private model = DEFAULT_MODEL;
  private online: boolean | null = null;
  private lastCheckTime = 0;
  private warmed = false;

  /** The local model is a fallback, on by default; set localStorage "dispatch.localModel" = "0" to disable. */
  private modelEnabled(): boolean {
    try {
      return !(typeof localStorage?.getItem === 'function' && localStorage.getItem('dispatch.localModel') === '0');
    } catch {
      return true;
    }
  }

  /** Detects Ollama (cached for 30 s) and picks a small instruction model from what is installed. */
  public async checkConnection(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && this.online !== null && now - this.lastCheckTime < 30000) return this.online;
    this.lastCheckTime = now;
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, { signal: AbortSignal.timeout(800) });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const installed: string[] = Array.isArray(data?.models) ? data.models.map((m: { name: string }) => m.name) : [];
      let override: string | null = null;
      try {
        override = typeof localStorage?.getItem === 'function' ? localStorage.getItem('dispatch.model') : null;
      } catch {
        override = null;
      }
      this.model =
        (override && installed.includes(override) && override) ||
        PREFERRED_MODELS.find((m) => installed.includes(m)) ||
        installed[0] ||
        DEFAULT_MODEL;
      this.online = installed.length > 0;
    } catch {
      this.online = false;
    }
    return this.online;
  }

  /** Loads the model into memory ahead of use (a cold load takes several seconds). */
  public async warmUp(): Promise<void> {
    if (this.warmed || !this.modelEnabled() || !(await this.checkConnection())) return;
    this.warmed = true;
    fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, keep_alive: MODEL_KEEP_ALIVE }),
    }).catch(() => {
      this.warmed = false;
    });
  }

  /**
   * The deterministic staff parser resolves every order. Only when it cannot (unknown or missing
   * recipient, unrecognised wording) is a small local model asked to rephrase the order into the
   * standard form, which is then parsed again. The model never chooses units or coordinates itself.
   */
  public async processDispatch(originalText: string, context: TacticalDispatchContext): Promise<ParsedDispatchResult> {
    // MGRS references ("XQ 1834 5172") become map coordinates and spelled-out times become HH:MM
    const rawText = normalizeTimeWords(normalizeGridRefs(originalText));
    try {
      const result = this.parseWithRuleEngine(rawText, context);
      if (!result.uncertainty || !this.modelEnabled() || !(await this.checkConnection())) return result;
      const rewrite = await this.rewriteWithModel(originalText, context);
      if (!rewrite) return result;
      try {
        const better = this.parseWithRuleEngine(normalizeTimeWords(normalizeGridRefs(rewrite)), context);
        if (better.uncertainty) return result;
        return {
          ...better,
          confidence: 'model_rewrite',
          modelUsed: this.model,
          interpretedAs: rewrite,
          acknowledgment: `${better.acknowledgment} (Interpreted as "${rewrite}".)`,
        };
      } catch {
        return result;
      }
    } catch (err) {
      if (!(err instanceof DispatchError) || err.code === 'no_battery' || !this.modelEnabled()) throw err;
      if (!(await this.checkConnection())) throw err;

      const rewrite = await this.rewriteWithModel(originalText, context);
      if (!rewrite) throw err;
      try {
        const result = this.parseWithRuleEngine(normalizeTimeWords(normalizeGridRefs(rewrite)), context);
        return {
          ...result,
          confidence: 'model_rewrite',
          modelUsed: this.model,
          interpretedAs: rewrite,
          acknowledgment: `${result.acknowledgment} (Interpreted as "${rewrite}".)`,
        };
      } catch {
        throw new DispatchError(`${err.message} The order was read as "${rewrite}", which could not be resolved either.`, err.code);
      }
    }
  }

  /** Asks the model to restate a free-form order in the parser's grammar, using only real names. */
  private async rewriteWithModel(text: string, context: TacticalDispatchContext): Promise<string | null> {
    const units = context.playerUnits
      .filter((u) => u.status !== 'shattered')
      .map((u) => {
        const surname = (u.commander.split(' ').pop() || u.commander).replace(/[’‘`]/g, "'");
        const detail = (u.name.match(/\(([^)]*)\)/)?.[1] ?? u.corps).trim();
        return `@${surname} = ${detail}, ${u.type}`;
      });
    const corps = Array.from(new Set(context.playerUnits.map((u) => u.corps.replace(/\s*\([^)]*\)/, ''))));
    const places = Array.from(
      new Set([...context.landmarks.map((l) => l.name), ...PLACE_NAMES.map((p) => p.name)].map((n) => n.replace(/\s*\([^)]*\)/g, '').trim()))
    );

    const system = [
      'You rewrite a commander\'s order into the standard staff format. Reply with JSON only.',
      'Format: @<unit> <action> [<place>] [until HH:MM | at HH:MM] [, if <condition>, <action>] [then <action> <place>]',
      'Actions: advance to, march to, forced march to, attack, charge, take, hold, entrench at, withdraw to, fire on, lay smoke on, counter-battery, form line, form column, form square.',
      'Use only the unit and place names listed below, spelled exactly. Keep times, grid references (e.g. XQ 2285 5110) and coordinates unchanged.',
      'If the order addresses no unit, start with the action and no @unit.',
      'If the order names a unit that is not listed, or cannot be expressed in this format, return {"order": "", "understood": false}. Never substitute a different unit.',
      `Units: ${units.join('; ')}`,
      `Corps: ${corps.join('; ')}`,
      `Places: ${places.join(', ')}`,
      'Examples:',
      'Order: "get the grenadiers up onto the vineyard hill" -> {"order": "@Oudinot advance to Staré Vinohrady Hill", "understood": true}',
      'Order: "Soult\'s boys should hit the plateau hard at half past eight" -> {"order": "@Soult attack Pratzen Heights at 08:30", "understood": true}',
      'Order: "pull Caffarelli back behind the brook" -> {"order": "@Caffarelli withdraw to Schlappanitz", "understood": true}',
      'Order: "Kellermann, charge!" -> {"order": "", "understood": false}',
    ].join('\n');

    try {
      const res = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.warmed ? 8000 : 15000),
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Order: "${text}"` },
          ],
          stream: false,
          think: false,
          keep_alive: MODEL_KEEP_ALIVE,
          format: {
            type: 'object',
            properties: { order: { type: 'string' }, understood: { type: 'boolean' } },
            required: ['order', 'understood'],
          },
          options: { temperature: 0, num_predict: 60 },
        }),
      });
      this.warmed = true;
      if (!res.ok) return null;
      const data = await res.json();
      const parsed = JSON.parse(String(data?.message?.content ?? '{}'));
      const order = typeof parsed.order === 'string' ? parsed.order.trim() : '';
      if (!parsed.understood || !order || order.toLowerCase() === text.trim().toLowerCase()) return null;
      return order;
    } catch {
      return null; // offline, timed out or malformed: fall back to the parser's own message
    }
  }

  private parseWithRuleEngine(
    rawText: string,
    context: TacticalDispatchContext
  ): ParsedDispatchResult {
    const normText = rawText.replace(/[’‘`]/g, "'").trim();
    const textLower = normText.toLowerCase();

    // Every named place on the sheet, not only the scenario's tactical terrain
    const landmarks: TacticalLandmarkContext[] = [...context.landmarks];
    for (const place of PLACE_NAMES) {
      const key = stripDiacritics(place.name.toLowerCase()).split(/[^a-z0-9]+/)[0];
      const known = landmarks.some((l) => stripDiacritics(l.name.toLowerCase()).split(/[^a-z0-9]+/).includes(key));
      if (!known) landmarks.push(place);
    }
    context = { ...context, landmarks };

    // The primary clause excludes any follow-up ("... then advance to Bosenitz"), and the action text
    // additionally excludes contingencies ("if attacked, form square") so they don't read as actions.
    const chainedAt = /\b(?:then|afterwards|subsequently|followed\s+by)\b/i.exec(normText);
    const primaryText = chainedAt ? normText.slice(0, chainedAt.index) : normText;
    const condAt = /\b(?:if|when|once|in\s+case|unless)\b/i.exec(primaryText);
    const actionText = condAt ? primaryText.slice(0, condAt.index) : primaryText;
    const actionLower = actionText.toLowerCase();
    const plainPrimary = stripDiacritics(primaryText);
    const hasAction = /\b(advance|march|move|go|proceed|push|attack|assault|charge|storm|take|seize|secure|occupy|capture|hold|defend|stand|hang\s+on|stay|remain|entrench|dig|retreat|withdraw|retire|fall\s+back|pull\s+back|reinforce|support|join|relieve|bombard|fire|shell|barrage|smoke|suppress|volley|screen|deploy|cross|wheel|engage|intercept|counter[- ]?battery)\b/i.test(actionText);
    const isPureContingency = !!condAt && !hasAction;

    // Check if user specifically ordered artillery bombardment or battery fire
    const isBombardmentKeyword =
      /\b(bombard|bombardment|fire|battery|artillery|barrage|cannon|shell|salvo|strike|call\s+for\s+fire|cff|fire\s+mission)\b/i.test(actionText);

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

    const leadComma = /^([^,@:;\n]{2,40}),/.exec(normText);
    const rawLead = leadAt ? leadAt[1] : (rankMatch ? rankMatch[1] : (leadComma ? leadComma[1] : (leadPlain ? leadPlain[1] : null)));
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

    // How the recipient was identified; a loose substring or keyword match is a guess worth double-checking
    let recipientGuessed = false;

    // Priority 1b: Check if leading addressee is an individual Commander or Regiment (with diacritic stripping)
    const LEAD_STOPWORDS = /^(?:the|a|an|i|we|you|our|my|have|get|send|let|make|tell|order|all|now|then|please|and|if|when|once|move|advance|attack|hold|march|fire|charge)$/;
    const normLead = leadToken && !(leadPlain && !leadAt && !rankMatch && !leadComma && LEAD_STOPWORDS.test(leadToken))
      ? stripDiacritics(leadToken)
      : null;
    if (!isCorpsOrder && normLead) {
      // Step 1: Exact commander surname or exact full commander name
      for (const u of context.playerUnits) {
        const cleanCmd = stripDiacritics(u.commander.replace(/[’‘`]/g, "'").toLowerCase());
        const surname = stripDiacritics((u.commander.split(' ').pop() || u.commander).replace(/[’‘`]/g, "'").toLowerCase());
        // "@Friant forced march ..." captures "friant forced": an @-address starting with the surname is exact
        if (normLead === surname || cleanCmd === normLead || (leadAt && normLead.startsWith(`${surname} `))) {
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
      // Step 3: Best word overlap with the unit's name (e.g. "whoever commands the Guard battery"
      // -> GUARD HORSE BATTERY); needs two shared words and a unique best match
      if (!matchedUnit) {
        const filler = /^(?:the|and|who|whoever|commands|command|commanding|your|our|with|from|for|men|troops|lads)$/;
        const leadWords = normLead.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !filler.test(w));
        if (leadWords.length > 1) {
          let best: Unit | null = null;
          let bestScore = 1;
          let tie = false;
          for (const u of context.playerUnits) {
            const nameWords = stripDiacritics(u.name.replace(/[’‘`]/g, "'").toLowerCase()).split(/[^a-z0-9]+/);
            const score = leadWords.filter((w) => nameWords.includes(w) || (w === 'cavalry' && nameWords.includes('cav'))).length;
            if (score > bestScore) {
              best = u;
              bestScore = score;
              tie = false;
            } else if (score === bestScore && best) {
              tie = true;
            }
          }
          if (best && !tie) matchedUnit = best;
        }
      }
      // Step 4: Substring match on commander (only for tokens long enough to mean something)
      if (!matchedUnit && normLead.length >= 4) {
        for (const u of context.playerUnits) {
          const cleanCmd = stripDiacritics(u.commander.replace(/[’‘`]/g, "'").toLowerCase());
          if (cleanCmd.includes(normLead)) {
            matchedUnit = u;
            recipientGuessed = true;
            break;
          }
        }
      }
      // Step 5: Substring match on unit name
      if (!matchedUnit && normLead.length >= 4) {
        for (const u of context.playerUnits) {
          const cleanName = stripDiacritics(u.name.replace(/\s*\([^)]*\)/g, '').replace(/[’‘`]/g, "'").toLowerCase().trim());
          const fullName = stripDiacritics(u.name.replace(/[’‘`]/g, "'").toLowerCase().trim());
          if (cleanName.includes(normLead) || normLead.includes(cleanName) || fullName.includes(normLead)) {
            matchedUnit = u;
            recipientGuessed = true;
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
        recipientGuessed = !/\bcorps\b/i.test(normText); // "cavalry" alone is a guess, "IV Corps" is not
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
      recipientGuessed = !!matchedUnit;
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

    // Orders to a corps commander that mention the corps go to the whole corps
    if (!isCorpsOrder && matchedUnit && matchedUnit.type === 'headquarters' && /\bcorps\b/i.test(normText)) {
      const corpsUnits = context.playerUnits.filter((u) => u.corps === matchedUnit!.corps && u.status !== 'shattered');
      if (corpsUnits.length > 1) {
        isCorpsOrder = true;
        matchedCorps = matchedUnit.corps;
        targetUnitIds = corpsUnits.map((u) => u.id);
      }
    }

    // An explicit addressee that matches nobody is refused, never reassigned ("@Ney ...", "Kellermann, charge!")
    const namedLead =
      leadAt?.[1] ?? (leadComma && /^[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*){0,2}$/.test(leadComma[1].trim()) ? leadComma[1] : null);
    if (!matchedUnit && namedLead) {
      throw new DispatchError(`No unit answers to "${namedLead.trim()}". Check the name in the ORBAT.`, 'unknown_recipient');
    }
    if (!matchedUnit && context.defaultRecipientId) {
      matchedUnit = context.playerUnits.find((u) => u.id === context.defaultRecipientId) || null;
      // The selection is only a safe default if the order doesn't name some other formation
      if (/\b(guard|grenadiers?|cavalry|horse|dragoons|hussars|cuirassiers|chasseurs|batter(?:y|ies)|guns|artillery|corps|division|column|brigade)\b/i.test(actionText)) {
        recipientGuessed = true;
      }
    }
    if (!matchedUnit) {
      throw new DispatchError('Address the order to a unit, e.g. "@Vandamme advance to Pratzen", or select a unit first.', 'no_recipient');
    }

    // 2. Identify Target Location / Destination
    // PRIORITY 1: Check for explicit grid coordinates (e.g. (1420, 680), 1420, 680)
    const explicitCoords = extractCoordinates(primaryText, context.trps);
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
      const destMatches: { lm: TacticalLandmarkContext; isDestPreposition: boolean; at: number; tok: string }[] = [];

      for (const lm of context.landmarks) {
        const cleanLm = stripDiacritics(lm.name.toLowerCase()).replace(/[^a-z0-9]/g, ' ');
        const tokens = cleanLm.split(' ').filter((t) => t.length >= 3);
        for (const t of tokens) {
          const regex = new RegExp(`\\b${t}\\b`, 'gi');
          let match: RegExpExecArray | null;
          while ((match = regex.exec(plainPrimary)) !== null) {
            const matchIdx = match.index;
            const textBefore = plainPrimary.slice(Math.max(0, matchIdx - 35), matchIdx);

            const isDestPrep = /\b(?:to|towards?|at|reach|storm|take|occupy|near|on)\s+@?[a-z0-9]*\s*$/i.test(textBefore);
            const isOrigin = !isDestPrep && /\b(?:from|leaving|departing|out\s+of|starting\s+(?:from|at))\s+@?[a-z0-9]*\s*$/i.test(textBefore);

            if (!isOrigin) {
              destMatches.push({ lm, isDestPreposition: isDestPrep, at: matchIdx, tok: t });
            }
          }
        }
      }

      // A place whose whole name is the word used wins; then villages and hills over bridges/fords
      const primaryLower = plainPrimary.toLowerCase();
      const rank = (m: (typeof destMatches)[number]) => {
        const bare = stripDiacritics(m.lm.name.replace(/\s*\([^)]*\)/g, '').toLowerCase()).trim();
        const words = bare.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
        const wordsPresent = words.filter((w) => new RegExp(`\\b${w}\\b`).test(primaryLower)).length;
        const wholeName = primaryLower.includes(bare) ? 1 : 0;
        const kind = m.lm.type === 'village' || m.lm.type === 'hill' || m.lm.type === 'ridge' ? 1 : 0;
        return wordsPresent * 3 + wholeName + kind;
      };
      const bestAt = (group: typeof destMatches) => group.reduce((a, b) => (rank(b) > rank(a) ? b : a)).lm;
      const prepMatches = destMatches.filter((m) => m.isDestPreposition);
      if (prepMatches.length > 0) {
        const lastAt = Math.max(...prepMatches.map((m) => m.at));
        matchedLandmark = bestAt(destMatches.filter((m) => Math.abs(m.at - lastAt) <= 24));
      } else if (destMatches.length > 0) {
        const firstAt = Math.min(...destMatches.map((m) => m.at));
        matchedLandmark = bestAt(destMatches.filter((m) => Math.abs(m.at - firstAt) <= 24));
      } else {
        // Fallback to checking any landmark token
        for (const lm of context.landmarks) {
          const cleanLm = stripDiacritics(lm.name.toLowerCase()).replace(/[^a-z0-9]/g, ' ');
          const tokens = cleanLm.split(' ').filter((t) => t.length >= 3);
          for (const t of tokens) {
            if (new RegExp(`\\b${t}\\b`, 'i').test(plainPrimary)) {
              matchedLandmark = lm;
              break;
            }
          }
          if (matchedLandmark) break;
        }
      }

      const isHoldOrder = isPureContingency || /\b(hold|defend|entrench|stand|dig\s*in|hang\s+on|stay|remain)\b/i.test(actionLower);

      // If holding/defending at a landmark, destination IS the landmark itself!
      const isWithdrawal = /\b(retreat|withdraw|retire|fall\s+back|pull\s+back)\b/i.test(actionLower);
      if (isHoldOrder && matchedLandmark && !isPureContingency) {
        destination = { ...matchedLandmark.position };
        destinationName = matchedLandmark.name.replace(/\s*\([^)]*\)/g, '').trim();
      } else if (isHoldOrder) {
        destination = { ...matchedUnit.position };
        destinationName = 'present position';
      } else if (isWithdrawal && !matchedLandmark) {
        // Fall back directly away from the nearest enemy
        let nearest: Unit | null = null;
        let best = Infinity;
        for (const e of context.enemyUnits) {
          const d = Math.hypot(e.position.x - matchedUnit.position.x, e.position.y - matchedUnit.position.y);
          if (d < best) {
            best = d;
            nearest = e;
          }
        }
        const away = nearest
          ? Math.atan2(matchedUnit.position.y - nearest.position.y, matchedUnit.position.x - nearest.position.x)
          : matchedUnit.heading + Math.PI;
        destination = {
          x: Math.max(50, Math.min(2350, matchedUnit.position.x + Math.cos(away) * 200)),
          y: Math.max(50, Math.min(1450, matchedUnit.position.y + Math.sin(away) * 200)),
        };
        destinationName = 'a position 1 km to the rear';
      } else {
        // Check if user specifically ordered an attack or engagement against enemy forces
        const attacksEnemy = !isWithdrawal && /\b(enemy|hostile|attack|intercept|engage|charge|storm|destroy)\b/.test(actionLower);

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

    const namesFormationOrFacing = /\b(?:form(?:ing)?|in(?:to)?)\s+(?:line|column|square)\b|\b(?:face|facing|limber|unlimber)\b/i.test(actionText);
    if (!hasAction && !isPureContingency && !namesFormationOrFacing && destinationName === 'designated sector') {
      throw new DispatchError(
        'Could not make out the order. Use a verb and a place, e.g. "@Vandamme advance to Pratzen" or "@Legrand hold Sokolnitz".',
        'unclear'
      );
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

    const primaryTextLower = actionLower;

    // 3. Determine Order Type & Formation
    let explicitFormation: Formation | undefined = undefined;
    if (isPureContingency) {
      // The formation named in a contingency ("if attacked, form square") applies only when triggered
    } else if (/\b(?:in|into|as|form(?:ing)?)\s+square\b|\bsquare\s+formation\b/i.test(normText)) {
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

    const isSmoke = /\b(smoke|smoke\s*screen|obscurant)\b/i.test(actionText);
    const isVolleyFire = /\b(?:volley|fire\s+by\s+ranks|whites\s+of\s+their\s+eyes|hold\s+fire(?:\s+for\s+volley)?|mass\s+volley)\b/i.test(normText);
    const isSuppressiveFire = /\b(?:suppress|suppressive|covering\s+fire|base\s+of\s+fire|pin\s+down|pinning\s+fire)\b/i.test(normText);
    const isCounterBattery = /\b(?:counter[- ]?battery|contre[- ]?batterie|silence\s+(?:enemy\s+)?guns|knock\s*out\s+(?:enemy\s+)?battery)\b/i.test(normText);
    const isGrandBattery = /\b(?:grand\s+battery|grande\s+batterie|mass(?:ed)?\s+artillery|mass(?:ed)?\s+batter(?:y|ies)|tot\s+barrage|time\s+on\s+target|converge\s+artillery)\b/i.test(normText);
    const isSkirmishScreen = /\b(?:skirmish\s+screen|tirailleurs?|peltasts?|recon\s+pickets?|deploy\s+screen|screen\s+flank|screen\s+front)\b/i.test(normText);
    const trpMatch = /\b(?:trp|target\s*ref(?:erence)?\s*(?:point)?)\s*[-_#]?\s*(0?[1-9])\b/i.exec(rawText);
    const isTrpFire = !!trpMatch;
    const trpCode = trpMatch ? `TRP 0${parseInt(trpMatch[1], 10)}` : undefined;

    if (isPureContingency) {
      orderType = 'hold';
      formation = matchedUnit.formation;
      actionDesc = 'Holding present position';
    } else if (isSkirmishScreen) {
      orderType = 'hold';
      formation = explicitFormation || 'line';
      actionDesc = `Deploying forward skirmish screen line (35% incoming fire absorption & shock charge disruption)`;
    } else if (isCounterBattery) {
      // Lock onto the enemy battery nearest the named area
      let guns: Unit | null = null;
      let best = 320;
      for (const e of context.enemyUnits) {
        if (e.type !== 'artillery' || e.status === 'shattered' || e.strength <= 0) continue;
        const d = Math.hypot(e.position.x - destination.x, e.position.y - destination.y);
        if (d < best) {
          best = d;
          guns = e;
        }
      }
      if (guns) {
        destination = { ...guns.position };
        destinationName = guns.name;
      }
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
          supportingBatteryId = nearestBattery(context.playerUnits, destination)?.id;
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
    } else if (/\b(bayonets?|charge|melee|storm)\b/.test(primaryTextLower)) {
      orderType = 'charge';
      formation = explicitFormation || 'column';
      actionDesc = `Advancing to assault ${destinationName}`;
    } else if (/\b(assault|attack|take|seize|capture)\b/.test(primaryTextLower)) {
      orderType = 'assault';
      formation = explicitFormation || 'column';
      actionDesc = `Advancing to assault ${destinationName}`;
    } else if (/\b(reinforce|support|join)\b/.test(primaryTextLower)) {
      orderType = 'assault';
      formation = explicitFormation || 'column';
      actionDesc = `Marching in column to reinforce ${destinationName}`;
    } else if (/\b(hold|defend|stand|hang\s+on|stay|remain)\b/.test(primaryTextLower)) {
      orderType = 'hold';
      formation = explicitFormation || 'line';
      actionDesc = `Holding defensive position at ${destinationName}`;
    } else if (/\b(entrench|dig)\b/.test(primaryTextLower)) {
      orderType = 'entrench';
      formation = explicitFormation || 'line';
      actionDesc = `Constructing field fortifications at ${destinationName}`;
    } else if (/\b(retreat|withdraw|retire|fall\s+back|pull\s+back)\b/.test(primaryTextLower)) {
      orderType = 'retreat';
      formation = explicitFormation || 'column';
      actionDesc = `Conducting fighting withdrawal to ${destinationName}`;
    } else {
      orderType = 'march';
      formation = explicitFormation || 'column';
      actionDesc = `Marching to ${destinationName}`;
    }

    if (orderType === 'bombard' && matchedUnit.type !== 'artillery' && !supportingBatteryId) {
      const battery = nearestBattery(context.playerUnits, destination);
      if (!battery) throw new DispatchError('No friendly battery is available to fire this mission.', 'no_battery');
      observerUnitId = matchedUnit.id;
      supportingBatteryId = battery.id;
      actionDesc += `, observed for ${battery.name}`;
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
      confidence: 'rule',
      uncertainty: recipientGuessed
        ? 'recipient inferred from a keyword'
        : !hasAction && !isPureContingency && !namesFormationOrFacing
        ? 'no recognised action'
        : isPureContingency && !conditionInfo.conditionDescription
        ? 'contingency not understood'
        : undefined,
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
