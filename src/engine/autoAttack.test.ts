import { describe, expect, it } from 'vitest';
import type { TablesFile } from '../data/types';
import { autoAttack } from './autoAttack';
import { rAthenaDefaults } from './config';
import { character, stats, testMonster, testWeapon } from './testData';

// Values as in rAthena's size_fix.yml and pre-re attr_fix.yml, reduced to
// what the cases below use.
const neutralVsGhost = [25, 25, 0, 0];
const tables: TablesFile = {
  sizeModifier: {
    Fist: { small: 100, medium: 100, large: 100 },
    '1hSword': { small: 75, medium: 100, large: 75 },
    Katar: { small: 75, medium: 100, large: 75 },
    Bow: { small: 100, medium: 100, large: 75 },
    Revolver: { small: 100, medium: 100, large: 100 },
  },
  elementModifier: neutralVsGhost.map((ghost) => ({
    Neutral: { Neutral: 100, Water: 100, Ghost: ghost },
  })),
};

const sword = testWeapon(); // ATK 25, weapon level 1
const katar = testWeapon({ id: 1250, weaponType: 'Katar', attack: 148, weaponLevel: 3 });
const bow = testWeapon({ id: 1701, weaponType: 'Bow', attack: 15, weaponLevel: 1 });
const gun = testWeapon({ id: 13100, weaponType: 'Revolver', attack: 40, weaponLevel: 1 });
// Poring-like: medium, DEF 0, VIT 1 (soft DEF exactly 1), Water 1, LUK 30.
const poring = testMonster();

function attack(partial: Parameters<typeof character>[0], monster = poring) {
  return autoAttack(character(partial), monster, tables, rAthenaDefaults);
}

describe('weapon damage (battle_calc_base_damage pre-renewal)', () => {
  it('rolls DEX-based minimum to ATK − 1, adds base ATK, subtracts soft DEF', () => {
    // DEX 10 → min weapon 10 × (80 + 1 × 20) / 100 = 10; rnd()%(25−10)+10 → 10..24.
    // Base ATK 1 + 0 + 10/5 + 0 = 3; soft DEF 1.
    const result = attack({ baseStats: stats({ dex: 10 }), weapon: sword });
    expect(result.normal).toEqual({ min: 12, max: 26, avg: 19 });
    // Crit uses the full ATK and ignores DEF: 25 + 3.
    expect(result.crit).toEqual({ min: 28, max: 28, avg: 28 });
  });

  it('scales the DEX minimum by weapon level: (80 + 20 × level)%', () => {
    const level4 = testWeapon({ attack: 100, weaponLevel: 4 });
    const level1 = testWeapon({ attack: 100, weaponLevel: 1 });
    // Base ATK with DEX 30: 1 + 0 + 6 + 0 = 7; soft DEF 1.
    // Level 4: 30 × 160 / 100 = 48 → 48 + 7 − 1 = 54; max 99 + 7 − 1 = 105.
    expect(attack({ baseStats: stats({ dex: 30 }), weapon: level4 }).normal).toMatchObject({
      min: 54,
      max: 105,
    });
    // Level 1: 30 × 100 / 100 = 30 → 36.
    expect(attack({ baseStats: stats({ dex: 30 }), weapon: level1 }).normal.min).toBe(36);
  });

  it('caps the DEX minimum at the weapon ATK, leaving one value', () => {
    // DEX 80 > ATK 25 → always 25; base ATK 1 + 0 + 16 + 0 = 17 → 25 + 17 − 1.
    const result = attack({ baseStats: stats({ dex: 80 }), weapon: sword });
    expect(result.normal).toEqual({ min: 41, max: 41, avg: 41 });
  });

  it('bare hands deal base ATK only', () => {
    // Weapon ATK 0; base ATK STR 20: 20 + 4 + 0 + 0 = 24 → 24 − 1 soft DEF.
    const result = attack({ baseStats: stats({ str: 20 }) });
    expect(result.normal).toEqual({ min: 23, max: 23, avg: 23 });
    expect(result.crit.min).toBe(24);
  });

  it('bows take the arrow path: min × ATK / 100', () => {
    // DEX 80 capped to ATK 15, then 15 × 15 / 100 = 2 → weapon 2..14.
    // Base ATK (DEX main) 80 + 64 + 10/5 + 5/5 = 147.
    const result = attack({ baseStats: stats({ str: 10, dex: 80, luk: 5 }), weapon: bow });
    expect(result.normal).toMatchObject({ min: 148, max: 160 });
    expect(result.crit.min).toBe(15 + 147);
  });

  it('gun crits are calculated like melee crits (full ATK)', () => {
    // Base ATK (DEX main) DEX 50: 50 + 25 + 0 + 0 = 75.
    const result = attack({ baseStats: stats({ dex: 50 }), weapon: gun });
    expect(result.crit.min).toBe(40 + 75);
  });
});

