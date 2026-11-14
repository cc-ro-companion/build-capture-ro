// Runes and the inventory in builds: normalizing, slot errors, store and
// equip, and runes reaching the engine.
import { describe, expect, it } from 'vitest';
import { rAthenaDefaults } from '../engine/config';
import { statusWindow } from '../engine/status';
import { runeErrors } from './equipment';
import { equipFromInventory, removeFromInventory, slotsFor, storeEquipped } from './inventory';
import { defaultBuild, MAX_INVENTORY, normalizeBuild, sameBuild, type Build } from './model';
import { gameData, resolveBuild } from './resolve';

const KNIFE = 1201; // 3 slots
const CUTTER = 1204; // 3 slots
const LEATHER_JACKET = 2303; // 0 slots
const ANACONDAQ = 39101; // Weapon
const ANDRE_LARVA = 39103; // Weapon: INT + 1, Maximum SP + 10
const ALICEL = 39259; // Armor
const ANDRE_EGG = 39346; // Shield

const assassin: Build = {
  ...defaultBuild(),
  job: 12,
  baseLevel: 99,
  jobLevel: 50,
  equipment: {
    rightHand: { item: KNIFE, refine: 7, runes: [ANACONDAQ, ANDRE_LARVA] },
    armor: { item: LEATHER_JACKET, refine: 4 },
  },
};

