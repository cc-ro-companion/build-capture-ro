// Equipment and monster search: case-insensitive substring over the English
// name, the aegis name and the id.
import type { Item, Monster } from '../data/types';
import { fitsSlot, jobCanUseSlot, type Slot } from './equipment';
import { itemName, jobCanEquip, monsterName, type GameData } from './resolve';

export const MAX_RESULTS = 50;

export interface SearchResult<T> {
  /** At most MAX_RESULTS matches, in id order. */
  matches: T[];
  /** Number of all matches, to tell the user when the list is cut. */
  total: number;
}

function matcher(query: string): (id: number, aegisName: string, name: string) => boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return () => true;
  return (id, aegisName, name) =>
    String(id).includes(needle) ||
    aegisName.toLowerCase().includes(needle) ||
    name.toLowerCase().includes(needle);
}

function collect<T>(records: readonly T[], accept: (record: T) => boolean): SearchResult<T> {
  const matches: T[] = [];
  let total = 0;
  for (const record of records) {
    if (!accept(record)) continue;
    total++;
    if (matches.length < MAX_RESULTS) matches.push(record);
  }
  return { matches, total };
}

export interface ItemSearchOptions {
  /** Also offer items marked hidden (not obtainable on ccRO). */
  showHidden?: boolean;
}

/**
 * Items for one equipment slot that the job can hold there and that match
 * the query, whatever their equip level: the build keeps gear above its base
 * level and reports it as an error.
 */
export function searchEquipment(
  query: string,
  slot: Slot,
  jobId: number,
  data: GameData,
  options: ItemSearchOptions = {},
): SearchResult<Item> {
  const matches = matcher(query);
  return collect(
    data.itemList,
    (item) =>
      (options.showHidden === true || item.hidden !== true) &&
      fitsSlot(item, slot) &&
      jobCanEquip(item, jobId) &&
      jobCanUseSlot(item, slot, jobId) &&
      matches(item.id, item.aegisName, itemName(data, item.id)),
  );
}

export function searchMonsters(query: string, data: GameData): SearchResult<Monster> {
  const matches = matcher(query);
  return collect(data.monsterList, (monster) =>
    matches(monster.id, monster.aegisName, monsterName(data, monster.id)),
  );
}
