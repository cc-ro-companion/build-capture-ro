import { applyOverrides, MONSTER_SCHEMA, type OverrideFile } from './overrides.ts';
import { enabledKeys, loadDb, PRE_RE_DIR, type YamlMap } from './rathena.ts';

export type Size = 'small' | 'medium' | 'large';
export type MonsterClass = 'normal' | 'boss' | 'guardian' | 'battlefield';

export interface MonsterRecord {
  id: number;
  aegisName: string;
  level: number;
  hp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  magicDefense: number;
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
  size: Size;
  /** rAthena race name, e.g. `Demihuman`. */
  race: string;
  /** rAthena race group names that are set, e.g. `Goblin`. */
  raceGroups: string[];
  /** rAthena element name, e.g. `Water`. */
  element: string;
  elementLevel: number;
  class: MonsterClass;
  /** rAthena mode names that are set, e.g. `Mvp`, `Detector`. */
  modes: string[];
  attackRange: number;
  attackDelay: number;
  attackMotion: number;
  damageMotion: number;
  walkSpeed: number;
}

// rAthena's DEFAULT_WALK_SPEED in src/common/mmo.hpp.
const DEFAULT_WALK_SPEED = 150;

const SIZES: Record<string, Size> = { Small: 'small', Medium: 'medium', Large: 'large' };
const CLASSES: Record<string, MonsterClass> = {
  Normal: 'normal',
  Boss: 'boss',
  Guardian: 'guardian',
  Battlefield: 'battlefield',
};
const RACES = new Set([
  'Formless',
  'Undead',
  'Brute',
  'Plant',
  'Insect',
  'Fish',
  'Demon',
  'Demihuman',
  'Angel',
  'Dragon',
]);
const ELEMENTS = new Set([
  'Neutral',
  'Water',
  'Earth',
  'Fire',
  'Wind',
  'Poison',
  'Holy',
  'Dark',
  'Ghost',
  'Undead',
]);

function where(record: YamlMap): string {
  return `monster ${String(record.Id)}`;
}

function numberField(record: YamlMap, field: string, fallback: number): number {
  const value = record[field];
  if (value === undefined) return fallback;
  if (typeof value !== 'number') throw new Error(`${where(record)}: ${field} must be a number.`);
  return value;
}

function enumField<T>(
  record: YamlMap,
  field: string,
  fallback: string,
  values: Record<string, T>,
): T {
  const raw = record[field] ?? fallback;
  const value = typeof raw === 'string' ? values[raw] : undefined;
  if (value === undefined) throw new Error(`${where(record)}: unknown ${field} "${String(raw)}".`);
  return value;
}

function nameField(record: YamlMap, field: string, fallback: string, names: Set<string>): string {
  const value = record[field] ?? fallback;
  if (typeof value !== 'string' || !names.has(value)) {
    throw new Error(`${where(record)}: unknown ${field} "${String(value)}".`);
  }
  return value;
}

/** Converts one rAthena monster, filling rAthena's defaults for absent fields. */
export function convertMonster(record: YamlMap): MonsterRecord {
  const aegisName = record.AegisName;
  if (typeof aegisName !== 'string') throw new Error(`${where(record)}: missing AegisName.`);
  return {
    id: numberField(record, 'Id', Number.NaN),
    aegisName,
    level: numberField(record, 'Level', 1),
    hp: numberField(record, 'Hp', 1),
    attackMin: numberField(record, 'Attack', 0),
    attackMax: numberField(record, 'Attack2', 0),
    defense: numberField(record, 'Defense', 0),
    magicDefense: numberField(record, 'MagicDefense', 0),
    str: numberField(record, 'Str', 1),
    agi: numberField(record, 'Agi', 1),
    vit: numberField(record, 'Vit', 1),
    int: numberField(record, 'Int', 1),
    dex: numberField(record, 'Dex', 1),
    luk: numberField(record, 'Luk', 1),
    size: enumField(record, 'Size', 'Small', SIZES),
    race: nameField(record, 'Race', 'Formless', RACES),
    raceGroups: enabledKeys(record.RaceGroups),
    element: nameField(record, 'Element', 'Neutral', ELEMENTS),
    elementLevel: numberField(record, 'ElementLevel', 1),
    class: enumField(record, 'Class', 'Normal', CLASSES),
    modes: enabledKeys(record.Modes),
    attackRange: numberField(record, 'AttackRange', 0),
    attackDelay: numberField(record, 'AttackDelay', 0),
    attackMotion: numberField(record, 'AttackMotion', 0),
    damageMotion: numberField(record, 'DamageMotion', 0),
    walkSpeed: numberField(record, 'WalkSpeed', DEFAULT_WALK_SPEED),
  };
}

export function generateMonsters(
  rathenaDir: string,
  overrides: OverrideFile,
): { data: MonsterRecord[]; names: Record<number, string> } {
  const records = loadDb(rathenaDir, `${PRE_RE_DIR}/mob_db.yml`).body;
  const merged = applyOverrides(records, overrides, MONSTER_SCHEMA);
  const monsters = merged.map(convertMonster).sort((a, b) => a.id - b.id);
  const names = Object.fromEntries(merged.map((record) => [record.Id, String(record.Name)]));
  return { data: monsters, names };
}