function normalize(raw: unknown) {
  const result = normalizeBuild(raw, gameData, rAthenaDefaults);
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('runes in a build', () => {
  it('keeps known runes in order and leaves the field out when there are none', () => {
    const { build, warnings } = normalize(assassin);
    expect(warnings).toEqual([]);
    expect(build.equipment.rightHand).toEqual({
      item: KNIFE,
      refine: 7,
      runes: [ANACONDAQ, ANDRE_LARVA],
    });
    expect(build.equipment.armor).toEqual({ item: LEATHER_JACKET, refine: 4 });
    expect(
      normalize({ ...assassin, equipment: { armor: { item: 2303, refine: 0, runes: [] } } }).build
        .equipment.armor,
    ).toEqual({ item: 2303, refine: 0 });
  });

  it('drops unknown runes with a warning and caps a list at four', () => {
    const raw = {
      ...assassin,
      equipment: {
        rightHand: {
          item: KNIFE,
          refine: 0,
          runes: [ANACONDAQ, 501, 'x', ANACONDAQ, ANACONDAQ, ANACONDAQ, ANACONDAQ],
        },
      },
    };
    const { build, warnings } = normalize(raw);
    expect(build.equipment.rightHand?.runes).toEqual([ANACONDAQ, ANACONDAQ, ANACONDAQ, ANACONDAQ]);
    expect(warnings).toEqual([
      'Unknown rune 501 in Knife (1201) removed.',
      'Unknown rune x in Knife (1201) removed.',
      'Knife (1201) holds 5 runes; no item has more than 4, extra removed.',
    ]);
    expect(
      normalize({ ...assassin, equipment: { rightHand: { item: KNIFE, refine: 0, runes: 3 } } })
        .warnings,
    ).toEqual(['The runes of Knife (1201) are not a list; removed.']);
  });

  it('keeps runes of the wrong location or beyond the slots, as errors', () => {
    const equipment: Build['equipment'] = {
      rightHand: { item: KNIFE, refine: 0, runes: [ALICEL] },
      armor: { item: LEATHER_JACKET, refine: 0, runes: [ALICEL] },
    };
    const { build, warnings } = normalize({ ...assassin, equipment });
    expect(warnings).toEqual([]);
    expect(build.equipment).toEqual(equipment);
    // In slot order: armor before the right hand.
    expect(runeErrors(build.equipment, gameData)).toEqual([
      'Jacket (2303) has 0 slots but holds 1 runes.',
      'Alicel Rune goes into armor, not into Knife (1201).',
    ]);
  });

  it('accepts a Shield rune in a shield and a Weapon rune in a dual-wielded weapon', () => {
    const equipment: Build['equipment'] = {
      rightHand: { item: KNIFE, refine: 0 },
      leftHand: { item: CUTTER, refine: 0, runes: [ANACONDAQ] },
    };
    expect(runeErrors(equipment, gameData)).toEqual([]);
    expect(
      runeErrors({ leftHand: { item: 2101, refine: 0, runes: [ANDRE_EGG] } }, gameData),
    ).toEqual(['Guard (2101) has 0 slots but holds 1 runes.']);
  });

  it('reaches the engine: rune effects change the status window', () => {
    const plain = resolveBuild(
      { ...assassin, equipment: { rightHand: { item: KNIFE, refine: 7 } } },
      gameData,
    );
    const runed = resolveBuild(assassin, gameData);
    const rightHand = runed.equipment.find((equipped) => equipped.slot === 'rightHand');
    expect(rightHand?.runes?.map((rune) => rune.id)).toEqual([ANACONDAQ, ANDRE_LARVA]);
    // Andre Larva Rune: INT + 1, Maximum SP + 10.
    const window = (resolved: typeof plain) => statusWindow(resolved.character, rAthenaDefaults);
    expect(runed.character.equipmentStats.int).toBe(plain.character.equipmentStats.int + 1);
    expect(window(runed).maxSp).toBeGreaterThan(window(plain).maxSp + 10);
  });

  it('compares runes in sameBuild', () => {
    const other: Build = {
      ...assassin,
      equipment: {
        ...assassin.equipment,
        rightHand: { item: KNIFE, refine: 7, runes: [ANACONDAQ] },
      },
    };
    expect(sameBuild(assassin, { ...assassin })).toBe(true);
    expect(sameBuild(assassin, other)).toBe(false);
  });
});

describe('inventory', () => {
  it('round-trips an item with refine and runes through store and equip', () => {
    const stored = storeEquipped(assassin, 'rightHand');
    if ('error' in stored) throw new Error(stored.error);
    expect(stored.build.inventory).toEqual([
      { item: KNIFE, refine: 7, runes: [ANACONDAQ, ANDRE_LARVA] },
    ]);
    expect(stored.build.equipment).toEqual(assassin.equipment);

    const swapped: Build = {
      ...stored.build,
      equipment: { ...stored.build.equipment, rightHand: { item: CUTTER, refine: 0 } },
    };
    const equipped = equipFromInventory(swapped, 0, 'rightHand', gameData);
    if ('error' in equipped) throw new Error(equipped.error);
    expect(equipped.build.equipment.rightHand).toEqual(assassin.equipment.rightHand);
    expect(equipped.build.inventory).toEqual(stored.build.inventory);
  });

  it('copies, so changing the equipped item leaves the stored one alone', () => {
    const stored = storeEquipped(assassin, 'rightHand');
    if ('error' in stored) throw new Error(stored.error);
    stored.build.equipment.rightHand?.runes?.push(ANACONDAQ);
    expect(stored.build.inventory[0]?.runes).toEqual([ANACONDAQ, ANDRE_LARVA]);
  });

  it('equips into any slot the item fits, replacing what it overlaps', () => {
    const build: Build = { ...assassin, inventory: [{ item: CUTTER, refine: 3 }] };
    expect(slotsFor(build.inventory[0]!, build.job, gameData)).toEqual(['rightHand', 'leftHand']);
    const left = equipFromInventory(build, 0, 'leftHand', gameData);
    if ('error' in left) throw new Error(left.error);
    expect(left.build.equipment.leftHand).toEqual({ item: CUTTER, refine: 3 });
    expect(equipFromInventory(build, 0, 'armor', gameData)).toEqual({
      error: 'The item does not go there.',
    });
    expect(equipFromInventory(build, 5, 'rightHand', gameData)).toEqual({
      error: 'No such inventory item.',
    });
  });

  it('refuses to store from an empty slot or into a full inventory', () => {
    expect(storeEquipped(assassin, 'shoes')).toEqual({ error: 'Nothing is equipped there.' });
    const full: Build = {
      ...assassin,
      inventory: Array.from({ length: MAX_INVENTORY }, () => ({ item: KNIFE, refine: 0 })),
    };
    expect(storeEquipped(full, 'rightHand')).toEqual({
      error: 'The inventory is full (50 items).',
    });
  });

  it('removes an item by position', () => {
    const build: Build = {
      ...assassin,
      inventory: [
        { item: KNIFE, refine: 1 },
        { item: CUTTER, refine: 2 },
      ],
    };
    expect(removeFromInventory(build, 0).inventory).toEqual([{ item: CUTTER, refine: 2 }]);
  });

  it('normalizes the inventory: unknown items dropped, refine clamped, at most 50', () => {
    const raw = {
      ...assassin,
      inventory: [
        { item: KNIFE, refine: 15, runes: [ANACONDAQ, 7] },
        { item: 999999, refine: 0 },
        ...Array.from({ length: MAX_INVENTORY }, () => ({ item: CUTTER, refine: 0 })),
      ],
    };
    const { build, warnings } = normalize(raw);
    expect(build.inventory).toHaveLength(MAX_INVENTORY);
    expect(build.inventory[0]).toEqual({ item: KNIFE, refine: 10, runes: [ANACONDAQ] });
    expect(warnings).toEqual([
      'Unknown rune 7 in Knife (1201) removed.',
      'Refine 15 of Knife (1201) is outside 0–10; set to 10.',
      'Unknown item 999999 in the inventory removed.',
      'The inventory holds 51 items; only the first 50 were kept.',
    ]);
    expect(normalize({ ...assassin, inventory: 'x' }).warnings).toEqual([
      'The inventory is not a list; removed.',
    ]);
  });

  it('gives a 4a build, which has no inventory, an empty one without warnings', () => {
    const phase4a: Record<string, unknown> = { ...assassin };
    delete phase4a.inventory;
    const { build, warnings } = normalize(phase4a);
    expect(warnings).toEqual([]);
    expect(build.inventory).toEqual([]);
  });
});

describe('inventory slots follow the job', () => {
  it('offers a dagger the left hand for an Assassin only', () => {
    const dagger = { item: CUTTER, refine: 0 };
    expect(slotsFor(dagger, 12, gameData)).toEqual(['rightHand', 'leftHand']);
    expect(slotsFor(dagger, 7, gameData)).toEqual(['rightHand']);
    const knight: Build = { ...assassin, job: 7, inventory: [dagger] };
    expect(equipFromInventory(knight, 0, 'leftHand', gameData)).toEqual({
      error: 'The item does not go there.',
    });
  });

  it('offers no slot for an item the job cannot wear', () => {
    // Jur (1250) is a katar, for Assassins only.
    expect(slotsFor({ item: 1250, refine: 0 }, 7, gameData)).toEqual([]);
  });
});
