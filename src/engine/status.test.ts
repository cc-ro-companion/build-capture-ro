import { describe, expect, it } from 'vitest';
import { jobsData } from '../data';
import type { ScriptStmt } from '../data/types';
import { rAthenaDefaults } from './config';
import { totalStats } from './stats';
import { attackMotion, baseAtk, maxHp, maxSp, statusWindow } from './status';
import { bonus, character, gearCharacter, stats, testArmor, testWeapon } from './testData';

const bow = testWeapon({ id: 1701, weaponType: 'Bow', attack: 15, weaponLevel: 1 });
const katar = testWeapon({ id: 1250, weaponType: 'Katar', attack: 148, weaponLevel: 3 });

describe('base ATK (status_base_atk, BL_PC pre-renewal)', () => {
  it('uses STR as main stat for a sword: STR + (STR/10)² + DEX/5 + LUK/5', () => {
    // 50 + 25 + 30/5 + 10/5 = 83
    expect(baseAtk(stats({ str: 50, dex: 30, luk: 10 }), '1hSword')).toBe(83);
  });

  it('swaps STR and DEX for a bow: DEX + (DEX/10)² + STR/5 + LUK/5', () => {
    // 80 + 64 + 10/5 + 5/5 = 147
    expect(baseAtk(stats({ str: 10, dex: 80, luk: 5 }), 'Bow')).toBe(147);
  });

  it('truncates every division', () => {
    // 19 + 1 + 4/5=0 + 9/5=1 = 21
    expect(baseAtk(stats({ str: 19, dex: 4, luk: 9 }), 'Fist')).toBe(21);
  });
});

describe('status window', () => {
  it('shows base ATK + weapon ATK, HIT, FLEE, perfect dodge and CRIT', () => {
    const window = statusWindow(
      character({
        baseLevel: 50,
        baseStats: stats({ str: 50, agi: 30, dex: 30, luk: 10 }),
        weapon: testWeapon(),
      }),
      rAthenaDefaults,
    );
    expect(window.atk).toEqual([83 + 25, 0]);
    expect(window.hit).toBe(50 + 30);
    expect(window.flee).toBe(50 + 30);
    // flee2 = LUK + 10 = 20 tenths
    expect(window.perfectDodge).toBe(2);
    // cri = 10 + 10 × 10 / 3 = 43 tenths → 4 shown
    expect(window.critRate).toBe(43);
    expect(window.crit).toBe(4);
  });

  it('shows refine ATK right of the "+" (pc_rightside_atk pre-renewal: rhw.atk2)', () => {
    const window = statusWindow(
      character({ weapon: testWeapon(), weaponRefine: { atk: 14, overrefine: 0 } }),
      rAthenaDefaults,
    );
    expect(window.atk[1]).toBe(14);
  });

  it('uses DEX for the ATK of a bow', () => {
    const window = statusWindow(
      character({ baseStats: stats({ str: 10, dex: 80, luk: 5 }), weapon: bow }),
      rAthenaDefaults,
    );
    expect(window.atk).toEqual([147 + 15, 0]);
  });

  it('doubles a katar critical rate after the LUK formula', () => {
    const window = statusWindow(
      character({ baseStats: stats({ luk: 30 }), weapon: katar }),
      rAthenaDefaults,
    );
    // (10 + 30 × 10 / 3) × 2 = 220 tenths → 22 shown
    expect(window.critRate).toBe(220);
    expect(window.crit).toBe(22);
  });
});

