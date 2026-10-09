import { beforeAll, describe, expect, it } from 'vitest';
import { createBattle, dispatchContext, disableLanguageModel } from './helpers';
import { dispatchService, DispatchError, normalizeTimeWords, ParsedDispatchResult } from '../services/llmDispatchService';
import { toMgrs, parseMgrs, normalizeGridRefs } from '../engine/grid';
import type { BattleEngine } from '../engine/simulation';

let engine: BattleEngine;

beforeAll(() => {
  disableLanguageModel();
  engine = createBattle().engine;
});

const parse = (text: string, selected: string | null = 'fr_vandamme') =>
  dispatchService.processDispatch(text, dispatchContext(engine, selected));

const near = (p: { x: number; y: number }, x: number, y: number, tol = 30) => Math.hypot(p.x - x, p.y - y) <= tol;

interface Case {
  text: string;
  to: string;
  type: ParsedDispatchResult['orderType'];
  at?: [number, number];
  corps?: boolean;
  check?: (r: ParsedDispatchResult) => void;
}

// Each order was checked by hand against the map; places are in map pixels (1 px = 5 m)
const CASES: Case[] = [
  { text: '@Vandamme, advance to Pratzen', to: 'fr_vandamme', type: 'march', at: [1370, 780] },
  { text: '@Soult, IV Corps attack the Pratzen Heights', to: 'fr_soult', type: 'assault', corps: true },
  { text: '@Legrand hold Sokolnitz', to: 'fr_legrand', type: 'hold', at: [960, 990] },
  { text: '@Friant forced march to Telnitz', to: 'fr_friant', type: 'march', at: [915, 1215], check: (r) => expect(r.isForcedMarch).toBe(true) },
  { text: '@St-Hilaire advance to XQ 2285 5110', to: 'fr_sthilaire', type: 'march', at: [1371, 779] },
  { text: '@Murat charge the enemy at Blasowitz', to: 'fr_murat', type: 'charge' },
  {
    text: '@Lannes hold Santon until 09:00 then advance to Bosenitz',
    to: 'fr_lannes',
    type: 'hold',
    at: [1335, 232],
    check: (r) => {
      expect(r.endTime).toBe(120);
      expect(r.chainedOrder?.type).toBe('march');
    },
  },
  { text: '@Davout at 08:30 advance to Sokolnitz', to: 'fr_davout', type: 'march', at: [960, 990], check: (r) => expect(r.startTime).toBe(90) },
  { text: '@Suchet if attacked, form square', to: 'fr_suchet', type: 'hold', check: (r) => expect(r.condition?.contingencyAction).toBe('square') },
  { text: '@Vandamme advance on bearing 090° (E, 1600 mils) for 750m', to: 'fr_vandamme', type: 'march', check: (r) => expect(r.durationMinutes).toBeUndefined() },
  { text: 'Santon battery, fire on TRP 03', to: 'fr_artillery_santon', type: 'bombard', at: [1500, 735] },
  { text: '@Bernadotte move to (1300, 650)', to: 'fr_bernadotte', type: 'march', at: [1300, 650] },
  { text: '@Oudinot entrench at Zuran', to: 'fr_oudinot', type: 'entrench', at: [1080, 375] },
  { text: '@Caffarelli withdraw to Schlappanitz', to: 'fr_caffarelli', type: 'retreat', at: [1065, 570] },
  { text: 'advance to Pratzen', to: 'fr_vandamme', type: 'march', at: [1370, 780] },
  { text: '@Legrand lay smoke on Telnitz', to: 'fr_legrand', type: 'bombard', check: (r) => expect(r.isSmokeMission).toBe(true) },
  { text: '@Davout, III Corps advance to Telnitz', to: 'fr_davout', type: 'march', corps: true, at: [915, 1215] },
  { text: '@Murat fall back', to: 'fr_murat', type: 'retreat' },
  {
    text: '@Soult hold Pratzen until 10:00 then attack Staré Vinohrady',
    to: 'fr_soult',
    type: 'hold',
    at: [1370, 780],
    check: (r) => {
      expect(r.endTime).toBe(180);
      expect(r.chainedOrder?.type).toBe('assault');
    },
  },
  { text: '@Vandamme if enemy within 300m, retreat to Puntowitz', to: 'fr_vandamme', type: 'hold', check: (r) => expect(r.condition?.type).toBe('enemy_within') },
  { text: '@Vandamme advance to Žuráň', to: 'fr_vandamme', type: 'march', at: [1080, 375] },
  { text: '@Hulin take the Santon', to: 'fr_hulin', type: 'assault', at: [1335, 232] },
  { text: 'Guard Horse Battery, counter-battery the Pratzen guns', to: 'fr_artillery_guard', type: 'bombard', at: [1490, 700] },
  { text: '@Bernadotte cross at the Puntowitz bridge', to: 'fr_bernadotte', type: 'march' },
  { text: '@Legrand hold Sokolnitz castle', to: 'fr_legrand', type: 'hold', at: [980, 880] },
  { text: 'Davout should hang on at Telnitz no matter what until eleven', to: 'fr_davout', type: 'hold', at: [915, 1215], check: (r) => expect(r.endTime).toBe(240) },
  { text: 'whoever commands the Guard battery, open fire on Pratzen', to: 'fr_artillery_guard', type: 'bombard' },
  {
    text: 'pull Vandamme back if he is outflanked',
    to: 'fr_vandamme',
    type: 'hold',
    check: (r) => {
      expect(r.condition?.type).toBe('outflanked');
      expect(r.condition?.contingencyAction).toBe('retreat');
    },
  },
  { text: '@Legrand withdraw to Telnitz if outflanked', to: 'fr_legrand', type: 'hold', check: (r) => expect(r.condition?.contingencyDestinationName).toMatch(/Telnitz/) },
  // General-level engagement orders
  { text: '@Walther pursue the routed enemy', to: 'fr_walther', type: 'charge', check: (r) => expect(r.conduct?.mode).toBe('pursue') },
  {
    text: '@Vandamme press the attack to Pratzen, break off at 30% losses',
    to: 'fr_vandamme',
    type: 'assault',
    at: [1490, 780], // an attack on a place goes in against the enemy holding it (Kollowrat)
    check: (r) => expect(r.conduct).toMatchObject({ mode: 'press', lossLimit: 0.3 }),
  },
  { text: '@Legrand fight a delaying action at Sokolnitz', to: 'fr_legrand', type: 'hold', at: [960, 990], check: (r) => expect(r.conduct?.mode).toBe('delay') },
  { text: '@St-Hilaire break off', to: 'fr_sthilaire', type: 'retreat', check: (r) => expect(r.conduct?.mode).toBe('break_off') },
  { text: '@Bernadotte demonstrate against Blasowitz', to: 'fr_bernadotte', type: 'march', check: (r) => expect(r.conduct?.mode).toBe('demonstrate') },
  { text: '@Davout advance to Telnitz without delay', to: 'fr_davout', type: 'march', at: [915, 1215], check: (r) => expect(r.conduct).toBeUndefined() },
];

