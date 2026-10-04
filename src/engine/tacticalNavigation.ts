import { Vector2D } from '../types/game';
import { TacticalLandmarkContext } from '../services/llmDispatchService';

// ============================================================================
// 1. BEARING & HEADING CONVERSIONS
// ============================================================================
// Mathematical convention: theta = Math.atan2(dy, dx), 0 = +X (East), -PI/2 = -Y (North)
// Navigational compass: 000° = North (-Y), 090° = East (+X), 180° = South (+Y), 270° = West (-X)

/**
 * Converts a math heading angle in radians (used by the engine) to a compass bearing in degrees [0, 360).
 */
export function headingToBearing(headingRad: number): number {
  const deg = (headingRad * 180) / Math.PI;
  const bearing = (deg + 90 + 360) % 360;
  return Math.round(bearing);
}

/**
 * Converts a compass bearing in degrees [0, 360) to a math heading angle in radians.
 */
export function bearingToHeading(bearingDeg: number): number {
  let deg = (bearingDeg - 90 + 360) % 360;
  if (deg > 180) deg -= 360;
  return (deg * Math.PI) / 180;
}

/**
 * Converts a compass bearing in degrees [0, 360) to standard NATO angular mils (6400 mils = 360°).
 */
export function bearingToMils(bearingDeg: number): number {
  const norm = ((bearingDeg % 360) + 360) % 360;
  return Math.round((norm / 360) * 6400) % 6400;
}

/**
 * Converts NATO angular mils [0, 6400) to compass bearing in degrees.
 */
export function milsToBearing(mils: number): number {
  const norm = ((mils % 6400) + 6400) % 6400;
  return Math.round(((norm / 6400) * 360) * 10) / 10;
}

export interface CardinalInfo {
  code: string;
  label: string;
  bearing: number;
  mils: number;
}

/**
 * Resolves a bearing in degrees into an 8-point cardinal direction with NATO mils.
 */
export function getCardinalDirection(bearingDeg: number): CardinalInfo {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  const mils = bearingToMils(normalized);
  if (normalized >= 337.5 || normalized < 22.5) return { code: 'N', label: 'North', bearing: 0, mils };
  if (normalized >= 22.5 && normalized < 67.5) return { code: 'NE', label: 'North-East', bearing: 45, mils };
  if (normalized >= 67.5 && normalized < 112.5) return { code: 'E', label: 'East', bearing: 90, mils };
  if (normalized >= 112.5 && normalized < 157.5) return { code: 'SE', label: 'South-East', bearing: 135, mils };
  if (normalized >= 157.5 && normalized < 202.5) return { code: 'S', label: 'South', bearing: 180, mils };
  if (normalized >= 202.5 && normalized < 247.5) return { code: 'SW', label: 'South-West', bearing: 225, mils };
  if (normalized >= 247.5 && normalized < 292.5) return { code: 'W', label: 'West', bearing: 270, mils };
  return { code: 'NW', label: 'North-West', bearing: 315, mils };
}

/**
 * Returns a unit displacement vector (dx, dy) in world space for a given compass bearing.
 */
export function getBearingUnitVector(bearingDeg: number): Vector2D {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad),
    y: -Math.cos(rad),
  };
}

export interface ParsedCompassIntent {
  bearing: number;
  cardinal: string;
  vector: Vector2D;
  distancePx?: number;
  rawMatched: string;
}

/**
 * Parses distance from a snippet of text and converts to simulation world pixels (1px = 5m).
 */
function extractDistanceInPixels(str: string): number | undefined {
  const distRegex = /(\d+(?:\.\d+)?)\s*(m(?:eters?)?|km|kilo(?:meters?)?|px|pixels?|yards?|yds?)?\b/i;
  const match = distRegex.exec(str);
  if (!match) return undefined;

  const val = parseFloat(match[1]);
  const unit = (match[2] || 'm').toLowerCase();

  if (unit.startsWith('km')) {
    return (val * 1000) / 5; // 1km = 1000m = 200px
  } else if (unit.startsWith('px')) {
    return val;
  } else if (unit.startsWith('yard') || unit.startsWith('yd')) {
    return (val * 0.9144) / 5; // 1 yard = 0.9144m
  }
  return val / 5; // default meters (1px = 5m)
}

