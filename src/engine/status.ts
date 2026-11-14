// Status window values as rAthena pre-renewal computes them for a player in
// status_calc_pc_sub and status_calc_misc, with equipment bonuses but without
// skills or buffs.
import type { BonusStats } from '../data/types';
import { BonusSet } from './bonuses';
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

/** Weapon types that pair into a dual-wield type (`pc_calcweapontype` W_DOUBLE_*). */
const DUAL_WIELD_TYPES = new Set(['Dagger', '1hSword', '1hAxe']);

/**
 * `sd->status.weapon`: the right-hand type, or the left-hand type when only
 * the left hand holds a weapon (`pc_calcweapontype`). A dual-wield pair gets
 * its own W_DOUBLE_* type, which only `attackMotion` reads differently: every
 * pair member is a STR-based melee weapon, so the other checks give the same
 * answer for the right hand's type.
 */
export function weaponTypeOf(input: CharacterInput): string {
  return input.weapon?.weaponType ?? input.leftWeapon?.weaponType ?? 'Fist';
}

/** Right and left weapon types when both hands hold a pair with a W_DOUBLE_* type, else null. */
export function dualWieldPair(input: CharacterInput): [string, string] | null {
  const right = input.weapon?.weaponType;
  const left = input.leftWeapon?.weaponType;
  if (right === undefined || left === undefined) return null;
  return DUAL_WIELD_TYPES.has(right) && DUAL_WIELD_TYPES.has(left) ? [right, left] : null;
}

export function isDexMainWeapon(weaponType: string): boolean {
  return DEX_MAIN_WEAPON_TYPES.has(weaponType);
}

export function usesArrowPath(weaponType: string): boolean {
  return ARROW_WEAPON_TYPES.has(weaponType);
}

/** status.hpp `DEFTYPE_MIN`/`DEFTYPE_MAX`: pre-renewal DEF is a signed char. */
const DEFTYPE_MIN = -128;
const DEFTYPE_MAX = 127;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** `status_base_atk`, BL_PC pre-renewal branch. */
export function baseAtk(total: BonusStats, weaponType: string): number {
  const dexMain = isDexMainWeapon(weaponType);
  const main = dexMain ? total.dex : total.str;
  const secondary = dexMain ? total.str : total.dex;
  const tens = Math.trunc(main / 10);
  return main + tens * tens + Math.trunc(secondary / 5) + Math.trunc(total.luk / 5);
}

/**
 * Critical rate in tenths of a percent (`status->cri`): `bCritical` × 10 plus
 * `status_calc_misc`'s 10 + LUK × 10 / 3 (at least 1), times
 * `critical_rate` (100 + `bCriticalRate`) / 100, then `status_calc_critical`
 * floors it at 10 and `status_calc_bl_main` doubles it for katars.
 */
export function criticalRate(
  total: BonusStats,
  weaponType: string,
  bonuses: BonusSet = new BonusSet([]),
): number {
  let cri = Math.max(1, bonuses.sum('bCritical') * 10 + 10 + Math.trunc((total.luk * 10) / 3));
  const rate = Math.max(0, 100 + bonuses.sum('bCriticalRate'));
  if (rate !== 100) cri = Math.trunc((cri * rate) / 100);
  cri = Math.max(10, cri);
  return weaponType === 'Katar' ? cri * 2 : cri;
}

/**
 * Attack motion in ms (`status->amotion`): `status_base_amotion_pc`
 * pre-renewal including `bAspd` (`aspd_add` −10 per point), times
 * `aspd_rate` (1000 − 10 per `bAspdRate` point) / 1000 in
 * `status_calc_bl_main`, capped by `pc_maxaspd`.
 */
export function attackMotion(input: CharacterInput, config: EngineConfig): number {
  const total = totalStats(input);
  const { bonuses } = input;
  const delay = (weaponType: string) => input.job.baseAspd[weaponType] ?? UNLISTED_WEAPON_DELAY;
  // Pre-renewal has no shield delay: a shield leaves `weapontype2` at W_FIST
  // and only its script bonuses change ASPD. A dual-wield pair takes 70 % of
  // both hands' delays.
  const pair = dualWieldPair(input);
  const base = pair
    ? Math.trunc(((delay(pair[0]) + delay(pair[1])) * 7) / 10)
    : delay(weaponTypeOf(input));
  let amotion = base - Math.trunc((base * (4 * total.agi + total.dex)) / 1000);
  amotion -= 10 * bonuses.sum('bAspd');
  const aspdRate = Math.max(0, 1000 - 10 * bonuses.sum('bAspdRate'));
  amotion = Math.trunc((amotion * aspdRate) / 1000);
  const fastest = AMOTION_ZERO_ASPD - config.maxAspd * AMOTION_INTERVAL;
  return Math.min(Math.max(amotion, fastest), MAX_AMOTION);
}

/** `status->batk`: `bBaseAtk` plus `status_base_atk` (status_calc_misc adds to it). */
export function totalBaseAtk(input: CharacterInput): number {
  return input.bonuses.sum('bBaseAtk') + baseAtk(totalStats(input), weaponTypeOf(input));
}

/**
 * `status->hit`: `bHit` + level + DEX (at least 1, status_calc_misc), times
 * `hit_rate` (100 + `bHitRate`) / 100, at least 1 (`status_calc_hit`).
 */
export function hitValue(input: CharacterInput): number {
  const hit = Math.max(1, input.bonuses.sum('bHit') + input.baseLevel + totalStats(input).dex);
  const rate = Math.max(0, 100 + input.bonuses.sum('bHitRate'));
  return Math.max(1, rate === 100 ? hit : Math.trunc((hit * rate) / 100));
}

