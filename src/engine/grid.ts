import { Vector2D } from '../types/game';

// MGRS presentation for the battlefield. The field around Austerlitz lies in UTM zone 33U,
// 100 km square XQ. Map pixels are 5 m; the sheet's north-west corner is anchored at XQ 16000 55000.
export const GZD = '33U';
export const SQUARE = 'XQ';
const ORIGIN_E = 16000;
const ORIGIN_N = 55000;
const M_PER_PX = 5;

export function toEastingNorthing(p: Vector2D): { e: number; n: number } {
  return { e: ORIGIN_E + p.x * M_PER_PX, n: ORIGIN_N - p.y * M_PER_PX };
}

/** "XQ 1834 5172" (8-digit, 10 m) or "XQ 183 517" (6-digit, 100 m). */
export function toMgrs(p: Vector2D, digits: 6 | 8 | 10 = 8, withZone = false): string {
  const { e, n } = toEastingNorthing(p);
  const div = digits === 6 ? 100 : digits === 8 ? 10 : 1;
  const len = digits / 2;
  const fmt = (v: number) => String(Math.max(0, Math.round(v / div))).padStart(len, '0').slice(-len);
  return `${withZone ? GZD + ' ' : ''}${SQUARE} ${fmt(e)} ${fmt(n)}`;
}

/** Two-digit kilometre grid labels for the sheet margin. */
export function eastingKm(x: number): string {
  return String(Math.round((ORIGIN_E + x * M_PER_PX) / 1000)).padStart(2, '0');
}
export function northingKm(y: number): string {
  return String(Math.round((ORIGIN_N - y * M_PER_PX) / 1000)).padStart(2, '0');
}

const MGRS_RE = /\b(?:33U\s*)?XQ\s*(\d{3,5})\s*(\d{3,5})\b/i;

/** Parses an MGRS reference in this square ("XQ 1834 5172", "33UXQ183517") into map pixels. */
export function parseMgrs(text: string): Vector2D | null {
  const m = MGRS_RE.exec(text);
  if (!m || m[1].length !== m[2].length) return null;
  const scale = Math.pow(10, 5 - m[1].length);
  const e = parseInt(m[1], 10) * scale + scale / 2;
  const n = parseInt(m[2], 10) * scale + scale / 2;
  return { x: (e - ORIGIN_E) / M_PER_PX, y: (ORIGIN_N - n) / M_PER_PX };
}

/** Rewrites every MGRS reference in free text as map coordinates "(x, y)" for the order parsers. */
export function normalizeGridRefs(text: string): string {
  return text.replace(new RegExp(MGRS_RE.source, 'gi'), (match) => {
    const p = parseMgrs(match);
    return p ? `(${Math.round(p.x)}, ${Math.round(p.y)})` : match;
  });
}
