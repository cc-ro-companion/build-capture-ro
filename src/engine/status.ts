// Status window values (ATK, HIT, FLEE, CRIT, ASPD) as rAthena pre-renewal
// computes them for a player, without skills, buffs or equipment bonuses.
import type { BonusStats } from '../data/types';
import type { EngineConfig } from './config';
import { totalStats, type CharacterInput } from './stats';

/** Weapon types whose base ATK uses DEX as the main stat (`status_base_atk`). */
const DEX_MAIN_WEAPON_TYPES = new Set([
  'Bow',
  'Musical',
  'Whip',
  'Revolver',
  'Rifle',
  'Gatling',
  'Shotgun',
  'Grenade',
]);

/** Weapon types whose normal attacks use the arrow path in `battle_calc_base_damage`. */
const ARROW_WEAPON_TYPES = new Set(['Bow', 'Revolver', 'Rifle', 'Gatling', 'Shotgun', 'Grenade']);

/** rAthena's delay for weapon types missing from a job's job_aspd.yml entry. */
const UNLISTED_WEAPON_DELAY = 2000;
/** status.hpp `MIN_ASPD / AMOTION_DIVIDER_PC`: slowest possible amotion. */
const MAX_AMOTION = 4000;
/** status.hpp `AMOTION_ZERO_ASPD`. */
const AMOTION_ZERO_ASPD = 2000;
/** status.hpp `AMOTION_INTERVAL`. */
const AMOTION_INTERVAL = 10;

export function weaponTypeOf(input: CharacterInput): string {
  return input.weapon?.weaponType ?? 'Fist';
}

export function isDexMainWeapon(weaponType: string): boolean {
  return DEX_MAIN_WEAPON_TYPES.has(weaponType);
}

export function usesArrowPath(weaponType: string): boolean {
  return ARROW_WEAPON_TYPES.has(weaponType);
}

/** `status_base_atk`, BL_PC pre-renewal branch. */
export function baseAtk(total: BonusStats, weaponType: string): number {
  const dexMain = isDexMainWeapon(weaponType);
  const main = dexMain ? total.dex : total.str;
  const secondary = dexMain ? total.str : total.dex;
  const tens = Math.trunc(main / 10);
  return main + tens * tens + Math.trunc(secondary / 5) + Math.trunc(total.luk / 5);
}

/**
 * Critical rate in tenths of a percent (`status->cri`): `status_calc_misc`
 * gives 10 + LUK × 10 / 3, `status_calc_critical` floors it at 10, and
 * `status_calc_bl_main` doubles it for katars after that.
 */
export function criticalRate(total: BonusStats, weaponType: string): number {
  const cri = Math.max(10, 10 + Math.trunc((total.luk * 10) / 3));
  return weaponType === 'Katar' ? cri * 2 : cri;
}

/**
 * Attack motion in ms (`status->amotion`): `status_base_amotion_pc`
 * pre-renewal, capped as in `status_calc_pc_sub` by `pc_maxaspd`.
 */
export function attackMotion(input: CharacterInput, config: EngineConfig): number {
  const total = totalStats(input);
  const base = input.job.baseAspd[weaponTypeOf(input)] ?? UNLISTED_WEAPON_DELAY;
  const amotion = base - Math.trunc((base * (4 * total.agi + total.dex)) / 1000);
  const fastest = AMOTION_ZERO_ASPD - config.maxAspd * AMOTION_INTERVAL;
  return Math.min(Math.max(amotion, fastest), MAX_AMOTION);
}

/** ASPD as the client derives it from amotion, with its one decimal. */
export function aspdFromAmotion(amotion: number): number {
  return (AMOTION_ZERO_ASPD - amotion) / AMOTION_INTERVAL;
}

export interface StatusWindow {
  /**
   * The two ATK numbers the status window shows: `pc_leftside_atk`
   * (base ATK + weapon ATK) and `pc_rightside_atk` (refine bonus, 0 for now).
   */
  atk: [number, number];
  /** Base ATK from stats alone. */
  baseAtk: number;
  /** Weapon ATK (`rhw.atk`). */
  weaponAtk: number;
  hit: number;
  flee: number;
  /** Perfect dodge as shown (`flee2 / 10`). */
  perfectDodge: number;
  /** CRIT as shown (`cri / 10`). */
  crit: number;
  /** Raw critical rate in tenths of a percent. */
  critRate: number;
  amotion: number;
  /** ASPD with one decimal. */
  aspdExact: number;
  /**
   * ASPD as the status window shows it. The client truncates: amotion 633
   * (ASPD 136.7) shows as 136 in ccRO.
   */
  aspd: number;
}

export function statusWindow(input: CharacterInput, config: EngineConfig): StatusWindow {
  const total = totalStats(input);
  const weaponType = weaponTypeOf(input);
  const batk = baseAtk(total, weaponType);
  const weaponAtk = input.weapon?.attack ?? 0;
  const critRate = criticalRate(total, weaponType);
  const amotion = attackMotion(input, config);
  const aspdExact = aspdFromAmotion(amotion);
  return {
    atk: [batk + weaponAtk, 0],
    baseAtk: batk,
    weaponAtk,
    // status_calc_misc pre-renewal: HIT = level + DEX, FLEE = level + AGI, both at least 1.
    hit: Math.max(1, input.baseLevel + total.dex),
    flee: Math.max(1, input.baseLevel + total.agi),
    // enable_perfect_flee covers players: flee2 = LUK + 10, in tenths.
    perfectDodge: Math.trunc((total.luk + 10) / 10),
    crit: Math.trunc(critRate / 10),
    critRate,
    amotion,
    aspdExact,
    aspd: Math.floor(aspdExact),
  };
}
