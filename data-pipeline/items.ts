import { SUPPORTED_JOBS } from './jobs.ts';
import { applyOverrides, ITEM_SCHEMA, type OverrideFile } from './overrides.ts';
import { loadDb, PRE_RE_DIR, type YamlMap } from './rathena.ts';

export interface ItemRecord {
  id: number;
  aegisName: string;
  type: 'weapon' | 'armor';
  /** rAthena weapon SubType, e.g. `1hSword`; weapons only. */
  weaponType?: string;
  attack: number;
  defense: number;
  range: number;
  slots: number;
  /** Weapons only. */
  weaponLevel?: number;
  equipLevelMin: number;
  /** 0 means no upper limit, as in rAthena. */
  equipLevelMax: number;
  refineable: boolean;
  /** rAthena location names, e.g. `Right_Hand`, `Head_Top`. */
  locations: string[];
  /** Supported job ids that can equip the item, ascending. */
  jobs: number[];
  /** Only present when restricted. */
  gender?: 'male' | 'female';
}

const jobIdByKey = new Map(SUPPORTED_JOBS.map((job) => [job.key, job.id]));

/** Item `Jobs` names (rAthena `EAJ_*` constants) → supported job keys. */
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

function where(record: YamlMap): string {
  return `item ${String(record.Id)}`;
}

function enabledKeys(map: unknown): string[] {
  if (typeof map !== 'object' || map === null) return [];
  return Object.entries(map)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key);
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
export function convertItem(record: YamlMap): ItemRecord | undefined {
  const rawType = record.Type;
  if (rawType !== 'Weapon' && rawType !== 'Armor') return undefined;
  if (!allowsNormalClass(record)) return undefined;
  const locations = enabledKeys(record.Locations);
  if (!locations.some((location) => !COSTUME_LOCATION.test(location))) return undefined;
  const jobs = resolveItemJobs(record);
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
    ...genderField(record),
  };
}

function genderField(record: YamlMap): Pick<ItemRecord, 'gender'> {
  switch (record.Gender) {
    case undefined:
    case 'Both':
      return {};
    case 'Male':
      return { gender: 'male' };
    case 'Female':
      return { gender: 'female' };
    default:
      throw new Error(`${where(record)}: unknown Gender "${String(record.Gender)}".`);
  }
}

export function generateItems(
  rathenaDir: string,
  overrides: OverrideFile,
): { data: ItemRecord[]; names: Record<number, string> } {
  const records = loadDb(rathenaDir, `${PRE_RE_DIR}/item_db.yml`, (importPath) =>
    importPath.endsWith('/item_db_equip.yml'),
  ).body;
  const merged = applyOverrides(records, overrides, ITEM_SCHEMA);
  const items: ItemRecord[] = [];
  const names: Record<number, string> = {};
  for (const record of merged) {
    const item = convertItem(record);
    if (item === undefined) continue;
    items.push(item);
    names[item.id] = stringField(record, 'Name');
  }
  items.sort((a, b) => a.id - b.id);
  return { data: items, names };
}
