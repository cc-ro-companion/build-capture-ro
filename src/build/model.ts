// The build: what the user chose, as ids and numbers only. Game data is
// looked up through ./resolve, so a build stays valid across data versions
// as far as its ids still exist.
import type { BonusStats } from '../data/types';
import type { EngineConfig } from '../engine/config';
import { STAT_NAMES } from '../engine/stats';
import { normalizeDummies, sameDummy, type Dummy } from './dummy';
import {
  fitsSlot,
  homeSlot,
  MAX_REFINE,
  MAX_RUNES,
  SLOTS,
  coveredSlots,
  type EquippedRef,
  type Equipment,
  type Slot,
} from './equipment';
import { itemName, jobName, type GameData } from './resolve';
import { integerOrUndefined, isRecord } from './untrusted';

/** v1 (phase 3) held only `weapon`, a right-hand item id; normalize migrates it. */
export const BUILD_VERSION = 2;

/** Most configured items the inventory holds. */
export const MAX_INVENTORY = 50;

export interface Build {
  v: typeof BUILD_VERSION;
  job: number;
  baseLevel: number;
  jobLevel: number;
  stats: BonusStats;
  /** Equipped items by slot; a multi-slot item is stored under its first slot only. */
  equipment: Equipment;
  /**
   * Configured items (refine, runes) kept for swapping, by value: storing
   * and equipping copy, so the inventory never changes what is equipped.
   */
  inventory: EquippedRef[];
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
    equipment: {},
    inventory: [],
    dummies: [],
    target: null,
  };
}

export type NormalizeResult = { build: Build; warnings: string[] } | { error: string };

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
  if (raw.v !== BUILD_VERSION && raw.v !== 1) {
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

  const rawEquipment =
    raw.v === 1
      ? raw.weapon === null || raw.weapon === undefined
        ? {}
        : { rightHand: { item: raw.weapon, refine: 0 } }
      : raw.equipment;
  const equipment = normalizeEquipment(rawEquipment, data, warnings);
  const inventory = normalizeInventory(raw.inventory, data, warnings);

  const dummies = normalizeDummies(raw.dummies, warnings);
  const target = normalizeTarget(raw.target, dummies.length, data, warnings);

  return {
    build: {
      v: BUILD_VERSION,
      job: jobId,
      baseLevel,
      jobLevel,
      stats,
      equipment,
      inventory,
      dummies,
      target,
    },
    warnings,
  };
}

/**
 * Rune ids that exist in the data, in order; unknown ids are dropped with a
 * warning. Runes that do not fit the item stay (see runeErrors), up to
 * MAX_RUNES. Returns undefined for none, as builds leave the field out.
 */
function normalizeRunes(
  raw: unknown,
  data: GameData,
  name: string,
  warnings: string[],
): number[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    warnings.push(`The runes of ${name} are not a list; removed.`);
    return undefined;
  }
  const runes: number[] = [];
  for (const value of raw) {
    const runeId = integerOrUndefined(value);
    if (runeId === undefined || !data.runes.has(runeId)) {
      warnings.push(`Unknown rune ${String(value)} in ${name} removed.`);
      continue;
    }
    runes.push(runeId);
  }
  if (runes.length > MAX_RUNES) {
    warnings.push(
      `${name} holds ${runes.length} runes; no item has more than ${MAX_RUNES}, extra removed.`,
    );
    runes.length = MAX_RUNES;
  }
  return runes.length > 0 ? runes : undefined;
}

/** One stored item: unknown items are dropped (undefined), refine clamped, runes normalized. */
function normalizeRef(
  entry: unknown,
  data: GameData,
  where: string,
  warnings: string[],
): EquippedRef | undefined {
  const itemId = integerOrUndefined(isRecord(entry) ? entry.item : undefined);
  const item = itemId === undefined ? undefined : data.items.get(itemId);
  if (itemId === undefined || !item) {
    const shown = isRecord(entry) ? String(entry.item) : String(entry);
    warnings.push(`Unknown item ${shown} in ${where} removed.`);
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  const name = `${itemName(data, itemId)} (${itemId})`;
  const runes = normalizeRunes(record.runes, data, name, warnings);
  return {
    item: itemId,
    refine: normalizeRefine(record.refine, item, name, warnings),
    ...(runes === undefined ? {} : { runes }),
  };
}

function normalizeInventory(raw: unknown, data: GameData, warnings: string[]): EquippedRef[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('The inventory is not a list; removed.');
    return [];
  }
  const inventory: EquippedRef[] = [];
  for (const entry of raw) {
    const ref = normalizeRef(entry, data, 'the inventory', warnings);
    if (ref) inventory.push(ref);
  }
  if (inventory.length > MAX_INVENTORY) {
    warnings.push(
      `The inventory holds ${inventory.length} items; only the first ${MAX_INVENTORY} were kept.`,
    );
    inventory.length = MAX_INVENTORY;
  }
  return inventory;
}

