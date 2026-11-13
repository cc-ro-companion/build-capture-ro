import { describe, expect, it } from 'vitest';
import { convertAttrFix, convertRefine, convertSizeFix } from './tables.ts';

describe('convertSizeFix', () => {
  it('lists every weapon type and defaults unlisted sizes to 100', () => {
    const table = convertSizeFix([{ Weapon: 'Knuckle', Medium: 75, Large: 50 }]);
    expect(table.Knuckle).toEqual({ small: 100, medium: 75, large: 50 });
    expect(table.Fist).toEqual({ small: 100, medium: 100, large: 100 });
    expect(Object.keys(table)).toHaveLength(24);
  });

  it('lets a later entry change only the sizes it lists', () => {
    const table = convertSizeFix([
      { Weapon: 'Whip', Small: 75 },
      { Weapon: 'Whip', Large: 50 },
    ]);
    expect(table.Whip).toEqual({ small: 75, medium: 100, large: 50 });
  });

  it('rejects an unknown weapon type', () => {
    expect(() => convertSizeFix([{ Weapon: 'Lance' }])).toThrow('unknown weapon type "Lance"');
  });
});

describe('convertAttrFix', () => {
  const levels = [1, 2, 3, 4].map((Level) => ({ Level, Water: { Fire: 150 + Level } }));

  it('fills a full 10 × 10 table per level, defaulting to 100', () => {
    const table = convertAttrFix(levels);
    expect(table).toHaveLength(4);
    expect(table[0]?.Water?.Fire).toBe(151);
    expect(table[3]?.Water?.Fire).toBe(154);
    expect(table[0]?.Neutral?.Ghost).toBe(100);
    expect(Object.keys(table[0] ?? {})).toHaveLength(10);
  });

  it('fails when a level is missing', () => {
    expect(() => convertAttrFix(levels.slice(0, 3))).toThrow('no entry for level 4');
  });
});

describe('convertRefine', () => {
  const entries = [
    {
      Group: 'Weapon',
      Levels: [
        {
          Level: 2,
          RefineLevels: [
            { Level: 1, Bonus: 300, Chances: [] },
            { Level: 3, Bonus: 900, RandomBonus: 500 },
          ],
        },
      ],
    },
    { Group: 'Armor', Levels: [{ Level: 1, RefineLevels: [{ Level: 1, Bonus: 70 }] }] },
    { Group: 'Shadow_Weapon', Levels: [{ Level: 1, RefineLevels: [{ Level: 1, Bonus: 1 }] }] },
  ];

  it('indexes by item level and refine level, filling gaps with no bonus', () => {
    const tables = convertRefine(entries);
    expect(tables.armor).toEqual([[{ bonus: 70, randomBonus: 0 }]]);
    expect(tables.weapon).toEqual([
      [],
      [
        { bonus: 300, randomBonus: 0 },
        { bonus: 0, randomBonus: 0 },
        { bonus: 900, randomBonus: 500 },
      ],
    ]);
  });

  it('rejects a bad value', () => {
    expect(() =>
      convertRefine([
        { Group: 'Armor', Levels: [{ Level: 1, RefineLevels: [{ Level: 1, Bonus: -5 }] }] },
      ]),
    ).toThrow('refine.yml: Armor level 1 +1.Bonus must be a non-negative integer.');
  });
});
