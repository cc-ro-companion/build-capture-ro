// Hand-made records for engine tests, so expected values do not shift when
// the generated data is regenerated.
import type { BonusStats, Item, Job, Monster, RefineTables, ScriptStmt } from '../data/types';
import { BonusSet } from './bonuses';
import { buildCharacter, type CharacterBase, type EquippedItem } from './gear';
import type { CharacterInput } from './stats';

export function stats(partial: Partial<BonusStats> = {}): BonusStats {
  return { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1, ...partial };
}

const zeroBonus: BonusStats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };

export function testJob(partial: Partial<Job> = {}): Job {
  return {
    id: 1,
    key: 'Swordman',
    maxBaseLevel: 99,
    maxJobLevel: 50,
    bonusStats: Array.from({ length: 50 }, () => ({ ...zeroBonus })),
    baseAspd: { Fist: 400, Dagger: 500, '1hSword': 550, '2hSword': 600, Bow: 700, Katar: 500 },
    // Swordman-like: HP 40 + 5 per level, SP 11 + 1 per level.
    baseHp: Array.from({ length: 99 }, (_, index) => 40 + 5 * index),
    baseSp: Array.from({ length: 99 }, (_, index) => 11 + index),
    ...partial,
  };
}

export function testWeapon(partial: Partial<Item> = {}): Item {
  return {
    id: 1101,
    aegisName: 'Sword',
    type: 'weapon',
    weaponType: '1hSword',
    attack: 25,
    defense: 0,
    range: 1,
    slots: 3,
    weaponLevel: 1,
    equipLevelMin: 2,
    equipLevelMax: 0,
    refineable: true,
    locations: ['Right_Hand'],
    jobs: [0, 1],
    effects: [],
    ...partial,
  };
}

export function testMonster(partial: Partial<Monster> = {}): Monster {
  return {
    id: 1002,
    aegisName: 'PORING',
    level: 1,
    hp: 50,
    attackMin: 7,
    attackMax: 10,
    defense: 0,
    magicDefense: 5,
    str: 1,
    agi: 1,
    vit: 1,
    int: 0,
    dex: 6,
    luk: 30,
    size: 'medium',
    race: 'Plant',
    raceGroups: [],
    element: 'Water',
    elementLevel: 1,
    class: 'normal',
    modes: [],
    attackRange: 1,
    attackDelay: 1872,
    attackMotion: 672,
    damageMotion: 480,
    walkSpeed: 400,
    ...partial,
  };
}

export function character(partial: Partial<CharacterInput> = {}): CharacterInput {
  return {
    job: testJob(),
    baseLevel: 50,
    jobLevel: 1,
    baseStats: stats(),
    weapon: null,
    weaponRefine: { atk: 0, overrefine: 0 },
    bonuses: new BonusSet([]),
    equipmentStats: { ...zeroBonus },
    equipmentDef: 0,
    ...partial,
  };
}

/** `bonus name,args...;` as the parser stores it, with number arguments. */
export function bonus(name: string, ...args: number[]): ScriptStmt {
  return { k: 'bonus', name, args: args.map((value) => ({ k: 'num', v: value })) };
}

export function testArmor(partial: Partial<Item> = {}): Item {
  return testWeapon({
    id: 2301,
    aegisName: 'Cotton_Shirt',
    type: 'armor',
    weaponType: undefined,
    attack: 0,
    defense: 1,
    weaponLevel: undefined,
    locations: ['Armor'],
    ...partial,
  });
}

/**
 * A character wearing items through `buildCharacter`, with an empty refine
 * table unless one is given, so expected values stay hand-computable.
 */
export function gearCharacter(
  equipment: readonly EquippedItem[],
  partial: Partial<CharacterBase> = {},
  refine: RefineTables = { armor: [], weapon: [] },
): CharacterInput {
  const base = character();
  return buildCharacter(
    {
      job: base.job,
      baseLevel: base.baseLevel,
      jobLevel: base.jobLevel,
      baseStats: base.baseStats,
      ...partial,
    },
    equipment,
    refine,
  );
}
