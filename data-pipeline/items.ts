import type { Item } from '../src/data/types.ts';
import { SUPPORTED_JOBS } from './jobs.ts';
import { applyOverrides, ITEM_SCHEMA, type OverrideFile } from './overrides.ts';
import { enabledKeys, loadDb, PRE_RE_DIR, type YamlMap } from './rathena.ts';

const jobIdByKey = new Map(SUPPORTED_JOBS.map((job) => [job.key, job.id]));

/** Item `Jobs` names (rAthena `EAJ_*` constants) â†’ supported job keys. */
const ITEM_JOB_NAMES: Record<string, readonly string[]> = {
  Novice: ['Novice'],
  Swordman: ['Swordman'],
  Mage: ['Mage'],
  Archer: ['Archer'],
  Acolyte: ['Acolyte'],
  Merchant: ['Merchant'],
  Thief: ['Thief'],
  Knight: ['Knight'],
  Priest: ['Priest'],
  Wizard: ['Wizard'],
  Blacksmith: ['Blacksmith'],
  Hunter: ['Hunter'],
  Assassin: ['Assassin'],
  Crusader: ['Crusader'],
  Monk: ['Monk'],
  Sage: ['Sage'],
  Rogue: ['Rogue'],
  Alchemist: ['Alchemist'],
  BardDancer: ['Bard', 'Dancer'],
  SuperNovice: ['Super_Novice'],
  Gunslinger: ['Gunslinger'],
  Ninja: ['Ninja'],
  Taekwon: ['Taekwon'],
  StarGladiator: ['Star_Gladiator'],
  SoulLinker: ['Soul_Linker'],
  // Valid in rAthena but not supported here.
  KagerouOboro: [],
  Rebellion: [],
  Summoner: [],
};

/** rAthena `ITEMJ_*` class names; only `All` and `Normal` cover normal characters. */
const CLASS_NAMES = new Set([
  'All',
  'Normal',
  'Upper',
  'Baby',
  'Third',
  'Third_Upper',
  'Third_Baby',
  'Fourth',
  'All_Upper',
  'All_Baby',
  'All_Third',
]);

const COSTUME_LOCATION = /^Costume_/;
// rAthena's WEDDING_RING_M / WEDDING_RING_F in src/common/mmo.hpp.
const GROOM_RING_ID = 2634;
const BRIDE_RING_ID = 2635;
const BARD_ID = jobIdByKey.get('Bard') as number;
const DANCER_ID = jobIdByKey.get('Dancer') as number;

function where(record: YamlMap): string {
  return `item ${String(record.Id)}`;
}

/**
 * Resolves an item's `Jobs` map like rAthena: no map means all jobs; `All`
 * applies first, then the other names in file order.
 */
export function resolveItemJobs(record: YamlMap): number[] {
  const jobs = record.Jobs;
  if (jobs === undefined) return SUPPORTED_JOBS.map((job) => job.id);
  if (typeof jobs !== 'object' || jobs === null) throw new Error(`${where(record)}: bad Jobs.`);
  const allowed = new Set<string>();
  const entries = Object.entries(jobs as Record<string, unknown>);
  const all = entries.find(([name]) => name === 'All');
  if (all?.[1] === true) for (const job of SUPPORTED_JOBS) allowed.add(job.key);
  for (const [name, enabled] of entries) {
    if (name === 'All') continue;
    const keys = ITEM_JOB_NAMES[name];
    if (keys === undefined) throw new Error(`${where(record)}: unknown job "${name}".`);
    for (const key of keys) {
      if (enabled === true) allowed.add(key);
      else allowed.delete(key);
    }
  }
  return [...allowed].map((key) => jobIdByKey.get(key) as number).sort((a, b) => a - b);
}

/** Whether `Classes` lets normal (non-rebirth, non-baby) characters equip the item. */
export function allowsNormalClass(record: YamlMap): boolean {
  const classes = record.Classes;
  if (classes === undefined) return true;
  if (typeof classes !== 'object' || classes === null) {
    throw new Error(`${where(record)}: bad Classes.`);
  }
  const entries = Object.entries(classes as Record<string, unknown>);
  let normal = false;
  const all = entries.find(([name]) => name === 'All');
  if (all !== undefined) normal = all[1] === true;
  for (const [name, enabled] of entries) {
    if (!CLASS_NAMES.has(name)) throw new Error(`${where(record)}: unknown class "${name}".`);
    if (name === 'Normal') normal = enabled === true;
  }
  return normal;
}

