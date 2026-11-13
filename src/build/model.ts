// The build: what the user chose, as ids and numbers only. Game data is
// looked up through ./resolve, so a build stays valid across data versions
// as far as its ids still exist.
import type { BonusStats } from '../data/types';
import type { EngineConfig } from '../engine/config';
import { STAT_NAMES } from '../engine/stats';
import { normalizeDummies, sameDummy, type Dummy } from './dummy';
import { canEquip, itemName, jobName, type GameData } from './resolve';

export const BUILD_VERSION = 1;

export interface Build {
  v: typeof BUILD_VERSION;
  job: number;
  baseLevel: number;
  jobLevel: number;
  stats: BonusStats;
  /** Right-hand weapon item id; null for bare hands. */
  weapon: number | null;
  /** The user's own training dummy settings, stored by value. */
  dummies: Dummy[];
  target: Target;
}

/** A monster by id, or one of the build's dummies by list index. */
export type Target = { monster: number } | { dummy: number } | null;

export const DEFAULT_JOB_ID = 0;

export function defaultBuild(): Build {
  return {
    v: BUILD_VERSION,
    job: DEFAULT_JOB_ID,
    baseLevel: 1,
    jobLevel: 1,
    stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
    weapon: null,
    dummies: [],
    target: null,
  };
}

export type NormalizeResult = { build: Build; warnings: string[] } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integerOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

/**
 * Turns untrusted build data (a share code, saved state) into a valid build.
 * Unknown ids are dropped and out-of-range numbers clamped, each with a
 * warning; only data that is not a build at all is an error.
 */
export function normalizeBuild(
  raw: unknown,
  data: GameData,
  config: EngineConfig,
): NormalizeResult {
  if (!isRecord(raw)) return { error: 'The data is not a build.' };
  if (raw.v !== BUILD_VERSION) {
    return typeof raw.v === 'number' && raw.v > BUILD_VERSION
      ? { error: `The build was made with a newer version of the planner (format ${raw.v}).` }
      : { error: 'The data is not a build of a known format.' };
  }

  const warnings: string[] = [];
  const fallback = defaultBuild();

  let jobId = integerOrUndefined(raw.job);
  if (jobId === undefined || !data.jobs.has(jobId)) {
    warnings.push(`Unknown job ${String(raw.job)}; using ${jobName(data, DEFAULT_JOB_ID)}.`);
    jobId = DEFAULT_JOB_ID;
  }
  const job = data.jobs.get(jobId);
  if (!job) return { error: 'The game data has no default job.' };

  const clamp = (label: string, value: unknown, min: number, max: number, defaultValue: number) => {
    const number = integerOrUndefined(value);
    if (number === undefined) {
      warnings.push(`${label} is missing or not a number; set to ${defaultValue}.`);
      return defaultValue;
    }
    const clamped = Math.min(Math.max(number, min), max);
    if (clamped !== number) {
      warnings.push(`${label} ${number} is outside ${min}–${max}; set to ${clamped}.`);
    }
    return clamped;
  };

  const baseLevel = clamp('Base level', raw.baseLevel, 1, job.maxBaseLevel, fallback.baseLevel);
  const jobLevel = clamp('Job level', raw.jobLevel, 1, job.maxJobLevel, fallback.jobLevel);

  const rawStats = isRecord(raw.stats) ? raw.stats : {};
  const stats = { ...fallback.stats };
  for (const stat of STAT_NAMES) {
    stats[stat] = clamp(stat.toUpperCase(), rawStats[stat], 1, config.maxStat, 1);
  }

  let weapon: number | null = null;
  if (raw.weapon !== null && raw.weapon !== undefined) {
    const weaponId = integerOrUndefined(raw.weapon);
    const item = weaponId === undefined ? undefined : data.items.get(weaponId);
    if (weaponId === undefined || !item) {
      warnings.push(`Unknown weapon ${String(raw.weapon)} removed.`);
    } else if (item.type !== 'weapon') {
      warnings.push(`${itemName(data, weaponId)} (${weaponId}) is not a weapon; removed.`);
    } else if (!canEquip(item, jobId, baseLevel)) {
      warnings.push(
        `${itemName(data, weaponId)} (${weaponId}) cannot be equipped by ` +
          `${jobName(data, jobId)} at base level ${baseLevel}; removed.`,
      );
    } else {
      weapon = weaponId;
    }
  }

  const dummies = normalizeDummies(raw.dummies, warnings);
  const target = normalizeTarget(raw.target, dummies.length, data, warnings);

  return {
    build: {
      v: BUILD_VERSION,
      job: jobId,
      baseLevel,
      jobLevel,
      stats,
      weapon,
      dummies,
      target,
    },
    warnings,
  };
}

function normalizeTarget(
  raw: unknown,
  dummyCount: number,
  data: GameData,
  warnings: string[],
): Target {
  if (raw === null || raw === undefined) return null;
  if (isRecord(raw) && 'monster' in raw) {
    const monsterId = integerOrUndefined(raw.monster);
    if (monsterId === undefined || !data.monsters.has(monsterId)) {
      warnings.push(`Unknown monster ${String(raw.monster)} removed.`);
      return null;
    }
    return { monster: monsterId };
  }
  if (isRecord(raw) && 'dummy' in raw) {
    const index = integerOrUndefined(raw.dummy);
    if (index === undefined || index < 0 || index >= dummyCount) {
      warnings.push(`The target dummy ${String(raw.dummy)} does not exist; target cleared.`);
      return null;
    }
    return { dummy: index };
  }
  warnings.push('The target is neither a monster nor a dummy; target cleared.');
  return null;
}

export function sameTarget(a: Target, b: Target): boolean {
  if (a === null || b === null) return a === b;
  if ('monster' in a) return 'monster' in b && a.monster === b.monster;
  return 'dummy' in b && a.dummy === b.dummy;
}

export function sameBuild(a: Build, b: Build): boolean {
  return (
    a.v === b.v &&
    a.job === b.job &&
    a.baseLevel === b.baseLevel &&
    a.jobLevel === b.jobLevel &&
    STAT_NAMES.every((stat) => a.stats[stat] === b.stats[stat]) &&
    a.weapon === b.weapon &&
    a.dummies.length === b.dummies.length &&
    a.dummies.every((dummy, index) => {
      const other = b.dummies[index];
      return other !== undefined && sameDummy(dummy, other);
    }) &&
    sameTarget(a.target, b.target)
  );
}
