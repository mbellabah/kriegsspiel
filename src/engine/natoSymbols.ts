import { Unit } from '../types/game';

// Shared cartographic palette & typography for the light topographic sheet.
export const MAP = {
  paper: '#f5f2ea',
  ink: '#1c1917',
  inkMuted: '#57534e',
  halo: 'rgba(250, 248, 242, 0.92)',
  grid: 'rgba(37, 99, 235, 0.16)',
  gridLabel: '#1e3a8a',
  contour: 'rgba(146, 92, 46, 0.42)',
  contourIndex: 'rgba(120, 72, 32, 0.78)',
  contourLabel: '#7c4a1e',
  water: '#2f6fb3',
  waterFill: 'rgba(170, 205, 235, 0.55)',
  woods: 'rgba(150, 190, 135, 0.42)',
  woodsEdge: 'rgba(70, 110, 60, 0.7)',
  builtUp: 'rgba(196, 128, 104, 0.30)',
  building: '#3f3a36',
  // APP-6 standard identity fills (light) with black frames
  friendFill: '#80e0ff',
  hostileFill: '#ff8080',
  friendLine: '#0b5ea8',
  hostileLine: '#c2272d',
  amber: '#d97706',
  select: '#f59e0b',
};

export const FONT = {
  label: '"IBM Plex Sans Condensed", "Arial Narrow", Arial, sans-serif',
  sans: '"IBM Plex Sans", Arial, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  carto: '"IBM Plex Serif", Georgia, serif',
};

