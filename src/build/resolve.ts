// Lookup of builds' ids in the game data, and conversion of a build into the
// engine's inputs.
import {
  items as allItems,
  jobsData,
  monsters as allMonsters,
  namesEn,
  tables as allTables,
} from '../data';
import type { Item, Job, Monster, NamesFile, TablesFile } from '../data/types';
import { buildCharacter, SLOTS, type EquippedItem } from '../engine/gear';
import type { CharacterInput } from '../engine/stats';
import { dummyMonster, type Dummy } from './dummy';
import type { Build } from './model';

export interface GameData {
  jobs: ReadonlyMap<number, Job>;
  /** Job ids in display order. */
  jobOrder: readonly number[];
  items: ReadonlyMap<number, Item>;
  /** Every item in id order, for equipment search. */
  itemList: readonly Item[];
  monsters: ReadonlyMap<number, Monster>;
  monsterList: readonly Monster[];
  /** Index = base level − 1; total stat points. */
  statPoints: readonly number[];
  tables: TablesFile;
  names: NamesFile;
}

export interface GameDataSource {
  jobs: readonly Job[];
  items: readonly Item[];
  monsters: readonly Monster[];
  statPoints: readonly number[];
  tables: TablesFile;
  names: NamesFile;
}

export function createGameData(source: GameDataSource): GameData {
  const byId = <T extends { id: number }>(records: readonly T[]) =>
    new Map(records.map((record) => [record.id, record]));
  const ascending = <T extends { id: number }>(records: readonly T[]) =>
    [...records].sort((a, b) => a.id - b.id);
  return {
    jobs: byId(source.jobs),
    jobOrder: source.jobs.map((job) => job.id),
    items: byId(source.items),
    itemList: ascending(source.items),
    monsters: byId(source.monsters),
    monsterList: ascending(source.monsters),
    statPoints: source.statPoints,
    tables: source.tables,
    names: source.names,
  };
}

/** The game data shipped with the app. */
export const gameData: GameData = createGameData({
  jobs: jobsData.jobs,
  items: allItems,
  monsters: allMonsters,
  statPoints: jobsData.statPoints,
  tables: allTables,
  names: namesEn,
});

export function jobName(data: GameData, jobId: number): string {
  return data.names.jobs[jobId] ?? data.jobs.get(jobId)?.key ?? `Job ${jobId}`;
}

export function itemName(data: GameData, itemId: number): string {
  return data.names.items[itemId] ?? data.items.get(itemId)?.aegisName ?? `Item ${itemId}`;
}

export function monsterName(data: GameData, monsterId: number): string {
  return (
    data.names.monsters[monsterId] ??
    data.monsters.get(monsterId)?.aegisName ??
    `Monster ${monsterId}`
  );
}

/** Whether the item's job list includes the job. */
export function jobCanEquip(item: Item, jobId: number): boolean {
  return item.jobs.includes(jobId);
}

/** Whether the base level is within the item's equip level limits. */
export function levelCanEquip(item: Item, baseLevel: number): boolean {
  if (baseLevel < item.equipLevelMin) return false;
  return item.equipLevelMax === 0 || baseLevel <= item.equipLevelMax;
}

/** Whether the job can wear the item at the base level (job list and level limits). */
export function canEquip(item: Item, jobId: number, baseLevel: number): boolean {
  return jobCanEquip(item, jobId) && levelCanEquip(item, baseLevel);
}

export interface ResolvedBuild {
  character: CharacterInput;
  /** The target as the engine sees it; a dummy becomes a monster record. */
  monster: Monster | null;
  /** The target dummy, when the target is one of the build's dummies. */
  dummy: Dummy | null;
  /** The build's equipped items that resolve, in slot order. */
  equipment: EquippedItem[];
}

/**
 * Engine inputs for a normalized build. Ids that do not resolve (which
 * normalize already removed) are left out. Items the job or level cannot
 * wear still count, as the build shows them as errors rather than dropping them.
 */
export function resolveBuild(build: Build, data: GameData): ResolvedBuild {
  const job = data.jobs.get(build.job);
  if (!job) throw new Error(`Unknown job id ${build.job}; normalize the build first.`);
  const equipment: EquippedItem[] = [];
  for (const slot of SLOTS) {
    const entry = build.equipment[slot];
    const item = entry && data.items.get(entry.item);
    if (entry && item) equipment.push({ slot, item, refine: entry.refine });
  }
  let monster: Monster | null = null;
  let dummy: Dummy | null = null;
  if (build.target && 'monster' in build.target) {
    monster = data.monsters.get(build.target.monster) ?? null;
  } else if (build.target && 'dummy' in build.target) {
    dummy = build.dummies[build.target.dummy] ?? null;
    monster = dummy && dummyMonster(dummy);
  }
  return {
    character: buildCharacter(
      { job, baseLevel: build.baseLevel, jobLevel: build.jobLevel, baseStats: { ...build.stats } },
      equipment,
      data.tables.refine,
    ),
    monster,
    dummy,
    equipment,
  };
}