describe('size and element', () => {
  it('applies the size modifier to the weapon part only', () => {
    const large = testMonster({ size: 'large' });
    const result = attack({ baseStats: stats({ dex: 10 }), weapon: sword }, large);
    // trunc(10 × 75%) = 7 → 7 + 3 − 1 = 9; trunc(24 × 75%) = 18 → 20; crit trunc(25 × 75%) + 3.
    expect(result.normal).toMatchObject({ min: 9, max: 20 });
    expect(result.crit.min).toBe(21);
  });

  it('applies the Neutral element modifier after DEF', () => {
    const ghost1 = testMonster({ element: 'Ghost', elementLevel: 1 });
    // Crit 28 × 25% = 7.
    expect(attack({ baseStats: stats({ dex: 10 }), weapon: sword }, ghost1).crit.min).toBe(7);
  });

  it('deals 0 to Ghost level 4 with a Neutral attack', () => {
    const ghost4 = testMonster({ element: 'Ghost', elementLevel: 4 });
    const result = attack({ baseStats: stats({ dex: 10 }), weapon: sword }, ghost4);
    expect(result.normal).toEqual({ min: 0, max: 0, avg: 0 });
    expect(result.crit).toEqual({ min: 0, max: 0, avg: 0 });
    expect(result.dps).toBe(0);
  });
});

describe('DEF (battle_calc_defense_reduction pre-renewal)', () => {
  // Hard DEF 20, VIT 40: soft DEF 40 + rnd()%((40/20)²) → 40..43.
  const armored = testMonster({ defense: 20, vit: 40 });
  // STR 50, DEX 10: base ATK 50 + 25 + 2 + 0 = 77; weapon 10..24.
  const input = { baseStats: stats({ str: 50, dex: 10 }), weapon: sword };

  it('reduces by hard DEF % and then subtracts the soft DEF roll', () => {
    // min: trunc(87 × 80%) = 69 − 43 = 26; max: trunc(101 × 80%) = 80 − 40 = 40.
    expect(attack(input, armored).normal).toMatchObject({ min: 26, max: 40 });
  });

  it('crits ignore hard and soft DEF', () => {
    expect(attack(input, armored).crit.min).toBe(25 + 77);
  });

  it('average equals brute-force enumeration of weapon and soft DEF rolls', () => {
    let sum = 0;
    let count = 0;
    for (let weaponValue = 10; weaponValue <= 24; weaponValue++) {
      for (let softDef = 40; softDef <= 43; softDef++) {
        sum += Math.max(1, Math.trunc(((weaponValue + 77) * 80) / 100) - softDef);
        count++;
      }
    }
    const average = attack(input, armored).normal.avg;
    expect(average).toBeCloseTo(sum / count, 10);
    // The midpoint would be wrong here because of the truncations.
    expect(count).toBe(60);
  });

  it.each([
    ['Water', 100],
    ['Ghost', 25],
  ])(
    'matches brute force for a high-VIT target partly at the damage floor (%s)',
    (element, ratio) => {
      // VIT 200: soft DEF 200 + rnd()%((200/20)²) → 200..299. Katar weapon level 3,
      // DEX 10 → min 10 × 140 / 100 = 14; weapon 14..147. Base ATK 99 + 81 + 2 = 182.
      const tank = testMonster({ vit: 200, element, elementLevel: 1 });
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let count = 0;
      for (let weaponValue = 14; weaponValue <= 147; weaponValue++) {
        for (let softDef = 200; softDef <= 299; softDef++) {
          let damage = Math.max(1, weaponValue + 182 - softDef);
          damage = Math.trunc((damage * ratio) / 100);
          damage += Math.trunc(damage / 100);
          min = Math.min(min, damage);
          max = Math.max(max, damage);
          sum += damage;
          count++;
        }
      }
      const result = attack({ baseStats: stats({ str: 99, dex: 10 }), weapon: katar }, tank);
      expect(result.normal.min).toBe(min);
      expect(result.normal.max).toBe(max);
      expect(result.normal.avg).toBeCloseTo(sum / count, 10);
      // The case must reach both the floor and the katar bonus to test anything.
      expect(min).toBe(ratio === 100 ? 1 : 0);
      if (ratio === 100) expect(max).toBeGreaterThan(100);
    },
  );

  it('caps hard DEF at 100 and floors damage at 1 before element', () => {
    const wall = testMonster({ defense: 120, vit: 1 });
    expect(attack(input, wall).normal).toEqual({ min: 1, max: 1, avg: 1 });
  });
});

