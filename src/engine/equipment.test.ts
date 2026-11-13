import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import { armorRefineDef, refineLevel, weaponRefine } from './equipment';
import { testWeapon } from './testData';

const refine = tables.refine;
const armor = testWeapon({ type: 'armor', weaponType: undefined, weaponLevel: undefined });

// Expected values are pre-renewal refine.yml's: weapon level 1/2/3/4 gives
// +2/+3/+5/+7 ATK per refine and overupgrade from +8/+7/+6/+5; armor +0.7 DEF.
describe('weaponRefine (shipped refine.yml)', () => {
  it('gives refine ATK per weapon level', () => {
    expect(weaponRefine(refine, testWeapon({ weaponLevel: 1 }), 7)).toEqual({
      atk: 14,
      overrefine: 0,
    });
    expect(weaponRefine(refine, testWeapon({ weaponLevel: 3 }), 4)).toEqual({
      atk: 20,
      overrefine: 0,
    });
  });

  it('gives overupgrade above the safe limit', () => {
    expect(weaponRefine(refine, testWeapon({ weaponLevel: 1 }), 10)).toEqual({
      atk: 20,
      overrefine: 9,
    });
    expect(weaponRefine(refine, testWeapon({ weaponLevel: 4 }), 10)).toEqual({
      atk: 70,
      overrefine: 78,
    });
    expect(weaponRefine(refine, testWeapon({ weaponLevel: 4 }), 5).overrefine).toBe(13);
  });

  it('gives nothing at +0, for bare hands, or for an item that cannot be refined', () => {
    const none = { atk: 0, overrefine: 0 };
    expect(weaponRefine(refine, testWeapon(), 0)).toEqual(none);
    expect(weaponRefine(refine, null, 7)).toEqual(none);
    expect(weaponRefine(refine, testWeapon({ refineable: false }), 7)).toEqual(none);
  });

  it('finds no entry for a weapon level the table lacks', () => {
    expect(refineLevel(refine, testWeapon({ weaponLevel: 5 }), 3)).toBeUndefined();
  });
});

describe('armorRefineDef (shipped refine.yml)', () => {
  it('sums every piece, then rounds once: (refinedef + 50) / 100', () => {
    // +3: 210 → (210 + 50) / 100 = 2; +4: 280 → 3.
    expect(armorRefineDef(refine, [{ item: armor, refine: 3 }])).toBe(2);
    expect(armorRefineDef(refine, [{ item: armor, refine: 4 }])).toBe(3);
    // Two +4 pieces: 560 → 6, not 3 + 3.
    expect(
      armorRefineDef(refine, [
        { item: armor, refine: 4 },
        { item: armor, refine: 4 },
      ]),
    ).toBe(6);
  });

  it('ignores weapons and unrefined armor', () => {
    expect(armorRefineDef(refine, [{ item: testWeapon(), refine: 10 }])).toBe(0);
    expect(armorRefineDef(refine, [{ item: armor, refine: 0 }])).toBe(0);
  });
});
