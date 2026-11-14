import { describe, expect, it } from 'vitest';
import type { ScriptStmt, TablesFile } from '../data/types';
import { autoAttack } from './autoAttack';
import { rAthenaDefaults } from './config';
import type { CharacterBase, EquippedItem, Slot } from './gear';
import {
  bonus,
  character,
  gearCharacter,
  stats,
  testArmor,
  testMonster,
  testWeapon,
} from './testData';

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
  refine: { armor: [], weapon: [] },
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

describe('weapon refinement', () => {
  // DEX 80 > ATK 25, so the weapon always rolls 25; base ATK 1 + 0 + 16 + 0 = 17.
  const input = { baseStats: stats({ dex: 80 }), weapon: sword };

  it('adds refine ATK after hard and soft DEF (battle_calc_attack_post_defense)', () => {
    const armored = testMonster({ defense: 50 });
    // (25 + 17) × (100 − 50) / 100 = 21, − soft DEF 1 = 20 without refine.
    expect(attack(input, armored).normal.avg).toBe(20);
    // +7 sword: atk2 14 is not halved by DEF: 21 + 14 − 1 = 34.
    const refined = { ...input, weaponRefine: { atk: 14, overrefine: 0 } };
    expect(attack(refined, armored).normal).toEqual({ min: 34, max: 34, avg: 34 });
    // Crits ignore DEF and still get refine ATK: 25 + 17 + 14.
    expect(attack(refined, armored).crit.avg).toBe(56);
  });

  it('lets refine ATK lift damage that DEF took below 1 (floor applies after refine)', () => {
    const wall = testMonster({ defense: 100, vit: 1 });
    // Hard DEF 100 leaves 0; 0 + 5 − 1 = 4, not max(1, 0 − 1) + 5.
    const refined = { ...input, weaponRefine: { atk: 5, overrefine: 0 } };
    expect(attack(refined, wall).normal.avg).toBe(4);
  });

  it('adds overupgrade 1..n with equal chance, also on crits (battle_add_weapon_damage)', () => {
    const over = { ...input, weaponRefine: { atk: 0, overrefine: 3 } };
    // 25 + 17 + {1, 2, 3} − soft DEF 1 → 42..44.
    expect(attack(over).normal).toEqual({ min: 42, max: 44, avg: 43 });
    expect(attack(over).crit).toEqual({ min: 43, max: 45, avg: 44 });
  });
});

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