describe('hit and crit chance', () => {
  it('caps the hit rate at max_hitrate', () => {
    // HIT 50 + 10 = 60; Poring FLEE 1 + 1 = 2 → 80 + 60 − 2 = 138 → 100%.
    expect(attack({ baseStats: stats({ dex: 10 }), weapon: sword }).hitChance).toBe(1);
  });

  it('floors the hit rate at min_hitrate', () => {
    const evasive = testMonster({ level: 99, agi: 200 });
    expect(attack({ baseStats: stats({ dex: 10 }) }, evasive).hitChance).toBe(0.05);
  });

  it('uses 80 + HIT − FLEE in between', () => {
    // FLEE 60 + 40 = 100; HIT 60 → 40%.
    const monster = testMonster({ level: 60, agi: 40 });
    expect(attack({ baseStats: stats({ dex: 10 }) }, monster).hitChance).toBeCloseTo(0.4);
  });

  it('reduces crit by 2 × target LUK, not below 0', () => {
    // cri 10 + 1 × 10 / 3 = 13 − 60 < 0.
    expect(attack({ baseStats: stats({ dex: 10 }) }).critChance).toBe(0);
  });

  it('doubles katar crit before the target LUK reduction', () => {
    // (10 + 30 × 10 / 3) × 2 = 220 − 2 × 10 = 200 → 20%.
    const lowLuk = testMonster({ luk: 10 });
    expect(attack({ baseStats: stats({ luk: 30 }), weapon: katar }, lowLuk).critChance).toBe(0.2);
  });

  it('adds the katar off-hand hit of 1% without Double Attack', () => {
    // Base ATK 1 + 0 + 10/5 + 30/5 = 9; crit 148 + 9 = 157 + trunc(157 / 100) = 158.
    const result = attack({ baseStats: stats({ dex: 10, luk: 30 }), weapon: katar });
    expect(result.crit.min).toBe(158);
  });
});

describe('ASPD and DPS', () => {
  it('attacks every 2 × amotion ms and weights crits, hits and misses', () => {
    // amotion 550 − trunc(550 × 14 / 1000) = 543 → 1000 / 1086 attacks per second.
    const result = attack({ baseStats: stats({ dex: 10 }), weapon: sword });
    expect(result.amotion).toBe(543);
    expect(result.aspd).toBeCloseTo(145.7);
    expect(result.attacksPerSecond).toBeCloseTo(1000 / 1086, 10);
    // No crits (Poring LUK), always hits, average 19.
    expect(result.dps).toBeCloseTo((1000 / 1086) * 19, 10);
  });

  it('counts crits fully and misses as 0', () => {
    const monster = testMonster({ level: 60, agi: 40, luk: 10 });
    const result = attack({ baseStats: stats({ dex: 10, luk: 30 }), weapon: katar }, monster);
    const expected =
      result.attacksPerSecond *
      (result.critChance * result.crit.avg +
        (1 - result.critChance) * result.hitChance * result.normal.avg);
    expect(result.critChance).toBe(0.2);
    expect(result.hitChance).toBeCloseTo(0.4);
    expect(result.dps).toBeCloseTo(expected, 10);
  });
});