describe('order parser', () => {
  for (const c of CASES) {
    it(c.text, async () => {
      const r = await parse(c.text);
      expect(r.recipientUnitId).toBe(c.to);
      expect(r.orderType).toBe(c.type);
      expect(!!r.isCorpsOrder).toBe(!!c.corps);
      // A confident reading never needs the language model
      expect(r.uncertainty).toBeUndefined();
      if (c.at) expect(near(r.destination, c.at[0], c.at[1])).toBe(true);
      c.check?.(r);
    });
  }

  it.each(['@Ney advance to Pratzen', '@Kellermann advance to Pratzen', 'Kellermann, charge!'])(
    'refuses an unknown commander instead of reassigning: %s',
    async (text) => {
      await expect(parse(text)).rejects.toMatchObject({ code: 'unknown_recipient' });
    }
  );

  it('asks for an addressee when nothing is selected', async () => {
    await expect(parse('advance to Pratzen', null)).rejects.toBeInstanceOf(DispatchError);
  });

  it('flags orders it has to guess, so the model can be consulted', async () => {
    const r = await parse('the guard foot to reinforce Sokolnitz', 'fr_legrand');
    expect(r.uncertainty).toBeDefined();
  });
});

describe('spelled-out times', () => {
  it.each([
    ['hold until eleven', 'hold until 11:00'],
    ['attack at half past eight', 'attack at 08:30'],
    ['be there by noon', 'be there by 12:00'],
    ['wait until two', 'wait until 14:00'],
    ['at quarter to nine advance', 'at 08:45 advance'],
    ['at one point move', 'at one point move'],
  ])('%s', (input, expected) => {
    expect(normalizeTimeWords(input)).toBe(expected);
  });
});

describe('MGRS grid', () => {
  it('round-trips map positions', () => {
    const p = { x: 1370, y: 780 };
    expect(toMgrs(p)).toBe('XQ 2285 5110');
    const back = parseMgrs(toMgrs(p))!;
    expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(2);
  });

  it('accepts 6, 8 and 10 digit references, with or without the zone', () => {
    expect(parseMgrs('XQ 229 511')).not.toBeNull();
    expect(parseMgrs('33UXQ2285051100')).not.toBeNull();
    expect(normalizeGridRefs('@Soult advance to XQ 2285 5110 then hold')).toBe('@Soult advance to (1371, 779) then hold');
  });
});