describe('ASPD (status_base_amotion_pc pre-renewal)', () => {
  it('bare hands: Fist delay reduced by (4 AGI + DEX) / 1000', () => {
    const input = character({ baseStats: stats({ agi: 30, dex: 20 }) });
    // 400 − 400 × 140 / 1000 = 400 − 56 = 344
    expect(attackMotion(input, rAthenaDefaults)).toBe(344);
    const window = statusWindow(input, rAthenaDefaults);
    expect(window.aspdExact).toBeCloseTo(165.6);
    expect(window.aspd).toBe(165);
  });

  it('one-handed sword: truncates the reduction', () => {
    const input = character({ baseStats: stats({ agi: 50, dex: 30 }), weapon: testWeapon() });
    // 550 − trunc(550 × 230 / 1000 = 126.5) = 424 → ASPD 157.6
    expect(attackMotion(input, rAthenaDefaults)).toBe(424);
    expect(statusWindow(input, rAthenaDefaults).aspd).toBe(157);
  });

  it('bow: uses the job delay for bows', () => {
    const input = character({ baseStats: stats({ agi: 40, dex: 60 }), weapon: bow });
    // 700 − 700 × 220 / 1000 = 700 − 154 = 546
    expect(attackMotion(input, rAthenaDefaults)).toBe(546);
  });

  it('caps at max_aspd 190 (amotion 100)', () => {
    const input = character({ baseStats: stats({ agi: 180, dex: 100 }) });
    // 400 − 400 × 820 / 1000 = 72, capped to 2000 − 190 × 10 = 100
    expect(attackMotion(input, rAthenaDefaults)).toBe(100);
    expect(statusWindow(input, rAthenaDefaults).aspd).toBe(190);
  });

  it('takes the cap from the config', () => {
    const input = character({ baseStats: stats({ agi: 180, dex: 100 }) });
    expect(attackMotion(input, { ...rAthenaDefaults, maxAspd: 195 })).toBe(72);
  });

  it('uses rAthena’s 2000 delay for a weapon type the job has no entry for', () => {
    const input = character({ weapon: testWeapon({ weaponType: '2hAxe' }) });
    // 2000 − 2000 × 5 / 1000 = 1990
    expect(attackMotion(input, rAthenaDefaults)).toBe(1990);
  });
});

describe('status window with equipment bonuses (status_calc_pc_sub, status_calc_misc)', () => {
  const wearing = (effects: ScriptStmt[], partial: Parameters<typeof gearCharacter>[1] = {}) =>
    gearCharacter(
      [{ slot: 'armor', item: testArmor({ defense: 0, effects }), refine: 0 }],
      partial,
    );
  const window = (effects: ScriptStmt[], partial: Parameters<typeof gearCharacter>[1] = {}) =>
    statusWindow(wearing(effects, partial), rAthenaDefaults);

  it('adds stat bonuses to the stats every formula reads (param_equip)', () => {
    // STR 1 + 9 = 10: base ATK 10 + 1² + 0 + 0 = 11 with bare hands.
    expect(window([bonus('bStr', 9)]).baseAtk).toBe(11);
  });

  it('never lets a stat go below 0 (cap_value(i, 0, USHRT_MAX))', () => {
    expect(totalStats(wearing([bonus('bLuk', -5)])).luk).toBe(0);
  });

  it('adds bBaseAtk to base ATK (pc_bonus SP_BASE_ATK pre-renewal: status->batk)', () => {
    // Base ATK 1 with all stats 1, + 15.
    expect(window([bonus('bBaseAtk', 15)]).atk).toEqual([16, 0]);
  });

  it('adds bHit before level + DEX and applies bHitRate after (sd->hit_rate)', () => {
    // (10 + 50 + 1) × 110 / 100 = 67.
    expect(window([bonus('bHit', 10), bonus('bHitRate', 10)]).hit).toBe(67);
  });

  it('adds bFlee and bFlee2 (× 10 tenths)', () => {
    const result = window([bonus('bFlee', 7), bonus('bFlee2', 3)]);
    expect(result.flee).toBe(7 + 50 + 1);
    // 30 + LUK 1 + 10 = 41 tenths.
    expect(result.perfectDodge).toBe(4);
  });

  it('adds bCritical × 10, then bCriticalRate, then doubles for katars', () => {
    // 50 + 10 + 3 = 63 tenths; × 120 / 100 = 75.
    const plain = window([bonus('bCritical', 5), bonus('bCriticalRate', 20)], {
      baseStats: stats({ luk: 1 }),
    });
    expect(plain.critRate).toBe(75);
    const katarCharacter = gearCharacter([
      { slot: 'rightHand', item: katar, refine: 0 },
      { slot: 'armor', item: testArmor({ effects: [bonus('bCritical', 5)] }), refine: 0 },
    ]);
    // (50 + 13) × 2.
    expect(statusWindow(katarCharacter, rAthenaDefaults).critRate).toBe(126);
  });

  it('subtracts bAspd × 10 from amotion, then applies bAspdRate (aspd_rate − 10 per point)', () => {
    // Fist 400 with AGI 1, DEX 1: 400 − 2 = 398; − 20 = 378; × 900 / 1000 = 340.
    expect(
      attackMotion(wearing([bonus('bAspd', 2), bonus('bAspdRate', 10)]), rAthenaDefaults),
    ).toBe(340);
  });

  it('sums item DEF, refine DEF and bDef, applies bDefRate and caps at max_def', () => {
    const shield = testArmor({ id: 2101, defense: 3, locations: ['Left_Hand'] });
    const armor = testArmor({ defense: 5, effects: [bonus('bDef', 2), bonus('bDefRate', 50)] });
    const character = gearCharacter([
      { slot: 'armor', item: armor, refine: 0 },
      { slot: 'leftHand', item: shield, refine: 0 },
    ]);
    // (5 + 3 + 2) × 150 / 100 = 15; def2 = VIT.
    expect(statusWindow(character, rAthenaDefaults).def).toEqual([15, 1]);
    expect(window([bonus('bDef', 120)]).def[0]).toBe(99);
  });

  it('shows MDEF from bMdef and INT + VIT / 2', () => {
    const result = window([bonus('bMdef', 4)], { baseStats: stats({ int: 30, vit: 21 }) });
    expect(result.mdef).toEqual([4, 30 + 10]);
  });
});