/**
 * Analyzes operational dispatch text for cardinal directions or explicit compass bearings.
 * Examples:
 * - "advance North", "march due East", "head southwards", "push north-east"
 * - "advance 400m North", "march 1km east", "retreat 200m south"
 * - "on bearing 090", "heading 045 degrees", "azimuth 180"
 * - "on bearing 090 for 500m", "bearing 045 for 1.2km"
 */
export function parseCompassDirection(text: string): ParsedCompassIntent | null {
  if (!text) return null;
  const t = text.toLowerCase();

  // 1. Explicit azimuth / bearing in degrees: e.g. "bearing 090", "heading 45 degrees", "azimuth 180", "course 270"
  const bearingMatch = /\b(?:bearing|azimuth|heading|course)\s*(?:of)?\s*([0-9]{1,3})\s*(?:deg(?:rees)?)?\b/i.exec(t);
  if (bearingMatch) {
    const rawVal = parseInt(bearingMatch[1], 10);
    const bearing = ((rawVal % 360) + 360) % 360;
    const card = getCardinalDirection(bearing);

    // Look for distance anywhere in the text or after "for ...", "distance ...", or within 30 chars
    let distancePx: number | undefined = undefined;
    const forDistMatch = /\b(?:for|distance|range|advance|march|push)\s+(\d+(?:\.\d+)?\s*(?:m|km|kilo(?:meters?)?|px|yards?|yds?)?)\b/i.exec(t);
    if (forDistMatch) {
      distancePx = extractDistanceInPixels(forDistMatch[1]);
    } else {
      // General window search around bearing match
      const windowStr = t.slice(Math.max(0, bearingMatch.index - 25), Math.min(t.length, bearingMatch.index + bearingMatch[0].length + 35));
      distancePx = extractDistanceInPixels(windowStr);
    }

    return {
      bearing,
      cardinal: card.code,
      vector: getBearingUnitVector(bearing),
      distancePx,
      rawMatched: bearingMatch[0],
    };
  }

  // 2. Cardinal keywords with optional distance:
  // e.g. "300m north", "500 meters to the east", "1km north-west", "advance due south"
  const cardinalPatterns: Array<{
    regex: RegExp;
    bearing: number;
    cardinal: string;
  }> = [
    // 16-point cardinals
    { regex: /\b(?:due\s+)?north[\s-]*north[\s-]*east\b|\bnne\b/i, bearing: 22.5, cardinal: 'NNE' },
    { regex: /\b(?:due\s+)?east[\s-]*north[\s-]*east\b|\bene\b/i, bearing: 67.5, cardinal: 'ENE' },
    { regex: /\b(?:due\s+)?east[\s-]*south[\s-]*east\b|\bese\b/i, bearing: 112.5, cardinal: 'ESE' },
    { regex: /\b(?:due\s+)?south[\s-]*south[\s-]*east\b|\bsse\b/i, bearing: 157.5, cardinal: 'SSE' },
    { regex: /\b(?:due\s+)?south[\s-]*south[\s-]*west\b|\bssw\b/i, bearing: 202.5, cardinal: 'SSW' },
    { regex: /\b(?:due\s+)?west[\s-]*south[\s-]*west\b|\bwsw\b/i, bearing: 247.5, cardinal: 'WSW' },
    { regex: /\b(?:due\s+)?west[\s-]*north[\s-]*west\b|\bwnw\b/i, bearing: 292.5, cardinal: 'WNW' },
    { regex: /\b(?:due\s+)?north[\s-]*north[\s-]*west\b|\bnnw\b/i, bearing: 337.5, cardinal: 'NNW' },
    // 8-point cardinals
    { regex: /\b(?:due\s+)?north[\s-]*east(?:ward|wards)?\b|\bne\b/i, bearing: 45, cardinal: 'NE' },
    { regex: /\b(?:due\s+)?north[\s-]*west(?:ward|wards)?\b|\bnw\b/i, bearing: 315, cardinal: 'NW' },
    { regex: /\b(?:due\s+)?south[\s-]*east(?:ward|wards)?\b|\bse\b/i, bearing: 135, cardinal: 'SE' },
    { regex: /\b(?:due\s+)?south[\s-]*west(?:ward|wards)?\b|\bsw\b/i, bearing: 225, cardinal: 'SW' },
    { regex: /\b(?:due\s+)?north(?:ward|wards|ern)?\b/i, bearing: 0, cardinal: 'N' },
    { regex: /\b(?:due\s+)?south(?:ward|wards|ern)?\b/i, bearing: 180, cardinal: 'S' },
    { regex: /\b(?:due\s+)?east(?:ward|wards|ern)?\b/i, bearing: 90, cardinal: 'E' },
    { regex: /\b(?:due\s+)?west(?:ward|wards|ern)?\b/i, bearing: 270, cardinal: 'W' },
  ];

  for (const item of cardinalPatterns) {
    const match = item.regex.exec(t);
    if (match) {
      // Check if preceded or followed by distance (e.g. "400m north" or "north 400m" or "north for 500m")
      const windowStr = t.slice(Math.max(0, match.index - 25), Math.min(t.length, match.index + match[0].length + 25));
      const distancePx = extractDistanceInPixels(windowStr);

      return {
        bearing: Math.round(item.bearing),
        cardinal: item.cardinal,
        vector: getBearingUnitVector(item.bearing),
        distancePx,
        rawMatched: match[0],
      };
    }
  }

  return null;
}

