import { Vector2D } from '../types/game';

// Map projection: 200 world px = 1 km. The sheet sits in MGRS grid zone 33U, 100 km square XQ
// (the Brno–Austerlitz area). World (0, 0) is the NW sheet corner at easting 30 km, northing 52 km.
export const PX_PER_KM = 200;
export const GRID_ZONE = '33U';
export const GRID_SQUARE = 'XQ';
const ORIGIN_EASTING_KM = 30;
const ORIGIN_NORTHING_KM = 52;

export function eastingKm(x: number): number {
  return ORIGIN_EASTING_KM + x / PX_PER_KM;
}

export function northingKm(y: number): number {
  return ORIGIN_NORTHING_KM - y / PX_PER_KM;
}

// Two-digit kilometre label for a grid line, as printed on the sheet margin
export function gridLineLabel(km: number): string {
  return String(Math.round(((km % 100) + 100) % 100)).padStart(2, '0');
}

// 6-figure grid reference (100 m precision), e.g. "XQ 341 498"
export function toGridRef(pos: Vector2D, withSquare = true): string {
  const e = Math.floor(eastingKm(pos.x) * 10);
  const n = Math.floor(northingKm(pos.y) * 10);
  const fmt = (v: number) => String(((v % 1000) + 1000) % 1000).padStart(3, '0');
  return `${withSquare ? `${GRID_SQUARE} ` : ''}${fmt(e)} ${fmt(n)}`;
}

export function distanceMetres(a: Vector2D, b: Vector2D): number {
  return (Math.hypot(b.x - a.x, b.y - a.y) / PX_PER_KM) * 1000;
}

// Grid bearing in degrees (0 = grid north, clockwise)
export function gridBearing(a: Vector2D, b: Vector2D): number {
  const deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
}

// 6400-mil NATO angular measure
export function degreesToMils(deg: number): number {
  return Math.round((deg / 360) * 6400) % 6400;
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
