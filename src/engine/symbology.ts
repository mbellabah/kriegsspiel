import { Unit } from '../types/game';

// APP-6 amplifier fields derived from scenario unit data.
// Echelon sits above the frame, the unique designation (field T) to the lower left,
// and the higher formation (field M) to the right.
export interface UnitSymbolFields {
  echelon: string;
  designation: string;
  higher: string;
  isHQ: boolean;
}

// APP-6 standard identity fills (light-background palette)
export const APP6_FRIEND_FILL = '#80e0ff';
export const APP6_HOSTILE_FILL = '#ff8080';
export const APP6_FRAME = '#000000';

const DESIGNATION_OVERRIDES: Record<string, string> = {
  fr_napoleon: 'Napoléon',
  fr_artillery_santon: 'Santon',
  fr_artillery_guard: 'Gd Horse',
  fr_supply_1: 'Ammo Park',
  al_alexander: 'Allied HQ',
  al_constantine: 'Constantine',
  al_guard_cav: 'Chev-Gardes',
  al_artillery_pratzen: 'Pratzen',
  al_artillery_raussnitz: 'Raussnitz',
  al_artillery_krenowitz: 'Krenowitz',
  al_supply_1: 'Baggage',
};

const ARMY_HQ_IDS = new Set(['fr_napoleon', 'al_alexander', 'al_kutusov']);

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/(\s|-)/)
    .map((w) => (w.length > 0 && w !== '-' && w.trim() ? w[0].toUpperCase() + w.slice(1) : w))
    .join('');

function deriveDesignation(unit: Unit): string {
  const override = DESIGNATION_OVERRIDES[unit.id];
  if (override) return override;
  const base = unit.name.split('(')[0].replace(/\b(HQ|BATTERY)\b/g, '').trim();
  const words = titleCase(base).split(' ');
  return words.join(' ').length > 12 ? words[0] : words.join(' ');
}

function deriveHigher(unit: Unit): string {
  const corps = unit.corps;
  const roman = corps.match(/^([IVX]+) Corps/);
  if (roman) return roman[1];
  const column = corps.match(/^(\d)(?:st|nd|rd|th) Column/);
  if (column) return `${column[1]} Col`;
  if (/Guard/.test(corps)) return 'Gd';
  if (/Cavalry Reserve/.test(corps)) return 'Res Cav';
  if (/Advance Guard/.test(corps)) return 'Adv Gd';
  if (/Left Wing/.test(corps)) return 'L Wing';
  if (/Grand Quartier/.test(corps)) return 'GQG';
  if (/Allied/.test(corps)) return 'AHQ';
  return '';
}

function deriveEchelon(unit: Unit, isHQ: boolean): string {
  const qualifier = (unit.name.match(/\(([^)]*)\)/)?.[1] || '').toLowerCase();
  if (ARMY_HQ_IDS.has(unit.id)) return 'XXXX';
  if (isHQ) return 'XXX';
  if (unit.type === 'artillery' || unit.type === 'supply') return 'II';
  if (qualifier.includes('brigade')) return 'X';
  if (qualifier.includes('cavalry corps')) return 'XXX';
  if (qualifier.includes('column') && unit.type !== 'cavalry') return 'XXX';
  return 'XX';
}

const cache = new Map<string, UnitSymbolFields>();

export function getUnitSymbolFields(unit: Unit): UnitSymbolFields {
  const cached = cache.get(unit.id);
  if (cached) return cached;
  const isHQ = unit.type === 'headquarters' || /\bHQ\b/.test(unit.name);
  const fields: UnitSymbolFields = {
    echelon: deriveEchelon(unit, isHQ),
    designation: deriveDesignation(unit),
    higher: deriveHigher(unit),
    isHQ,
  };
  cache.set(unit.id, fields);
  return fields;
}

// Combat effectiveness colour for the operational-condition bar beneath the frame
export function conditionColor(strengthRatio: number): string {
  if (strengthRatio >= 0.85) return '#16a34a';
  if (strengthRatio >= 0.7) return '#eab308';
  if (strengthRatio >= 0.5) return '#dc2626';
  return '#111111';
}

// Single most important status code shown beside the symbol
export function primaryStatusCode(unit: Unit): { code: string; severe: boolean } | null {
  const ammoRatio = unit.maxAmmo > 0 ? unit.ammo / unit.maxAmmo : 1;
  if (unit.status === 'routing') return { code: 'RTG', severe: true };
  if (unit.isEncircled) return { code: 'ISOL', severe: true };
  if (unit.maxAmmo > 0 && unit.ammo <= 0) return { code: 'AMMO 0', severe: true };
  if (unit.status === 'wavering' || (unit.morale <= 50 && unit.morale > 25)) return { code: 'WVR', severe: true };
  if (unit.status === 'melee') return { code: 'CC', severe: false };
  if (unit.status === 'charging') return { code: 'CHG', severe: false };
  if (ammoRatio < 0.2) return { code: 'AMMO', severe: true };
  if (unit.status === 'entrenching') return { code: 'DIG', severe: false };
  if (unit.currentOrder?.type === 'bombard' && unit.currentOrder.status === 'executing') return { code: 'FIRE', severe: false };
  if (unit.currentOrder?.status === 'delivering') return { code: 'ORD', severe: false };
  return null;
}
