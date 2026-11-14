import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import type { ScriptStmt } from '../data/types';
import { bonusSource, buildCharacter } from './gear';
import { bonus, character, stats, testArmor, testWeapon } from './testData';

const base = (() => {
  const { job, baseLevel, jobLevel, baseStats } = character();
  return { job, baseLevel, jobLevel, baseStats };
})();
const empty = { armor: [], weapon: [] };

describe('bonusSource (status_calc_pc lr_flag)', () => {
  it('marks a left-hand weapon LR_FLAG_WEAPON and a shield LR_FLAG_SHIELD', () => {
    expect(bonusSource('leftHand', testWeapon())).toBe('leftWeapon');
    expect(bonusSource('leftHand', testArmor({ locations: ['Left_Hand'] }))).toBe('shield');
    expect(bonusSource('rightHand', testWeapon())).toBe('none');
    expect(bonusSource('armor', testArmor())).toBe('none');
  });
});

describe('buildCharacter', () => {
  it('collects every item’s bonus calls with their source', () => {
    const character = buildCharacter(
      base,
      [
        { slot: 'rightHand', item: testWeapon({ effects: [bonus('bStr', 2)] }), refine: 0 },
        {
          slot: 'leftHand',
          item: testArmor({ id: 2101, locations: ['Left_Hand'], effects: [bonus('bMdef', 1)] }),
          refine: 0,
        },
      ],
      empty,
    );
    expect(character.bonuses.calls).toEqual([
      { name: 'bMdef', args: [1], itemId: 2101, source: 'shield' },
      { name: 'bStr', args: [2], itemId: 1101, source: 'none' },
    ]);
  });

  it('runs scripts with the item’s own refine (getrefine)', () => {
    // if (getrefine() >= 7) bonus bStr,3;
    const effects: ScriptStmt[] = [
      {
        k: 'if',
        cond: {
          k: 'op',
          op: '>=',
          args: [
            { k: 'call', fn: 'getrefine', args: [] },
            { k: 'num', v: 7 },
          ],
        },
        then: [bonus('bStr', 3)],
        else: [],
      },
    ];
    const at = (refine: number) =>
      buildCharacter(base, [{ slot: 'armor', item: testArmor({ effects }), refine }], empty)
        .equipmentStats.str;
    expect(at(6)).toBe(0);
    expect(at(7)).toBe(3);
  });

  it('sums stat bonuses into param_equip, including bAllStats, bAgiVit and bAgiDexStr', () => {
    const item = testArmor({
      effects: [
        bonus('bAllStats', 1),
        bonus('bAgiVit', 2),
        bonus('bAgiDexStr', 3),
        bonus('bLuk', 4),
      ],
    });
    const { equipmentStats } = buildCharacter(base, [{ slot: 'armor', item, refine: 0 }], empty);
    expect(equipmentStats).toEqual(stats({ str: 4, agi: 6, vit: 3, int: 1, dex: 4, luk: 5 }));
  });

  it('runs scripts in equip index order, so the weapon’s bAtkEle comes last', () => {
    const fireArmor = testArmor({ effects: [bonus('bAtkEle', 3)] });
    const waterWeapon = testWeapon({ effects: [bonus('bAtkEle', 1)] });
    const character = buildCharacter(
      base,
      [
        { slot: 'rightHand', item: waterWeapon, refine: 0 },
        { slot: 'armor', item: fireArmor, refine: 0 },
      ],
      empty,
    );
    expect(character.bonuses.last('bAtkEle')).toBe(1);
  });

  it('keeps DEF and refine of an item whose script did not parse', () => {
    // Armor +4: refine.yml gives 4 × 70 = 280 hundredths, (280 + 50) / 100 = 3.
    const item = testArmor({ defense: 5, effects: null });
    const character = buildCharacter(base, [{ slot: 'armor', item, refine: 4 }], tables.refine);
    expect(character.bonuses.calls).toEqual([]);
    expect(character.equipmentDef).toBe(5 + 3);
  });

  it('takes the right-hand weapon and its refine for the damage formula', () => {
    const character = buildCharacter(
      base,
      [{ slot: 'rightHand', item: testWeapon({ weaponLevel: 1 }), refine: 7 }],
      tables.refine,
    );
    expect(character.weapon?.id).toBe(1101);
    expect(character.weaponRefine).toEqual({ atk: 14, overrefine: 0 });
  });
});
