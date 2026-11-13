// Hand-made records for engine tests, so expected values do not shift when
// the generated data is regenerated.
import type { BonusStats, Item, Job, Monster } from '../data/types';
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
    ...partial,
  };
}