describe('equipment effects on auto attack', () => {
  // Fire vs Water 1 is 50 % in pre-re attr_fix.yml.
  const elementTables: TablesFile = {
    ...tables,
    sizeModifier: { ...tables.sizeModifier, '1hSword': { small: 75, medium: 100, large: 75 } },
    elementModifier: [{ Neutral: { Neutral: 100, Water: 100 }, Fire: { Neutral: 100, Water: 50 } }],
  };
  const RC_PLANT = 3;
  const RC_ALL = 12;
  const CLASS_NORMAL = 0;
  // DEX 80 ≥ ATK 25, so the sword always rolls 25; base ATK 17. 42 − soft DEF 1 = 41 on Poring.
  const dexStats = { baseStats: stats({ dex: 80 }) };
  // STR 99 with DEX 1: base ATK 99 + 81 = 180; crits do 25 + 180 = 205.
  const strStats = { baseStats: stats({ str: 99 }) };

  function hit(
    effects: ScriptStmt[],
    {
      monster = poring,
      weapon = sword,
      partial = dexStats as Partial<CharacterBase>,
      slot = 'armor' as Slot,
    } = {},
  ) {
    const equipment: EquippedItem[] = [{ slot: 'rightHand', item: weapon, refine: 0 }];
    const holder =
      slot === 'leftHand'
        ? testArmor({ locations: ['Left_Hand'], effects })
        : testArmor({ effects });
    equipment.push({ slot, item: { ...holder, defense: 0 }, refine: 0 });
    return autoAttack(gearCharacter(equipment, partial), monster, elementTables, rAthenaDefaults);
  }

  it('takes the weapon element from bAtkEle (pc_bonus SP_ATKELE: rhw.ele)', () => {
    expect(hit([]).normal.avg).toBe(41);
    // battle_calc_element_damage: 41 × 50 / 100.
    expect(hit([bonus('bAtkEle', 3)]).normal.avg).toBe(20);
  });

  it('applies bAddRace for the target race and RC_ALL as a card fix after element', () => {
    // battle_calc_cardfix: cardfix 1000 × 120 / 100; 41 − 41 × (1000 − 1200) / 1000 = 49.
    expect(hit([bonus('bAddRace', RC_PLANT, 20)]).normal.avg).toBe(49);
    expect(hit([bonus('bAddRace', RC_ALL, 20)]).normal.avg).toBe(49);
    expect(hit([bonus('bAddRace', 7, 20)]).normal.avg).toBe(41);
    // Fire first: 20, then + 20 % = 24.
    expect(hit([bonus('bAtkEle', 3), bonus('bAddRace', RC_PLANT, 20)]).normal.avg).toBe(24);
  });

  it('applies bAddEle for the target element and Ele_All, before race for melee', () => {
    // The test monster is Water (Ele_Water 1); Ele_All is 10. 41 × 1200 / 1000 = 49.
    expect(hit([bonus('bAddEle', 1, 20)]).normal.avg).toBe(49);
    expect(hit([bonus('bAddEle', 10, 20)]).normal.avg).toBe(49);
    expect(hit([bonus('bAddEle', 3, 20)]).normal.avg).toBe(41);
    // battle_calc_cardfix melee: 1000 → 1100 (element) → 1210 (race), as race then size above.
    const result = hit([bonus('bAddEle', 1, 10), bonus('bAddRace', RC_PLANT, 10)], {
      partial: strStats,
    });
    expect(result.crit.avg).toBe(248);
  });

  it('multiplies race, size and class card fixes one after another for melee', () => {
    // 1000 → 1100 (race) → 1210 (size medium): 205 + 205 × 210 / 1000 = 248.05 → 248, not 246.
    const result = hit([bonus('bAddRace', RC_PLANT, 10), bonus('bAddSize', 1, 10)], {
      partial: strStats,
    });
    expect(result.crit.avg).toBe(248);
    expect(hit([bonus('bAddClass', CLASS_NORMAL, 10)], { partial: strStats }).crit.avg).toBe(225);
  });

  it('multiplies per race group for melee but adds them up for arrow attacks', () => {
    const goblinOrc = testMonster({ raceGroups: ['Goblin', 'Orc'] });
    const effects = [bonus('bAddRace2', 1, 10), bonus('bAddRace2', 3, 10)];
    // Melee: 1210 → 205 + 43.05 = 248.
    expect(hit(effects, { monster: goblinOrc, partial: strStats }).crit.avg).toBe(248);
    // Bow with DEX 99: crit 15 + base ATK 180 = 195; arrow branch 1200: 195 + 39 = 234.
    const bowCrit = hit(effects, {
      monster: goblinOrc,
      weapon: bow,
      partial: { baseStats: stats({ dex: 99 }) },
    });
    expect(bowCrit.crit.avg).toBe(234);
  });

  it('applies bLongAtkRate to bows and guns only (BF_LONG normal attacks)', () => {
    // Bow crit with stats 1: ATK 15 + base ATK 1 = 16; + 50 % = 24.
    expect(hit([bonus('bLongAtkRate', 50)], { weapon: bow, partial: {} }).crit.avg).toBe(24);
    expect(hit([bonus('bLongAtkRate', 50)], { partial: strStats }).crit.avg).toBe(205);
  });

  it('ignores DEF with bIgnoreDefRace, but not from a shield (lr_flag LR_FLAG_SHIELD)', () => {
    const armored = testMonster({ defense: 50 });
    // attack_ignores_def: no hard or soft DEF, 42.
    expect(hit([bonus('bIgnoreDefRace', RC_PLANT)], { monster: armored }).normal.avg).toBe(42);
    expect(hit([bonus('bIgnoreDefClass', CLASS_NORMAL)], { monster: armored }).normal.avg).toBe(42);
    // From a shield it does nothing: 42 × 50 / 100 − 1 = 20.
    const shielded = hit([bonus('bIgnoreDefRace', RC_PLANT)], {
      monster: armored,
      slot: 'leftHand',
    });
    expect(shielded.normal.avg).toBe(20);
  });

  it('turns DEF into damage with bDefRatioAtkClass (is_attack_piercing)', () => {
    // Hard DEF 50, soft DEF 40..43: 42 × (90..93) / 100 = 37, 38, 38, 39.
    const tough = testMonster({ defense: 50, vit: 40 });
    const result = hit([bonus('bDefRatioAtkClass', CLASS_NORMAL)], { monster: tough });
    expect(result.normal).toEqual({ min: 37, max: 39, avg: 38 });
    // Crits are never piercing and ignore DEF: 42.
    expect(result.crit.avg).toBe(42);
  });

  it('lowers hard and soft DEF with bIgnoreDefRaceRate (battle_calc_defense_reduction)', () => {
    const tough = testMonster({ defense: 50, vit: 40 });
    // Without: 42 × 50 / 100 = 21 − 40..43 → 1.
    expect(hit([], { monster: tough }).normal.avg).toBe(1);
    // 50 %: DEF 25, VIT 20 (soft DEF exactly 20): 42 × 75 / 100 = 31 − 20 = 11.
    expect(hit([bonus('bIgnoreDefRaceRate', RC_PLANT, 50)], { monster: tough }).normal.avg).toBe(
      11,
    );
  });

  it('adds bCritAtkRate to crits only, on the base damage (battle_calc_skill_base_damage)', () => {
    const result = hit([bonus('bCritAtkRate', 50)]);
    // 42 + 21 = 63; normal hits unchanged.
    expect(result.crit.avg).toBe(63);
    expect(result.normal.avg).toBe(41);
  });

  it('skips the size modifier with bNoSizeFix', () => {
    const small = testMonster({ size: 'small' });
    // 25 × 75 / 100 = 18 + 17 − 1 = 34; without size fix 41.
    expect(hit([], { monster: small }).normal.avg).toBe(34);
    expect(hit([bonus('bNoSizeFix')], { monster: small }).normal.avg).toBe(41);
  });

  it('adds bCriticalAddRace × 10 to the crit roll (is_attack_critical)', () => {
    // LUK 30: cri 10 + 100 = 110, − 2 × 30 = 50 → 5 %; + 50 → 10 %.
    const partial = { baseStats: stats({ luk: 30 }) };
    expect(hit([], { partial }).critChance).toBe(0.05);
    expect(hit([bonus('bCriticalAddRace', RC_PLANT, 5)], { partial }).critChance).toBe(0.1);
  });

  it('hits outright with the highest bPerfectHitRate before the hit roll (is_attack_hitting)', () => {
    const evasive = testMonster({ level: 99, agi: 99 });
    // Hit rate 80 + HIT 130 − FLEE 198 = 12 %; perfect hit 20 %: 0.2 + 0.8 × 0.12.
    const result = hit([bonus('bPerfectHitRate', 20), bonus('bPerfectHitRate', 10)], {
      monster: evasive,
    });
    expect(result.hitChance).toBeCloseTo(0.296, 10);
  });
});

