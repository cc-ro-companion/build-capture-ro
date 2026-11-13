import { describe, expect, it } from 'vitest';
import { rAthenaDefaults } from '../engine/config';
import { autoAttack } from '../engine/autoAttack';
import { testJob, testWeapon } from '../engine/testData';
import { defaultDummy, dummyMonster, MAX_DUMMIES, normalizeDummies, type Dummy } from './dummy';
import { gameData } from './resolve';

function normalize(raw: unknown) {
  const warnings: string[] = [];
  const dummies = normalizeDummies(raw, warnings);
  return { dummies, warnings };
}

describe('normalizeDummies', () => {
  it('keeps valid dummies unchanged and without warnings', () => {
    const dummy: Dummy = {
      name: 'Tank',
      level: 99,
      def: 999,
      mdef: 1,
      str: 1,
      agi: 500,
      vit: 999,
      int: 1,
      dex: 1,
      luk: 999,
      size: 'large',
      race: 'Dragon',
      element: 'Ghost',
      elementLevel: 4,
    };
    expect(normalize([dummy, defaultDummy(1)])).toEqual({
      dummies: [dummy, defaultDummy(1)],
      warnings: [],
    });
  });

  it('treats a missing list as no dummies', () => {
    expect(normalize(undefined)).toEqual({ dummies: [], warnings: [] });
    expect(normalize('x').warnings).toHaveLength(1);
  });

  it('clamps out-of-range numbers with a warning', () => {
    const result = normalize([
      { ...defaultDummy(0), level: 150, def: 0, luk: 1500, elementLevel: 5 },
    ]);
    expect(result.dummies[0]).toMatchObject({ level: 99, def: 1, luk: 999, elementLevel: 4 });
    expect(result.warnings).toEqual([
      'Dummy "Dummy 1": Level 150 is outside 1–99; set to 99.',
      'Dummy "Dummy 1": DEF 0 is outside 1–999; set to 1.',
      'Dummy "Dummy 1": LUK 1500 is outside 1–999; set to 999.',
      'Dummy "Dummy 1": Element level 5 is outside 1–4; set to 4.',
    ]);
  });

  it('replaces unknown size, race and element with the defaults', () => {
    const result = normalize([
      { ...defaultDummy(0), size: 'huge', race: 'Boss', element: 'Fire2' },
    ]);
    expect(result.dummies[0]).toMatchObject({
      size: 'medium',
      race: 'Formless',
      element: 'Neutral',
    });
    expect(result.warnings).toEqual([
      'Dummy "Dummy 1": unknown size huge; set to medium.',
      'Dummy "Dummy 1": unknown race Boss; set to Formless.',
      'Dummy "Dummy 1": unknown element Fire2; set to Neutral.',
    ]);
  });

  it('replaces an empty name and cuts a long one', () => {
    const long = 'A'.repeat(35);
    const result = normalize([
      { ...defaultDummy(0), name: '  ' },
      { ...defaultDummy(1), name: long },
    ]);
    expect(result.dummies.map((dummy) => dummy.name)).toEqual(['Dummy 1', 'A'.repeat(30)]);
    expect(result.warnings).toEqual([
      'Dummy 1 has no name; named "Dummy 1".',
      `Dummy name "${long}" is longer than 30 characters; cut to "${'A'.repeat(30)}".`,
    ]);
  });

  it('drops dummies beyond the maximum with a warning', () => {
    const many = Array.from({ length: MAX_DUMMIES + 2 }, (_, index) => defaultDummy(index));
    const result = normalize(many);
    expect(result.dummies).toHaveLength(MAX_DUMMIES);
    expect(result.warnings).toEqual(['22 dummies is more than 20; the last 2 were removed.']);
  });

  it('fills a record that is not an object with defaults and warnings', () => {
    const result = normalize([42]);
    expect(result.dummies).toEqual([defaultDummy(0)]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('dummyMonster', () => {
  it('feeds the dummy settings into the engine', () => {
    const character = {
      job: testJob(),
      baseLevel: 50,
      jobLevel: 1,
      baseStats: { str: 50, agi: 1, vit: 1, int: 1, dex: 10, luk: 1 },
      weapon: testWeapon(),
      weaponRefine: { atk: 0, overrefine: 0 },
    };
    // Neutral attacks do 0 % against Ghost level 4.
    const ghost = dummyMonster({ ...defaultDummy(0), element: 'Ghost', elementLevel: 4 });
    const result = autoAttack(character, ghost, gameData.tables, rAthenaDefaults);
    expect(result.normal.max).toBe(0);
    expect(result.crit.max).toBe(0);
  });
});
