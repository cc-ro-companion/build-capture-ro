import { describe, expect, it } from 'vitest';
import { convertAttrFix, convertSizeFix } from './tables.ts';

describe('convertSizeFix', () => {
  it('lists every weapon type and defaults unlisted sizes to 100', () => {
    const table = convertSizeFix([{ Weapon: 'Knuckle', Medium: 75, Large: 50 }]);
    expect(table.Knuckle).toEqual({ small: 100, medium: 75, large: 50 });
    expect(table.Fist).toEqual({ small: 100, medium: 100, large: 100 });
    expect(Object.keys(table)).toHaveLength(24);
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