/**
 * Unknown items and items that do not fit their slot are dropped; refine is
 * clamped. Items the job or level cannot wear are kept (see equipmentErrors).
 * When items overlap, the one in the earlier slot stays.
 */
function normalizeEquipment(raw: unknown, data: GameData, warnings: string[]): Equipment {
  if (raw === null || raw === undefined) return {};
  if (!isRecord(raw)) {
    warnings.push('The equipment is not a list of slots; removed.');
    return {};
  }
  const known = new Set<string>(SLOTS);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) warnings.push(`Unknown equipment slot ${key}; its item was removed.`);
  }
  const equipment: Equipment = {};
  const taken = new Set<Slot>();
  for (const slot of SLOTS) {
    const entry = raw[slot];
    if (entry === undefined || entry === null) continue;
    const itemId = integerOrUndefined(isRecord(entry) ? entry.item : undefined);
    const item = itemId === undefined ? undefined : data.items.get(itemId);
    if (itemId === undefined || !item) {
      const shown = isRecord(entry) ? String(entry.item) : String(entry);
      warnings.push(`Unknown item ${shown} in ${slot} removed.`);
      continue;
    }
    const name = `${itemName(data, itemId)} (${itemId})`;
    if (!fitsSlot(item, slot)) {
      warnings.push(`${name} does not fit ${slot}; removed.`);
      continue;
    }
    const covered = coveredSlots(item, slot);
    if (covered.some((coveredSlot) => taken.has(coveredSlot))) {
      warnings.push(`${name} overlaps an item in an earlier slot; removed.`);
      continue;
    }
    for (const coveredSlot of covered) taken.add(coveredSlot);
    const runes = normalizeRunes(isRecord(entry) ? entry.runes : undefined, data, name, warnings);
    equipment[homeSlot(item, slot)] = {
      item: itemId,
      refine: normalizeRefine(isRecord(entry) ? entry.refine : undefined, item, name, warnings),
      ...(runes === undefined ? {} : { runes }),
    };
  }
  return equipment;
}

function normalizeRefine(
  raw: unknown,
  item: { refineable: boolean },
  name: string,
  warnings: string[],
): number {
  const refine = raw === undefined ? 0 : integerOrUndefined(raw);
  if (refine === undefined) {
    warnings.push(`Refine of ${name} is not a number; set to 0.`);
    return 0;
  }
  if (!item.refineable) {
    if (refine !== 0) warnings.push(`${name} cannot be refined; refine set to 0.`);
    return 0;
  }
  const clamped = Math.min(Math.max(refine, 0), MAX_REFINE);
  if (clamped !== refine) {
    warnings.push(`Refine ${refine} of ${name} is outside 0–${MAX_REFINE}; set to ${clamped}.`);
  }
  return clamped;
}

export function sameRef(a: EquippedRef, b: EquippedRef): boolean {
  const aRunes = a.runes ?? [];
  const bRunes = b.runes ?? [];
  return (
    a.item === b.item &&
    a.refine === b.refine &&
    aRunes.length === bRunes.length &&
    aRunes.every((rune, index) => rune === bRunes[index])
  );
}

export function sameEquipment(a: Equipment, b: Equipment): boolean {
  return SLOTS.every((slot) => {
    const left = a[slot];
    const right = b[slot];
    if (!left || !right) return left === right;
    return sameRef(left, right);
  });
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
    sameEquipment(a.equipment, b.equipment) &&
    a.inventory.length === b.inventory.length &&
    a.inventory.every((ref, index) => {
      const other = b.inventory[index];
      return other !== undefined && sameRef(ref, other);
    }) &&
    a.dummies.length === b.dummies.length &&
    a.dummies.every((dummy, index) => {
      const other = b.dummies[index];
      return other !== undefined && sameDummy(dummy, other);
    }) &&
    sameTarget(a.target, b.target)
  );
}
