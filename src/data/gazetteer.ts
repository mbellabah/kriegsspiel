// Named places on the Austerlitz sheet. Coordinates are in the 1600x1000 cartography space used by
// the base-map renderer; multiply by 1.5 for map pixels (see toMapPixels).
export interface Settlement {
  name: string;
  x: number;
  y: number;
  isMajor?: boolean;
  hasChurch?: boolean;
  hasMill?: boolean;
  hasChateau?: boolean;
}

export const SETTLEMENTS: Settlement[] = [
  { name: 'BRÜNN', x: 250, y: 80, isMajor: true },
  { name: 'Latain', x: 500, y: 265 },
  { name: 'Kritschen', x: 720, y: 115 },
  { name: 'Bosenitz', x: 920, y: 190, hasChurch: true },
  { name: 'Posoritz', x: 1220, y: 160 },
  { name: 'Raussnitz', x: 1320, y: 105 },
  { name: 'Turas', x: 445, y: 440, hasChurch: true },
  { name: 'Marxdorf', x: 520, y: 480 },
  { name: 'Schlappanitz', x: 710, y: 380, hasChurch: true },
  { name: 'Puntowitz', x: 800, y: 440, hasMill: true },
  { name: 'Kobelnitz', x: 690, y: 490, hasMill: true, hasChurch: true },
  { name: 'Pratzen', x: 915, y: 520, hasChurch: true },
  { name: 'Krzenowitz', x: 1150, y: 510, hasChurch: true },
  { name: 'Holubitz', x: 1220, y: 320 },
  { name: 'Blasowitz', x: 1080, y: 280, hasChurch: true },
  { name: 'Jirschikowitz', x: 840, y: 310 },
  { name: 'Walspitz', x: 1300, y: 260 },
  { name: 'Sokolnitz', x: 640, y: 660, hasChateau: true, hasChurch: true, hasMill: true },
  { name: 'Telnitz', x: 610, y: 810, hasChurch: true },
  { name: 'Aujest', x: 870, y: 745, hasChurch: true },
  { name: 'Hostieradek', x: 980, y: 700 },
  { name: 'Birnbaum', x: 1260, y: 630 },
  { name: 'Raigern', x: 120, y: 855 },
  { name: 'Satschan', x: 730, y: 935 },
  { name: 'Menitz', x: 530, y: 935 },
  { name: 'AUSTERLITZ', x: 1540, y: 420, isMajor: true, hasChateau: true },
];

export const HEIGHTS = [
  { name: 'Santon', elev: 320, x: 890, y: 155 },
  { name: 'Žuráň', elev: 280, x: 720, y: 250 },
  { name: 'Staré Vinohrady', elev: 300, x: 1060, y: 390 },
  { name: 'Pratzeberg', elev: 285, x: 1000, y: 490 },
  { name: 'Hostieradek', elev: 275, x: 980, y: 700 },
  { name: 'Turas', elev: 235, x: 380, y: 420 },
];

/** Every named place in map pixels, for order parsing. */
export const PLACE_NAMES: { name: string; position: { x: number; y: number }; type: string }[] = [
  ...SETTLEMENTS.map((s) => ({ name: s.name.charAt(0) + s.name.slice(1).toLowerCase(), position: { x: s.x * 1.5, y: s.y * 1.5 }, type: 'village' })),
  ...HEIGHTS.map((h) => ({ name: `${h.name} Hill`, position: { x: h.x * 1.5, y: h.y * 1.5 }, type: 'hill' })),
];