// ============================================================================
// 2. PRECISION CURVED ARC PATHFINDING GENERATOR
// ============================================================================

export interface ArcManeuverOptions {
  direction?: 'left' | 'right' | 'north' | 'south' | 'east' | 'west' | 'ne' | 'nw' | 'se' | 'sw' | 'around';
  amplitudeType?: 'wide' | 'shallow' | 'standard';
  landmarkCenter?: Vector2D;
  landmarkName?: string;
  steps?: number;
}

export interface ArcPathResult {
  isArc: boolean;
  waypoints: Vector2D[];
  curveControl?: Vector2D;
  arcDescription?: string;
  amplitudePx?: number;
  finalHeading?: number;
}

/**
 * Checks if the dispatch explicitly demands a straight direct line.
 * If true, overrides any curved behaviors to ensure fast direct march.
 */
export function isExplicitStraightLine(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('straight') ||
    t.includes('direct') ||
    t.includes('direct line') ||
    t.includes('straight line') ||
    t.includes('beeline') ||
    t.includes('at the double straight') ||
    t.includes('direct route')
  );
}

/**
 * Analyzes operational dispatch text to determine whether an arc maneuver was requested,
 * what curvature/amplitude was specified, and which lateral or compass direction the arc should sweep towards.
 */
export function extractArcOptions(
  text: string,
  _start: Vector2D,
  _destination: Vector2D,
  landmarks: TacticalLandmarkContext[] = []
): { hasArc: boolean; options: ArcManeuverOptions } {
  const t = text.toLowerCase();

  // If commander explicitly stated straight/direct, honor it immediately!
  if (isExplicitStraightLine(t)) {
    return { hasArc: false, options: {} };
  }

  // Check for arc/curved movement keywords
  const arcKeywords = [
    'arc',
    'curved',
    'curve',
    'sweep',
    'sweeping',
    'wheel',
    'wheeling',
    'hook',
    'flank around',
    'skirt around',
    'contour around',
    'bypass around',
    'circle around',
  ];

  const hasArcKeyword = arcKeywords.some((kw) => t.includes(kw));
  if (!hasArcKeyword) {
    return { hasArc: false, options: {} };
  }

  // 1. Determine Amplitude
  let amplitudeType: 'wide' | 'shallow' | 'standard' = 'standard';
  if (
    t.includes('wide arc') ||
    t.includes('wide hook') ||
    t.includes('wide sweep') ||
    t.includes('wide flanking') ||
    t.includes('broad arc') ||
    t.includes('deep arc')
  ) {
    amplitudeType = 'wide';
  } else if (
    t.includes('shallow arc') ||
    t.includes('gentle arc') ||
    t.includes('slight arc') ||
    t.includes('subtle arc') ||
    t.includes('minor arc')
  ) {
    amplitudeType = 'shallow';
  }

  // 2. Determine Direction
  let direction: ArcManeuverOptions['direction'] = undefined;

  // Check explicit compass arc: e.g. "arc to the north", "sweep east", "wheel south"
  if (t.includes('north-east') || t.includes('ne')) direction = 'ne';
  else if (t.includes('north-west') || t.includes('nw')) direction = 'nw';
  else if (t.includes('south-east') || t.includes('se')) direction = 'se';
  else if (t.includes('south-west') || t.includes('sw')) direction = 'sw';
  else if (t.includes('north') || t.includes('northern')) direction = 'north';
  else if (t.includes('south') || t.includes('southern')) direction = 'south';
  else if (t.includes('east') || t.includes('eastern')) direction = 'east';
  else if (t.includes('west') || t.includes('western')) direction = 'west';
  // Check lateral left / right
  else if (t.includes('left') || t.includes('counter-clockwise') || t.includes('ccw')) direction = 'left';
  else if (t.includes('right') || t.includes('clockwise') || t.includes('cw')) direction = 'right';

  // 3. Check if arcing around a specific landmark (e.g. "around the ponds", "around Sokolnitz", "around Santon")
  let landmarkCenter: Vector2D | undefined = undefined;
  let landmarkName: string | undefined = undefined;

  for (const lm of landmarks) {
    const cleanLm = lm.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const tokens = cleanLm.split(' ').filter((tk) => tk.length >= 4);
    for (const tk of tokens) {
      if (t.includes(`around ${tk}`) || t.includes(`around the ${tk}`) || t.includes(`skirt ${tk}`)) {
        landmarkCenter = lm.position;
        landmarkName = lm.name;
        if (!direction) direction = 'around';
        break;
      }
    }
    if (landmarkCenter) break;
  }

  // Check pond keywords directly
  if (!landmarkCenter && (t.includes('ponds') || t.includes('lake') || t.includes('pond'))) {
    const lakeLm = landmarks.find((l) => l.name.toLowerCase().includes('pond') || l.name.toLowerCase().includes('lake') || l.name.toLowerCase().includes('satchan'));
    if (lakeLm) {
      landmarkCenter = lakeLm.position;
      landmarkName = lakeLm.name;
      if (!direction) direction = 'around';
    }
  }

  return {
    hasArc: true,
    options: {
      direction,
      amplitudeType,
      landmarkCenter,
      landmarkName,
    },
  };
}

