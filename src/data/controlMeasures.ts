import { OperationalGraphic } from '../types/game';

// French operations overlay for the morning of 2 December 1805, in map pixels (1 px = 5 m).
// Boundaries are listed west to east, so "left" is the north side of the line.

// Traced from the streams on the base map (renderHydrology, scaled to map pixels)
const GOLDBACH = [
  { x: 1058, y: 0 }, { x: 1052, y: 85 }, { x: 1044, y: 173 }, { x: 1035, y: 263 }, { x: 1026, y: 354 },
  { x: 1018, y: 445 }, { x: 1013, y: 533 }, { x: 1019, y: 591 }, { x: 1031, y: 647 }, { x: 1043, y: 701 },
  { x: 1052, y: 756 }, { x: 1056, y: 812 }, { x: 1050, y: 870 }, { x: 1032, y: 930 }, { x: 1009, y: 989 },
  { x: 983, y: 1048 }, { x: 959, y: 1106 }, { x: 938, y: 1161 }, { x: 923, y: 1215 }, { x: 910, y: 1261 },
  { x: 894, y: 1307 }, { x: 877, y: 1355 }, { x: 859, y: 1403 }, { x: 841, y: 1451 }, { x: 825, y: 1500 },
];

const LITTAWA = [
  { x: 2340, y: 0 }, { x: 2319, y: 140 }, { x: 2299, y: 274 }, { x: 2281, y: 403 }, { x: 2263, y: 529 },
  { x: 2246, y: 652 }, { x: 2228, y: 773 }, { x: 2204, y: 894 }, { x: 2172, y: 1013 }, { x: 2134, y: 1131 },
  { x: 2090, y: 1250 }, { x: 2043, y: 1372 }, { x: 1995, y: 1500 },
];

// Crest of the Pratzen plateau, Blasowitz heights to the Satschan ponds
const PRATZEN_CREST = [
  { x: 1700, y: 120 }, { x: 1650, y: 300 }, { x: 1610, y: 450 }, { x: 1590, y: 585 }, { x: 1510, y: 720 },
  { x: 1440, y: 880 }, { x: 1360, y: 1060 }, { x: 1290, y: 1260 }, { x: 1240, y: 1500 },
];

export const AUSTERLITZ_CONTROL_MEASURES: OperationalGraphic[] = [
  {
    id: 'bdy_v_i',
    type: 'boundary',
    name: 'V / I Corps',
    faction: 'french',
    echelon: 'XXX',
    leftUnit: 'V',
    rightUnit: 'I',
    color: '#1c1917',
    points: [{ x: 200, y: 430 }, { x: 1000, y: 430 }, { x: 1300, y: 420 }, { x: 1500, y: 390 }, { x: 1700, y: 340 }, { x: 2000, y: 320 }, { x: 2400, y: 310 }],
  },
  {
    id: 'bdy_i_iv',
    type: 'boundary',
    name: 'I / IV Corps',
    faction: 'french',
    echelon: 'XXX',
    leftUnit: 'I',
    rightUnit: 'IV',
    color: '#1c1917',
    points: [{ x: 200, y: 545 }, { x: 1100, y: 545 }, { x: 1250, y: 525 }, { x: 1500, y: 500 }, { x: 1800, y: 470 }, { x: 2400, y: 440 }],
  },
  {
    id: 'bdy_iv_iii',
    type: 'boundary',
    name: 'IV / III Corps',
    faction: 'french',
    echelon: 'XXX',
    leftUnit: 'IV',
    rightUnit: 'III',
    color: '#1c1917',
    points: [{ x: 200, y: 1085 }, { x: 900, y: 1085 }, { x: 1300, y: 1110 }, { x: 1800, y: 1140 }, { x: 2400, y: 1170 }],
  },
  { id: 'pl_goldbach', type: 'phase_line', name: 'PL GOLDBACH', faction: 'french', color: '#1c1917', points: GOLDBACH },
  { id: 'pl_pratzen', type: 'phase_line', name: 'PL PRATZEN', faction: 'french', color: '#1c1917', points: PRATZEN_CREST },
  { id: 'pl_littawa', type: 'phase_line', name: 'PL LITTAWA', role: 'LOA', faction: 'french', color: '#1c1917', points: LITTAWA },
  {
    id: 'fscl',
    type: 'fscl',
    name: 'FSCL',
    faction: 'french',
    color: '#c2410c',
    points: [{ x: 1960, y: 0 }, { x: 1910, y: 450 }, { x: 1870, y: 900 }, { x: 1780, y: 1500 }],
  },
  { id: 'obj_pratzen', type: 'objective', name: 'OBJ PRATZEN', faction: 'french', color: '#1c1917', points: [{ x: 1500, y: 720 }] },
  { id: 'obj_vinohrady', type: 'objective', name: 'OBJ VINOHRADY', faction: 'french', color: '#1c1917', points: [{ x: 1590, y: 585 }] },
  { id: 'obj_blasowitz', type: 'objective', name: 'OBJ BLASOWITZ', faction: 'french', color: '#1c1917', points: [{ x: 1620, y: 420 }] },
];
