// Character stats: base + job bonus + equipment, and the stat point budget.
import type { BonusStats, Item, Job } from '../data/types';
import type { BonusSet } from './bonuses';
import type { WeaponRefine } from './equipment';

export const STAT_NAMES = ['str', 'agi', 'vit', 'int', 'dex', 'luk'] as const;
export type StatName = (typeof STAT_NAMES)[number];

export interface CharacterInput {
  job: Job;
  baseLevel: number;
  jobLevel: number;
  /** Stats the player raised with status points (1..maxStat each). */
  baseStats: BonusStats;
  /** Right-hand weapon; null for bare hands. */
  weapon: Item | null;
  /** Refine ATK and overupgrade of the right-hand weapon (equipment.ts `weaponRefine`). */
  weaponRefine: WeaponRefine;
  /** Bonus calls of every equipped item (gear.ts `buildCharacter`). */
  bonuses: BonusSet;
  /** Stat bonuses from item scripts, rAthena's `param_equip`. */
  equipmentStats: BonusStats;
  /** Item DEF of every equipped piece plus refine DEF, before `bDef`. */
  equipmentDef: number;
}

/** Job bonus row for the job level; rAthena `job_info->job_bonus[job_level - 1]`. */
export function jobBonus(job: Job, jobLevel: number): BonusStats {
  const index = Math.min(Math.max(jobLevel, 1), job.bonusStats.length) - 1;
  return job.bonusStats[index] ?? { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
}

/**
 * Base stats plus job bonus plus equipment, as `status_calc_pc_sub` adds
 * them, never below 0 (`cap_value(i, 0, USHRT_MAX)`).
 */
export function totalStats(input: CharacterInput): BonusStats {
  const bonus = jobBonus(input.job, input.jobLevel);
  const result = { ...input.baseStats };
  for (const stat of STAT_NAMES) {
    result[stat] = Math.max(0, result[stat] + bonus[stat] + input.equipmentStats[stat]);
  }
  return result;
}

/**
 * Status points needed to raise a stat from `value` to `value + 1`.
 * Pre-renewal `PC_STATUS_POINT_COST(low) = 1 + (low + 9) / 10` (pc.cpp).
 */
export function statPointCost(value: number): number {
  return 1 + Math.trunc((value + 9) / 10);
}

/** Points spent to raise one stat from 1 to `value`; `pc_need_status_point` summed. */
export function statPointsForValue(value: number): number {
  let spent = 0;
  for (let low = 1; low < value; low++) spent += statPointCost(low);
  return spent;
}

export function statPointsSpent(baseStats: BonusStats): number {
  return STAT_NAMES.reduce((sum, stat) => sum + statPointsForValue(baseStats[stat]), 0);
}

/** Total status points at a base level; `statPoints` is jobsData.statPoints. */
export function statPointBudget(statPoints: readonly number[], baseLevel: number): number {
  const index = Math.min(Math.max(baseLevel, 1), statPoints.length) - 1;
  return statPoints[index] ?? 0;
}
