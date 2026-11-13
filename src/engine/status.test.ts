import { describe, expect, it } from 'vitest';
import { rAthenaDefaults } from './config';
import { attackMotion, baseAtk, statusWindow } from './status';
import { character, stats, testWeapon } from './testData';

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