describe('dual wield (battle_calc_weapon_attack with damage2)', () => {
  const dualTables: TablesFile = {
    ...tables,
    sizeModifier: { ...tables.sizeModifier, Dagger: { small: 100, medium: 75, large: 50 } },
    elementModifier: [{ Neutral: { Neutral: 100, Water: 100 }, Fire: { Neutral: 100, Water: 50 } }],
  };
  const RC_PLANT = 3;
  // ATK 40 dagger; with DEX 80 every roll is 40, size 75 % on Poring → 30.
  const dagger = testWeapon({ id: 1201, weaponType: 'Dagger', attack: 40 });
  // DEX 80: base ATK 1 + 0 + 16 + 0 = 17, so each hand's base damage is 30 + 17 = 47.
  const dexStats = { baseStats: stats({ dex: 80 }) };

  function dual(
    leftEffects: ScriptStmt[] = [],
    { monster = poring, partial = dexStats as Partial<CharacterBase>, right = true } = {},
  ) {
    const equipment: EquippedItem[] = [
      { slot: 'leftHand', item: { ...dagger, id: 1202, effects: leftEffects }, refine: 0 },
    ];
    if (right) equipment.push({ slot: 'rightHand', item: dagger, refine: 0 });
    return autoAttack(gearCharacter(equipment, partial), monster, dualTables, rAthenaDefaults);
  }

  it('scales right by 50 % and left by 30 % at mastery 0 (battle_calc_attack_left_right_hands)', () => {
    const result = dual();
    // 47 − soft DEF 1 = 46 per hand: right 46 × 50 / 100 = 23, left 46 × 30 / 100 = 13.
    expect(result.normal).toEqual({ min: 23, max: 23, avg: 23 });
    expect(result.left?.normal).toEqual({ min: 13, max: 13, avg: 13 });
    // Crits skip DEF on both hands: 47 → 23 and 14.
    expect(result.crit.avg).toBe(23);
    expect(result.left?.crit.avg).toBe(14);
  });

  it('adds both hands to DPS on the same hit and crit roll', () => {
    const result = dual();
    // amotion (500 + 500) × 7 / 10 = 700 − trunc(700 × 84 / 1000) = 642; no crits, always hits.
    expect(result.amotion).toBe(642);
    expect(result.dps).toBeCloseTo((1000 / 1284) * (23 + 13), 10);
  });

  it('uses the left weapon’s own bAtkEle for the left hand only (lhw.ele)', () => {
    const result = dual([bonus('bAtkEle', 3)]);
    // Left: 46 × 50 % (Fire vs Water) = 23 → × 30 % = 6; right stays Neutral.
    expect(result.left?.normal.avg).toBe(6);
    expect(result.normal.avg).toBe(23);
  });

  it('moves the left weapon’s card bonuses to the right hand (left_cardfix_to_right)', () => {
    const result = dual([bonus('bAddRace', RC_PLANT, 20)]);
    // Right: 46 + 9 = 55 → × 50 % = 27. Left: card fix untouched, 13.
    expect(result.normal.avg).toBe(27);
    expect(result.left?.normal.avg).toBe(13);
  });

  it('moves the left weapon’s ignore-DEF flag to the right hand (attack_ignores_def)', () => {
    const armored = testMonster({ defense: 50 });
    const result = dual([bonus('bIgnoreDefRace', RC_PLANT)], { monster: armored });
    // Right ignores DEF: 47 → 23. Left: 47 × 50 / 100 = 23 − 1 = 22 → 6.
    expect(result.normal.avg).toBe(23);
    expect(result.left?.normal.avg).toBe(6);
  });

  it('floors the left hand at 0, not 1, after DEF (battle_min_damage)', () => {
    const wall = testMonster({ defense: 100, vit: 1 });
    const result = dual([], { monster: wall });
    // Hard DEF 100 leaves 0, − 1: right floors at 1 → max(1, 0) = 1; left stays 0.
    expect(result.normal.avg).toBe(1);
    expect(result.left?.normal).toEqual({ min: 0, max: 0, avg: 0 });
  });

  it('adds the left weapon’s refine and overupgrade to the left hand (lhw.atk2, left_weapon.overrefine)', () => {
    const left = { ...dagger, id: 1202 };
    const input = character({
      ...dexStats,
      weapon: dagger,
      leftWeapon: left,
      leftWeaponRefine: { atk: 10, overrefine: 2 },
    });
    const result = autoAttack(input, poring, dualTables, rAthenaDefaults);
    // Left: 47 + {1, 2} − 1 + 10 = 57 or 58 → 17 either way; right unchanged 23.
    expect(result.left?.normal).toEqual({ min: 17, max: 17, avg: 17 });
    expect(result.normal.avg).toBe(23);
  });

  it('matches brute force for the left hand partly at its floor of 0', () => {
    // STR 99, DEX 10: base ATK 99 + 81 + 2 = 182. Weapon level 4 left dagger:
    // min 10 × 160 / 100 = 16, rolls 16..39, size 75 %. Soft DEF 200..299.
    const tank = testMonster({ vit: 200 });
    const leftWeapon = { ...dagger, id: 1202, weaponLevel: 4 };
    const input = character({
      baseStats: stats({ str: 99, dex: 10 }),
      weapon: dagger,
      leftWeapon,
    });
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (let weaponValue = 16; weaponValue <= 39; weaponValue++) {
      for (let softDef = 200; softDef <= 299; softDef++) {
        let damage = Math.max(0, Math.trunc((weaponValue * 75) / 100) + 182 - softDef);
        if (damage !== 0) damage = Math.max(1, Math.trunc((damage * 30) / 100));
        min = Math.min(min, damage);
        max = Math.max(max, damage);
        sum += damage;
        count++;
      }
    }
    const result = autoAttack(input, tank, dualTables, rAthenaDefaults);
    expect(result.left?.normal.min).toBe(min);
    expect(result.left?.normal.max).toBe(max);
    expect(result.left?.normal.avg).toBeCloseTo(sum / count, 10);
    // The case must reach the floor and the minimum of 1 after the rate.
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(1);
  });

  it('deals an unarmed right-hand hit and a 30 % left hit with only a left weapon', () => {
    const result = dual([], { right: false });
    // Right: bare hands, base ATK 17 − 1 = 16, no hand rate. Left: 46 → 13.
    expect(result.normal.avg).toBe(16);
    expect(result.left?.normal.avg).toBe(13);
  });

  it('has no left hand with a shield or a katar', () => {
    const shield = testArmor({ id: 2101, locations: ['Left_Hand'] });
    const shielded = gearCharacter(
      [
        { slot: 'rightHand', item: dagger, refine: 0 },
        { slot: 'leftHand', item: shield, refine: 0 },
      ],
      dexStats,
    );
    const result = autoAttack(shielded, poring, dualTables, rAthenaDefaults);
    expect(result.left).toBeNull();
    // A shield does not halve the right hand: 46.
    expect(result.normal.avg).toBe(46);
    expect(attack({ weapon: katar }).left).toBeNull();
  });
});
