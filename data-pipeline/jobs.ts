import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applyOverrides, JOB_SCHEMA, type OverrideFile } from './overrides.ts';
import type { BonusStats, Job, JobsFile } from '../src/data/types.ts';
import { JOB_ENUM_FILE, loadDb, PRE_RE_DIR, type YamlMap } from './rathena.ts';

export interface SupportedJob {
  /** rAthena `e_job` value. */
  id: number;
  /** rAthena job name as used in the job db files and in jobs.yml. */
  key: string;
  name: string;
}

/**
 * Jobs the planner supports. Rebirth, baby and mounted variants are out of
 * scope; mounts are a build option instead. Ids are checked against
 * `enum e_job` in rAthena's `src/common/mmo.hpp` on every run.
 */
export const SUPPORTED_JOBS: readonly SupportedJob[] = [
  { id: 0, key: 'Novice', name: 'Novice' },
  { id: 1, key: 'Swordman', name: 'Swordman' },
  { id: 2, key: 'Mage', name: 'Mage' },
  { id: 3, key: 'Archer', name: 'Archer' },
  { id: 4, key: 'Acolyte', name: 'Acolyte' },
  { id: 5, key: 'Merchant', name: 'Merchant' },
  { id: 6, key: 'Thief', name: 'Thief' },
  { id: 7, key: 'Knight', name: 'Knight' },
  { id: 8, key: 'Priest', name: 'Priest' },
  { id: 9, key: 'Wizard', name: 'Wizard' },
  { id: 10, key: 'Blacksmith', name: 'Blacksmith' },
  { id: 11, key: 'Hunter', name: 'Hunter' },
  { id: 12, key: 'Assassin', name: 'Assassin' },
  { id: 14, key: 'Crusader', name: 'Crusader' },
  { id: 15, key: 'Monk', name: 'Monk' },
  { id: 16, key: 'Sage', name: 'Sage' },
  { id: 17, key: 'Rogue', name: 'Rogue' },
  { id: 18, key: 'Alchemist', name: 'Alchemist' },
  { id: 19, key: 'Bard', name: 'Bard' },
  { id: 20, key: 'Dancer', name: 'Dancer' },
  { id: 23, key: 'Super_Novice', name: 'Super Novice' },
  { id: 24, key: 'Gunslinger', name: 'Gunslinger' },
  { id: 25, key: 'Ninja', name: 'Ninja' },
  { id: 4046, key: 'Taekwon', name: 'Taekwon' },
  { id: 4047, key: 'Star_Gladiator', name: 'Star Gladiator' },
  { id: 4049, key: 'Soul_Linker', name: 'Soul Linker' },
];

/** Spellings in rAthena's job db files that differ from the key. */
const JOB_FILE_ALIASES: Record<string, string> = {
  Supernovice: 'Super_Novice',
};

const JOB_FILES = ['job_stats.yml', 'job_aspd.yml', 'job_exp.yml', 'job_basepoints.yml'];
const CLASSIC_STATS = ['Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk'] as const;