function numberField(record: YamlMap, field: string, fallback: number): number {
  const value = record[field];
  if (value === undefined) return fallback;
  if (typeof value !== 'number') throw new Error(`${where(record)}: ${field} must be a number.`);
  return value;
}

function stringField(record: YamlMap, field: string): string {
  const value = record[field];
  if (typeof value !== 'string') throw new Error(`${where(record)}: missing ${field}.`);
  return value;
}

/**
 * Converts one rAthena item, or returns undefined when it is not equipment a
 * normal character of a supported job can wear.
 */
export function convertItem(record: YamlMap): Item | undefined {
  const rawType = record.Type;
  if (rawType !== 'Weapon' && rawType !== 'Armor') return undefined;
  if (!allowsNormalClass(record)) return undefined;
  const locations = enabledKeys(record.Locations);
  if (!locations.some((location) => !COSTUME_LOCATION.test(location))) return undefined;
  const gender = effectiveGender(record);
  // Bard is always male and Dancer always female, so a gender-restricted
  // item is unusable by the other one even though rAthena's BardDancer flag
  // covers both.
  const excludedJob = gender === 'male' ? DANCER_ID : gender === 'female' ? BARD_ID : undefined;
  const jobs = resolveItemJobs(record).filter((id) => id !== excludedJob);
  if (jobs.length === 0) return undefined;

  const isWeapon = rawType === 'Weapon';
  // Key order here is the key order in items.json.
  return {
    id: numberField(record, 'Id', Number.NaN),
    aegisName: stringField(record, 'AegisName'),
    type: isWeapon ? 'weapon' : 'armor',
    ...(isWeapon ? { weaponType: stringField(record, 'SubType') } : {}),
    attack: numberField(record, 'Attack', 0),
    defense: numberField(record, 'Defense', 0),
    range: numberField(record, 'Range', 0),
    slots: numberField(record, 'Slots', 0),
    ...(isWeapon ? { weaponLevel: numberField(record, 'WeaponLevel', 1) } : {}),
    equipLevelMin: numberField(record, 'EquipLevelMin', 0),
    equipLevelMax: numberField(record, 'EquipLevelMax', 0),
    refineable: record.Refineable === true,
    locations,
    jobs,
    ...(gender === undefined ? {} : { gender }),
  };
}

/**
 * The gender restriction rAthena enforces (`ItemDatabase::defaultGender`):
 * the wedding rings and all musical instruments and whips are forced,
 * whatever the db says.
 */
export function effectiveGender(record: YamlMap): Item['gender'] {
  if (record.Id === GROOM_RING_ID) return 'male';
  if (record.Id === BRIDE_RING_ID) return 'female';
  if (record.Type === 'Weapon' && record.SubType === 'Musical') return 'male';
  if (record.Type === 'Weapon' && record.SubType === 'Whip') return 'female';
  switch (record.Gender) {
    case undefined:
    case 'Both':
      return undefined;
    case 'Male':
      return 'male';
    case 'Female':
      return 'female';
    default:
      throw new Error(`${where(record)}: unknown Gender "${String(record.Gender)}".`);
  }
}

/**
 * Converts every equipment record. Ids in `hidden` get `hidden: true`; a
 * hidden id that is not generated equipment is an error, so a typo in
 * hidden-items.yml cannot silently hide nothing.
 */
export function generateItems(
  rathenaDir: string,
  overrides: OverrideFile,
  hidden: ReadonlySet<number> = new Set(),
): { data: Item[]; names: Record<number, string> } {
  const records = loadDb(rathenaDir, `${PRE_RE_DIR}/item_db.yml`, (importPath) =>
    importPath.endsWith('/item_db_equip.yml'),
  ).body;
  const merged = applyOverrides(records, overrides, ITEM_SCHEMA);
  const items: Item[] = [];
  const names: Record<number, string> = {};
  for (const record of merged) {
    const item = convertItem(record);
    if (item === undefined) continue;
    if (hidden.has(item.id)) item.hidden = true;
    items.push(item);
    names[item.id] = stringField(record, 'Name');
  }
  items.sort((a, b) => a.id - b.id);
  const unknown = [...hidden].filter((id) => names[id] === undefined);
  if (unknown.length > 0) {
    throw new Error(`hidden-items.yml: no such equipment: ${unknown.join(', ')}.`);
  }
  return { data: items, names };
}