/**
 * Equipment DEF (`status->def`): item and refine DEF plus `bDef`, times
 * `def_rate` (100 + `bDefRate`) / 100, then capped at `max_def`. rAthena
 * stores it in a signed char and wraps on overflow; it is clamped here,
 * which only differs for totals no real gear reaches.
 */
export function equipmentDef(input: CharacterInput, config: EngineConfig): number {
  let def = input.equipmentDef + input.bonuses.sum('bDef');
  const rate = Math.max(0, 100 + input.bonuses.sum('bDefRate'));
  if (rate !== 100) def = Math.trunc((def * rate) / 100);
  return Math.min(clamp(def, DEFTYPE_MIN, DEFTYPE_MAX), config.maxDef);
}

/** Equipment MDEF (`status->mdef`): `bMdef`, capped at `max_def`. */
export function equipmentMdef(input: CharacterInput, config: EngineConfig): number {
  return Math.min(clamp(input.bonuses.sum('bMdef'), DEFTYPE_MIN, DEFTYPE_MAX), config.maxDef);
}

/**
 * `status_calc_maxhp_pc` / `status_calc_maxsp_pc`: base points × (1 + stat
 * / 100), plus the stat's equipment bonus once more, plus the flat bonus,
 * plus rate − 100 percent of that, truncated, then capped. rAthena computes
 * in doubles, as JavaScript does.
 */
function maxPoints(
  basePoints: number,
  stat: number,
  equipStat: number,
  flat: number,
  rate: number,
  cap: number,
): number {
  let points = basePoints;
  if (stat > 0) points *= 1.0 + stat * 0.01;
  points += equipStat + flat;
  points += (points * (rate - 100)) / 100;
  return clamp(Math.trunc(Math.max(points, 1)), 1, cap);
}

function basePointsAt(table: readonly number[], baseLevel: number): number {
  return table[clamp(baseLevel, 1, table.length) - 1] ?? 0;
}

export function maxHp(input: CharacterInput, config: EngineConfig): number {
  const { bonuses } = input;
  return maxPoints(
    basePointsAt(input.job.baseHp, input.baseLevel),
    totalStats(input).vit,
    input.equipmentStats.vit,
    bonuses.sum('bMaxHP'),
    100 + bonuses.sum('bMaxHPrate'),
    config.maxHp,
  );
}

export function maxSp(input: CharacterInput, config: EngineConfig): number {
  const { bonuses } = input;
  return maxPoints(
    basePointsAt(input.job.baseSp, input.baseLevel),
    totalStats(input).int,
    input.equipmentStats.int,
    bonuses.sum('bMaxSP'),
    100 + bonuses.sum('bMaxSPrate'),
    config.maxSp,
  );
}

/** ASPD as the client derives it from amotion, with its one decimal. */
export function aspdFromAmotion(amotion: number): number {
  return (AMOTION_ZERO_ASPD - amotion) / AMOTION_INTERVAL;
}

export interface StatusWindow {
  /**
   * The two ATK numbers the status window shows: `pc_leftside_atk`
   * (base ATK + both hands' weapon ATK) and `pc_rightside_atk` (both hands'
   * refine ATK, `rhw.atk2 + lhw.atk2`).
   */
  atk: [number, number];
  /** Base ATK (`status->batk`): `bBaseAtk` plus the stat-based value. */
  baseAtk: number;
  /** Right-hand weapon ATK (`rhw.atk`). */
  weaponAtk: number;
  /** Left-hand weapon ATK (`lhw.atk`); 0 without a dual-wielded weapon. */
  leftWeaponAtk: number;
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
  /** Equipment DEF and VIT DEF (`def`, `def2`). */
  def: [number, number];
  /** Equipment MDEF and INT MDEF (`mdef`, `mdef2`). */
  mdef: [number, number];
  maxHp: number;
  maxSp: number;
}

export function statusWindow(input: CharacterInput, config: EngineConfig): StatusWindow {
  const total = totalStats(input);
  const { bonuses } = input;
  const weaponType = weaponTypeOf(input);
  const batk = totalBaseAtk(input);
  const weaponAtk = input.weapon?.attack ?? 0;
  const leftWeaponAtk = input.leftWeapon?.attack ?? 0;
  const critRate = criticalRate(total, weaponType, bonuses);
  const amotion = attackMotion(input, config);
  const aspdExact = aspdFromAmotion(amotion);
  // status_calc_misc pre-renewal: FLEE = bFlee + level + AGI, at least 1;
  // perfect dodge (enable_perfect_flee covers players) = bFlee2 × 10 + LUK + 10
  // in tenths, at least 10 once set (status_calc_flee2).
  const flee = Math.max(1, bonuses.sum('bFlee') + input.baseLevel + total.agi);
  const flee2 = Math.max(0, bonuses.sum('bFlee2') * 10 + total.luk + 10);
  return {
    atk: [batk + weaponAtk + leftWeaponAtk, input.weaponRefine.atk + input.leftWeaponRefine.atk],
    baseAtk: batk,
    weaponAtk,
    leftWeaponAtk,
    hit: hitValue(input),
    flee,
    perfectDodge: Math.trunc((flee2 === 0 ? 0 : Math.max(10, flee2)) / 10),
    crit: Math.trunc(critRate / 10),
    critRate,
    amotion,
    aspdExact,
    aspd: Math.floor(aspdExact),
    // status_calc_misc pre-renewal: def2 = VIT, mdef2 = INT + VIT / 2.
    def: [equipmentDef(input, config), total.vit],
    mdef: [equipmentMdef(input, config), total.int + Math.trunc(total.vit / 2)],
    maxHp: maxHp(input, config),
    maxSp: maxSp(input, config),
  };
}