/** Parses `enum e_job` from rAthena's source into name → value. */
export function parseJobEnum(source: string): Map<string, number> {
  const start = source.indexOf('enum e_job {');
  const end = source.indexOf('};', start);
  if (start === -1 || end === -1) throw new Error('mmo.hpp: enum e_job not found.');
  const body = source
    .slice(start + 'enum e_job {'.length, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const values = new Map<string, number>();
  let next = 0;
  for (const member of body.split(',')) {
    const text = member.trim();
    if (text === '') continue;
    const match = /^(JOB_\w+)(?:\s*=\s*(\d+))?$/.exec(text);
    // An unparseable member would silently shift every implicit value after it.
    if (match === null) throw new Error(`mmo.hpp: cannot parse e_job member "${text}".`);
    const [, name = '', explicit] = match;
    const value = explicit === undefined ? next : Number(explicit);
    values.set(name, value);
    next = value + 1;
  }
  return values;
}

export function checkJobIds(enumValues: Map<string, number>): void {
  for (const job of SUPPORTED_JOBS) {
    const constant = `JOB_${job.key.toUpperCase()}`;
    const actual = enumValues.get(constant);
    if (actual !== job.id) {
      throw new Error(
        `Job ${job.key}: id ${job.id} does not match ${constant} = ${actual} in mmo.hpp.`,
      );
    }
  }
}

/**
 * Turns rAthena's grouped job entries into one record per supported job,
 * keyed by `Job`, combining the fields of all job db files.
 */
export function expandJobGroups(groups: readonly YamlMap[]): YamlMap[] {
  const supportedKeys = new Set(SUPPORTED_JOBS.map((job) => job.key));
  const records = new Map<string, YamlMap>(
    SUPPORTED_JOBS.map((job) => [job.key, { Job: job.key }]),
  );
  for (const group of groups) {
    const { Jobs: jobNames, ...fields } = group;
    if (typeof jobNames !== 'object' || jobNames === null) continue;
    for (const [rawName, enabled] of Object.entries(jobNames)) {
      if (enabled !== true) continue;
      const key = JOB_FILE_ALIASES[rawName] ?? rawName;
      if (!supportedKeys.has(key)) continue;
      mergeGroupFields(records.get(key) as YamlMap, fields);
    }
  }
  return [...records.values()];
}

/**
 * Adds a group's fields to a job like rAthena does when a job is in several
 * groups: maps (e.g. `BaseASPD`) merge key by key, per-level lists (e.g.
 * `BonusStats`) append so later levels win, scalars replace.
 */
function mergeGroupFields(record: YamlMap, fields: YamlMap): void {
  for (const [field, value] of Object.entries(fields)) {
    const current = record[field];
    if (isPlainMap(current) && isPlainMap(value)) record[field] = { ...current, ...value };
    else if (Array.isArray(current) && Array.isArray(value)) record[field] = [...current, ...value];
    else record[field] = value;
  }
}

function isPlainMap(value: unknown): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNumber(record: YamlMap, field: string): number {
  const value = record[field];
  if (typeof value !== 'number') throw new Error(`Job ${String(record.Job)}: missing ${field}.`);
  return value;
}

function cumulativeBonusStats(record: YamlMap, maxJobLevel: number): BonusStats[] {
  const perLevel = new Map<number, YamlMap>();
  const entries = Array.isArray(record.BonusStats) ? (record.BonusStats as YamlMap[]) : [];
  for (const entry of entries) perLevel.set(Number(entry.Level), entry);

  const running: BonusStats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
  const rows: BonusStats[] = [];
  for (let level = 1; level <= maxJobLevel; level++) {
    const entry = perLevel.get(level);
    if (entry !== undefined) {
      for (const stat of CLASSIC_STATS) {
        running[stat.toLowerCase() as keyof BonusStats] += Number(entry[stat] ?? 0);
      }
    }
    rows.push({ ...running });
  }
  return rows;
}

/**
 * `BaseHp`/`BaseSp` per base level as rAthena reads them with HP_SP_TABLES
 * (on by default in `src/config/core.hpp`); every level up to the job's
 * maximum must be present, as a missing one would read as 0 HP.
 */
function perLevelPoints(
  record: YamlMap,
  field: 'BaseHp' | 'BaseSp',
  valueField: 'Hp' | 'Sp',
  maxBaseLevel: number,
): number[] {
  const entries = Array.isArray(record[field]) ? (record[field] as YamlMap[]) : [];
  const byLevel = new Map(entries.map((entry) => [Number(entry.Level), Number(entry[valueField])]));
  const points: number[] = [];
  for (let level = 1; level <= maxBaseLevel; level++) {
    const value = byLevel.get(level);
    if (value === undefined || Number.isNaN(value)) {
      throw new Error(`Job ${String(record.Job)}: no ${field} for base level ${level}.`);
    }
    points.push(value);
  }
  return points;
}

export function convertJob(record: YamlMap): Job {
  const job = SUPPORTED_JOBS.find((candidate) => candidate.key === record.Job);
  if (job === undefined) throw new Error(`Unknown job ${String(record.Job)}.`);
  const maxJobLevel = requireNumber(record, 'MaxJobLevel');
  const aspd = record.BaseASPD;
  if (typeof aspd !== 'object' || aspd === null || Object.keys(aspd).length === 0) {
    throw new Error(`Job ${job.key}: missing BaseASPD.`);
  }
  const maxBaseLevel = requireNumber(record, 'MaxBaseLevel');
  return {
    id: job.id,
    key: job.key,
    maxBaseLevel,
    maxJobLevel,
    bonusStats: cumulativeBonusStats(record, maxJobLevel),
    baseAspd: { ...(aspd as Record<string, number>) },
    baseHp: perLevelPoints(record, 'BaseHp', 'Hp', maxBaseLevel),
    baseSp: perLevelPoints(record, 'BaseSp', 'Sp', maxBaseLevel),
  };
}

export function convertStatPoints(entries: readonly YamlMap[], maxBaseLevel: number): number[] {
  const byLevel = new Map(entries.map((entry) => [Number(entry.Level), Number(entry.Points)]));
  const points: number[] = [];
  for (let level = 1; level <= maxBaseLevel; level++) {
    const total = byLevel.get(level);
    if (total === undefined) throw new Error(`statpoint.yml: no entry for base level ${level}.`);
    points.push(total);
  }
  return points;
}

export function generateJobs(
  rathenaDir: string,
  overrides: OverrideFile,
): { data: JobsFile; names: Record<number, string> } {
  checkJobIds(parseJobEnum(readFileSync(path.join(rathenaDir, JOB_ENUM_FILE), 'utf8')));
  const groups = JOB_FILES.flatMap((file) => loadDb(rathenaDir, `${PRE_RE_DIR}/${file}`).body);
  const records = applyOverrides(expandJobGroups(groups), overrides, JOB_SCHEMA);
  const jobs = records.map(convertJob).sort((a, b) => a.id - b.id);
  const maxBaseLevel = Math.max(...jobs.map((job) => job.maxBaseLevel));
  const statPoints = convertStatPoints(
    loadDb(rathenaDir, `${PRE_RE_DIR}/statpoint.yml`).body,
    maxBaseLevel,
  );
  const names = Object.fromEntries(SUPPORTED_JOBS.map((job) => [job.id, job.name]));
  return { data: { statPoints, jobs }, names };
}