export const font = (weight: number, size: number, family: string = FONT.label, italic = false) =>
  `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;

// Symbol frame geometry (local units, before zoom counter-scaling)
export const FRAME_W = 21;
export const FRAME_H = 14;
export const DIAMOND_R = 11.5;

export type SymbolIdentity = 'friend' | 'hostile';

/** APP-6 echelon amplifier derived from the unit's role and designation. */
export function echelonFor(unit: Unit): string {
  const n = `${unit.name} ${unit.corps}`.toLowerCase();
  if (unit.type === 'artillery') return 'I';
  if (unit.type === 'supply') return 'II';
  if (unit.type === 'headquarters') {
    if (/napoleon|kutusov|tsar|alexander|supreme/.test(n)) return 'XXXX';
    return 'XXX';
  }
  if (/brigade/.test(n)) return 'X';
  if (/corps\)/.test(unit.name.toLowerCase())) return 'XXX';
  return 'XX';
}

/** Short unique designation (field T): the commander/surname before the parenthetical. */
export function designationFor(unit: Unit): string {
  const base = unit.name
    .replace(/\s*\(.*\)\s*/, '')
    .replace('TSAR ALEXANDER I & FRANCIS II', 'ALEXANDER & FRANCIS')
    .replace('GRANDE ARMÉE', 'G.A.')
    .replace(/BAGGAGE TRAIN & DEPOT/, 'TRAINS')
    .replace(/AMMUNITION/, 'AMMO')
    .replace(/FORTIFIED/, 'FORT')
    .replace(/BATTERY/, 'BTY')
    .trim();
  return base.length > 20 ? base.slice(0, 19) + '…' : base;
}

/** Higher formation (field M): the parenthetical, compacted. */
export function higherFormationFor(unit: Unit): string {
  const m = unit.name.match(/\(([^)]*)\)/);
  const raw = m ? m[1] : unit.corps.replace(/\s*\(.*\)/, '');
  return raw
    .replace(/Division/gi, 'Div')
    .replace(/Cavalry/gi, 'Cav')
    .replace(/Column/gi, 'Col')
    .replace(/Reserve/gi, 'Res')
    .toUpperCase();
}

export function tracePathFrame(ctx: CanvasRenderingContext2D, identity: SymbolIdentity) {
  ctx.beginPath();
  if (identity === 'hostile') {
    ctx.moveTo(0, -DIAMOND_R);
    ctx.lineTo(DIAMOND_R, 0);
    ctx.lineTo(0, DIAMOND_R);
    ctx.lineTo(-DIAMOND_R, 0);
    ctx.closePath();
  } else {
    ctx.rect(-FRAME_W / 2, -FRAME_H / 2, FRAME_W, FRAME_H);
  }
}

/** Half extents of the frame's bounding box, used to place amplifiers. */
export function frameExtents(identity: SymbolIdentity) {
  return identity === 'hostile'
    ? { hw: DIAMOND_R, hh: DIAMOND_R }
    : { hw: FRAME_W / 2, hh: FRAME_H / 2 };
}

/**
 * Draws a complete APP-6 style symbol (frame, fill, icon, HQ staff, echelon) centred at the origin.
 * Callers translate/scale beforehand. Upright — never rotated with heading.
 */
export function drawUnitSymbol(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  identity: SymbolIdentity,
  opts: { fill?: string; line?: string; dashed?: boolean; showEchelon?: boolean } = {}
) {
  const fill = opts.fill ?? (identity === 'friend' ? MAP.friendFill : MAP.hostileFill);
  const line = opts.line ?? MAP.ink;
  const { hw, hh } = frameExtents(identity);

  // Frame
  tracePathFrame(ctx, identity);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'miter';
  if (opts.dashed) ctx.setLineDash([2.5, 2]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Icon — clipped to the frame like APP-6 line icons
  ctx.save();
  tracePathFrame(ctx, identity);
  ctx.clip();
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'butt';
  const iw = identity === 'hostile' ? 7.6 : FRAME_W / 2;
  const ih = identity === 'hostile' ? 7.6 : FRAME_H / 2;

  switch (unit.type) {
    case 'infantry':
    case 'guard':
      ctx.beginPath();
      ctx.moveTo(-iw, -ih); ctx.lineTo(iw, ih);
      ctx.moveTo(iw, -ih); ctx.lineTo(-iw, ih);
      ctx.stroke();
      if (unit.type === 'guard') {
        // Guard: small filled star-like pip at the crossing
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fde047';
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      break;
    case 'cavalry':
      ctx.beginPath();
      ctx.moveTo(-iw, ih); ctx.lineTo(iw, -ih);
      ctx.stroke();
      break;
    case 'artillery':
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'supply': {
      // Sustainment: horizontal bar across the lower third
      const y = ih * 0.33;
      ctx.beginPath();
      ctx.moveTo(-iw, y); ctx.lineTo(iw, y);
      ctx.stroke();
      break;
    }
    case 'headquarters':
      // Command post: flag pennant inside the frame
      ctx.beginPath();
      ctx.moveTo(-3.5, 4); ctx.lineTo(-3.5, -4.5);
      ctx.lineTo(4, -2.5); ctx.lineTo(-3.5, -0.5);
      ctx.stroke();
      break;
  }
  ctx.restore();

  // Headquarters staff: descends from the lower-left corner of the frame
  if (unit.type === 'headquarters') {
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    const sx = identity === 'hostile' ? -hw : -hw;
    const sy = identity === 'hostile' ? 0 : hh;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, hh + 9);
    ctx.stroke();
  }

  // Echelon amplifier above the frame
  if (opts.showEchelon !== false) {
    const ech = echelonFor(unit);
    ctx.font = font(700, 5.8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = line;
    ctx.fillText(ech, 0, -hh - 2);
  }
}

/** Colour ramp for strength / morale bars: green → amber → red. */
export function healthColor(ratio: number): string {
  if (ratio > 0.66) return '#15803d';
  if (ratio > 0.4) return '#ca8a04';
  if (ratio > 0.2) return '#ea580c';
  return '#b91c1c';
}

/** Draw text with a soft paper halo for legibility over terrain. */
export function haloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  haloWidth = 2.6
) {
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = MAP.halo;
  ctx.lineWidth = haloWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