/**
 * Generates high-fidelity curved arc waypoints and Bezier control point based on commander's instructions.
 * If no arc is requested, returns empty waypoints (straight line for maximum speed).
 */
export function generateArcPath(
  start: Vector2D,
  destination: Vector2D,
  options: ArcManeuverOptions = {}
): ArcPathResult {
  const dx = destination.x - start.x;
  const dy = destination.y - start.y;
  const dist = Math.hypot(dx, dy);

  // If distance is too small, a straight line is required
  if (dist < 25) {
    return {
      isArc: false,
      waypoints: [],
      finalHeading: Math.atan2(dy, dx),
    };
  }

  // Tangent unit vector along straight path
  const ux = dx / dist;
  const uy = dy / dist;

  // Left perpendicular normal (rotated 90° CCW): (-uy, ux)
  const leftNormal: Vector2D = { x: -uy, y: ux };
  // Right perpendicular normal (rotated 90° CW): (uy, -ux)
  const rightNormal: Vector2D = { x: uy, y: -ux };

  // Calculate amplitude (deflection distance perpendicular to straight march)
  let amplitude = dist * 0.26; // Standard 26% of route length
  if (options.amplitudeType === 'wide') {
    amplitude = Math.max(120, Math.min(480, dist * 0.44));
  } else if (options.amplitudeType === 'shallow') {
    amplitude = Math.max(35, Math.min(100, dist * 0.14));
  } else {
    amplitude = Math.max(65, Math.min(240, dist * 0.26));
  }

  // Determine chosen normal vector based on requested direction
  let chosenNormal: Vector2D = leftNormal;
  let dirLabel = 'to the flank';

  if (options.direction === 'left') {
    chosenNormal = leftNormal;
    dirLabel = 'to the left';
  } else if (options.direction === 'right') {
    chosenNormal = rightNormal;
    dirLabel = 'to the right';
  } else if (
    options.direction === 'north' ||
    options.direction === 'south' ||
    options.direction === 'east' ||
    options.direction === 'west' ||
    options.direction === 'ne' ||
    options.direction === 'nw' ||
    options.direction === 'se' ||
    options.direction === 'sw'
  ) {
    // Project both candidate normals onto target compass vector and choose the one pointing closest
    const compassBearingMap: Record<string, number> = {
      north: 0,
      ne: 45,
      east: 90,
      se: 135,
      south: 180,
      sw: 225,
      west: 270,
      nw: 315,
    };
    const targetBearing = compassBearingMap[options.direction] ?? 0;
    const targetVec = getBearingUnitVector(targetBearing);

    const dotLeft = leftNormal.x * targetVec.x + leftNormal.y * targetVec.y;
    const dotRight = rightNormal.x * targetVec.x + rightNormal.y * targetVec.y;

    if (dotRight > dotLeft) {
      chosenNormal = rightNormal;
    } else {
      chosenNormal = leftNormal;
    }
    dirLabel = `to the ${options.direction.toUpperCase()}`;
  } else if (options.direction === 'around' && options.landmarkCenter) {
    // Cross product of straight path with vector from start to landmark
    // (ux * dy_lm - uy * dx_lm) indicates which side the obstacle is on
    const lmDx = options.landmarkCenter.x - start.x;
    const lmDy = options.landmarkCenter.y - start.y;
    const cross = ux * lmDy - uy * lmDx;

    // If landmark is to the right (cross > 0), arc around the left or push outside
    if (cross > 0) {
      chosenNormal = rightNormal; // Bend around it on the outer side
    } else {
      chosenNormal = leftNormal;
    }
    dirLabel = `around ${options.landmarkName || 'obstacle'}`;
  } else {
    // Default outward arc: bend away from the center of the battlefield (x: 1000, y: 750)
    const midX = (start.x + destination.x) / 2;
    const midY = (start.y + destination.y) / 2;
    const toCenter = { x: 1000 - midX, y: 750 - midY };
    const dotLeft = leftNormal.x * toCenter.x + leftNormal.y * toCenter.y;
    // Choose normal pointing away from center (negative dot product)
    chosenNormal = dotLeft < 0 ? leftNormal : rightNormal;
    dirLabel = 'in a tactical curved arc';
  }

  // Quadratic/Cubic Bezier Control Point
  const midPoint: Vector2D = {
    x: (start.x + destination.x) / 2,
    y: (start.y + destination.y) / 2,
  };

  const curveControl: Vector2D = {
    x: Math.max(40, Math.min(2360, midPoint.x + chosenNormal.x * amplitude)),
    y: Math.max(40, Math.min(1460, midPoint.y + chosenNormal.y * amplitude)),
  };

  // Generate intermediate waypoints along the smooth Bezier curve
  const steps = options.steps || 12;
  const waypoints: Vector2D[] = [];

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    // Quadratic Bezier interpolation: B(t) = (1-t)^2 P0 + 2(1-t)t Pctrl + t^2 P1
    const x = inv * inv * start.x + 2 * inv * t * curveControl.x + t * t * destination.x;
    const y = inv * inv * start.y + 2 * inv * t * curveControl.y + t * t * destination.y;
    waypoints.push({
      x: Math.round(x),
      y: Math.round(y),
    });
  }

  // Final destination
  waypoints.push({ ...destination });

  // Compute final arriving heading tangent
  const lastWp = waypoints[waypoints.length - 2] || curveControl;
  const finalHeading = Math.atan2(destination.y - lastWp.y, destination.x - lastWp.x);

  const arcDescription = `${options.amplitudeType === 'wide' ? 'Wide' : options.amplitudeType === 'shallow' ? 'Shallow' : 'Curved'} arc ${dirLabel}`;

  return {
    isArc: true,
    waypoints,
    curveControl,
    arcDescription,
    amplitudePx: Math.round(amplitude),
    finalHeading,
  };
}