describe('max HP and SP (status_calc_maxhp_pc, status_calc_maxsp_pc)', () => {
  const hpCharacter = (effects: ScriptStmt[], vit = 1) =>
    gearCharacter([{ slot: 'armor', item: testArmor({ effects }), refine: 0 }], {
      baseStats: stats({ vit, int: vit }),
    });

  it('multiplies the base HP of the level by 1 + VIT / 100', () => {
    // Test job HP at level 50: 40 + 5 × 49 = 285; × 1.20 = 342.
    expect(maxHp(hpCharacter([], 20), rAthenaDefaults)).toBe(342);
  });

  it('adds equipment VIT once more, bMaxHP, then bMaxHPrate on the sum', () => {
    // VIT 1 + 9 = 10: 285 × 1.1 = 313.5, + 9 + 100 = 422.5, × 1.10 = 464.75 → 464.
    const character = hpCharacter([
      bonus('bVit', 9),
      bonus('bMaxHP', 100),
      bonus('bMaxHPrate', 10),
    ]);
    expect(maxHp(character, rAthenaDefaults)).toBe(464);
  });

  it('does the same for SP with INT, bMaxSP and bMaxSPrate', () => {
    // Test job SP at level 50: 11 + 49 = 60; INT 1 + 4 = 5: 60 × 1.05 = 63, + 4 + 10 = 77, × 0.9 = 69.3.
    const character = hpCharacter([
      bonus('bInt', 4),
      bonus('bMaxSP', 10),
      bonus('bMaxSPrate', -10),
    ]);
    expect(maxSp(character, rAthenaDefaults)).toBe(69);
  });

  it('uses the shipped base HP table and caps at max_hp_lv99', () => {
    const knight = jobsData.jobs.find((job) => job.key === 'Knight');
    if (!knight) throw new Error('Knight missing');
    const character = gearCharacter([], { job: knight, baseLevel: 99, baseStats: stats() });
    // job_basepoints.yml Knight level 99: 7978; VIT 1 + job bonus 1: × 1.02 = 8137.56.
    expect(maxHp(character, rAthenaDefaults)).toBe(8137);
    expect(maxHp(character, { ...rAthenaDefaults, maxHp: 8000 })).toBe(8000);
  });
});
