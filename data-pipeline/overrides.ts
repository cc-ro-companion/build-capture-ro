import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { YamlMap } from './rathena.ts';

/**
 * How a field merges: `value` (scalar or list) is replaced, `freeMap` merges
 * key by key with any keys (e.g. an item's `Jobs`), and a nested shape merges
 * key by key with only the listed sub-fields allowed.
 */
export type FieldShape = 'value' | 'freeMap' | RecordShape;

export interface RecordShape {
  fields: Record<string, FieldShape>;
}

export interface OverrideSchema {
  /** Field that identifies an entry: `Id`, or `Job` for jobs.yml. */
  key: string;
  shape: RecordShape;
  /** Fields a new entry must have besides the key. Empty array plus `allowAdd: false` forbids adding. */
  required: readonly string[];
  allowAdd: boolean;
  allowRemove: boolean;
}

export interface OverrideFile {
  /** File name used in error messages, e.g. `items.yml`. */
  name: string;
  body: YamlMap[];
  remove: (string | number)[];
}

export class OverrideError extends Error {}

function isMap(value: unknown): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shapeOf(fields: Record<string, FieldShape>): RecordShape {
  return { fields };
}

export const ITEM_SCHEMA: OverrideSchema = {
  key: 'Id',
  shape: shapeOf({
    Id: 'value',
    AegisName: 'value',
    Name: 'value',
    Type: 'value',
    SubType: 'value',
    Buy: 'value',
    Sell: 'value',
    Weight: 'value',
    Attack: 'value',
    MagicAttack: 'value',
    Defense: 'value',
    Range: 'value',
    Slots: 'value',
    Jobs: 'freeMap',
    Classes: 'freeMap',
    Gender: 'value',
    Locations: 'freeMap',
    WeaponLevel: 'value',
    ArmorLevel: 'value',
    EquipLevelMin: 'value',
    EquipLevelMax: 'value',
    Refineable: 'value',
    Gradable: 'value',
    View: 'value',
    AliasName: 'value',
    Flags: shapeOf({
      BuyingStore: 'value',
      DeadBranch: 'value',
      Container: 'value',
      UniqueId: 'value',
      BindOnEquip: 'value',
      DropAnnounce: 'value',
      NoConsume: 'value',
      DropEffect: 'value',
    }),
    Delay: shapeOf({ Duration: 'value', Status: 'value' }),
    Stack: shapeOf({
      Amount: 'value',
      Inventory: 'value',
      Cart: 'value',
      Storage: 'value',
      GuildStorage: 'value',
    }),
    NoUse: shapeOf({ Override: 'value', Sitting: 'value' }),
    Trade: shapeOf({
      Override: 'value',
      NoDrop: 'value',
      NoTrade: 'value',
      TradePartner: 'value',
      NoSell: 'value',
      NoCart: 'value',
      NoStorage: 'value',
      NoGuildStorage: 'value',
      NoMail: 'value',
      NoAuction: 'value',
    }),
    Script: 'value',
    EquipScript: 'value',
    UnEquipScript: 'value',
  }),
  // rAthena itself only requires Id, AegisName and Name; Type is required here
  // because only equipment is generated and Type would otherwise default to Etc.
  required: ['AegisName', 'Name', 'Type'],
  allowAdd: true,
  allowRemove: true,
};

export const MONSTER_SCHEMA: OverrideSchema = {
  key: 'Id',
  shape: shapeOf({
    Id: 'value',
    AegisName: 'value',
    Name: 'value',
    JapaneseName: 'value',
    Level: 'value',
    Hp: 'value',
    Sp: 'value',
    BaseExp: 'value',
    JobExp: 'value',
    MvpExp: 'value',
    Attack: 'value',
    Attack2: 'value',
    Defense: 'value',
    MagicDefense: 'value',
    Resistance: 'value',
    MagicResistance: 'value',
    Str: 'value',
    Agi: 'value',
    Vit: 'value',
    Int: 'value',
    Dex: 'value',
    Luk: 'value',
    AttackRange: 'value',
    SkillRange: 'value',
    ChaseRange: 'value',
    Size: 'value',
    Race: 'value',
    RaceGroups: 'freeMap',
    Element: 'value',
    ElementLevel: 'value',
    WalkSpeed: 'value',
    AttackDelay: 'value',
    AttackMotion: 'value',
    ClientAttackMotion: 'value',
    DamageMotion: 'value',
    DamageTaken: 'value',
    GroupId: 'value',
    Title: 'value',
    Ai: 'value',
    Class: 'value',
    Modes: 'freeMap',
    MvpDrops: 'value',
    Drops: 'value',
  }),
  required: ['AegisName', 'Name'],
  allowAdd: true,
  allowRemove: true,
};

const STAT_FIELDS = [
  'Str',
  'Agi',
  'Vit',
  'Int',
  'Dex',
  'Luk',
  'Pow',
  'Sta',
  'Wis',
  'Spl',
  'Con',
  'Crt',
];

/**
 * A job record after rAthena's job groups are expanded: the fields of
 * job_stats.yml, job_aspd.yml and job_exp.yml for one job. The set of jobs is
 * fixed by the generator, so jobs can only be patched, not added or removed.
 */
export const JOB_SCHEMA: OverrideSchema = {
  key: 'Job',
  shape: shapeOf({
    Job: 'value',
    MaxWeight: 'value',
    HpFactor: 'value',
    HpIncrease: 'value',
    SpFactor: 'value',
    SpIncrease: 'value',
    ApFactor: 'value',
    ApIncrease: 'value',
    BaseASPD: 'freeMap',
    BonusStats: 'value',
    MaxStats: shapeOf(Object.fromEntries(STAT_FIELDS.map((stat) => [stat, 'value' as const]))),
    MaxBaseLevel: 'value',
    BaseExp: 'value',
    MaxJobLevel: 'value',
    JobExp: 'value',
    BaseHp: 'value',
    BaseSp: 'value',
    BaseAp: 'value',
    AlternateOutfits: 'value',
  }),
  required: [],
  allowAdd: false,
  allowRemove: false,
};

/** Reads an override file; a missing or empty `Body`/`Remove` is an empty list. */
export function loadOverrideFile(filePath: string): OverrideFile {
  const name = path.basename(filePath);
  const document: unknown = parse(readFileSync(filePath, 'utf8')) ?? {};
  if (!isMap(document)) throw new OverrideError(`${name}: expected a YAML map at the top level.`);
  for (const key of Object.keys(document)) {
    if (key !== 'Body' && key !== 'Remove') {
      throw new OverrideError(`${name}: unknown top-level key "${key}" (expected Body, Remove).`);
    }
  }
  const body = document.Body ?? [];
  const remove = document.Remove ?? [];
  if (!Array.isArray(body) || !body.every(isMap)) {
    throw new OverrideError(`${name}: Body must be a list of maps.`);
  }
  if (
    !Array.isArray(remove) ||
    !remove.every((entry) => typeof entry === 'string' || typeof entry === 'number')
  ) {
    throw new OverrideError(`${name}: Remove must be a list of ids.`);
  }
  return { name, body, remove };
}

/** Reads `meta.yml`, which holds the human data label. */
export function loadMeta(filePath: string): { label: string } {
  const document: unknown = parse(readFileSync(filePath, 'utf8'));
  if (!isMap(document) || typeof document.Label !== 'string' || document.Label.trim() === '') {
    throw new OverrideError(`${path.basename(filePath)}: needs a non-empty Label string.`);
  }
  return { label: document.Label };
}

function checkFields(patch: YamlMap, shape: RecordShape, where: string): void {
  for (const [field, value] of Object.entries(patch)) {
    const fieldShape = shape.fields[field];
    if (fieldShape === undefined) throw new OverrideError(`${where}: unknown field "${field}".`);
    if (typeof fieldShape === 'object' && isMap(value)) {
      checkFields(value, fieldShape, `${where}.${field}`);
    }
  }
}

function mergeRecord(base: YamlMap, patch: YamlMap, shape: RecordShape): YamlMap {
  const merged: YamlMap = { ...base };
  for (const [field, value] of Object.entries(patch)) {
    const fieldShape = shape.fields[field];
    const current = merged[field];
    if (fieldShape === 'freeMap' && isMap(current) && isMap(value)) {
      merged[field] = { ...current, ...value };
    } else if (typeof fieldShape === 'object' && isMap(current) && isMap(value)) {
      merged[field] = mergeRecord(current, value, fieldShape);
    } else {
      merged[field] = value;
    }
  }
  return merged;
}

/**
 * Applies an override file to rAthena-shaped records: patches existing
 * entries, appends new ones and drops removed ids. Output keeps the input
 * order with new entries at the end; converters sort later.
 */
export function applyOverrides(
  records: readonly YamlMap[],
  overrides: OverrideFile,
  schema: OverrideSchema,
): YamlMap[] {
  const { key } = schema;
  const byKey = new Map<unknown, YamlMap>();
  for (const record of records) byKey.set(record[key], record);
  const added: YamlMap[] = [];

  for (const patch of overrides.body) {
    const id = patch[key];
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new OverrideError(`${overrides.name}: every Body entry needs a ${key}.`);
    }
    const where = `${overrides.name}: ${key} ${id}`;
    checkFields(patch, schema.shape, where);
    const existing = byKey.get(id);
    if (existing !== undefined) {
      byKey.set(id, mergeRecord(existing, patch, schema.shape));
      continue;
    }
    if (!schema.allowAdd)
      throw new OverrideError(`${where}: no such entry; entries cannot be added here.`);
    const missing = schema.required.filter((field) => patch[field] === undefined);
    if (missing.length > 0) {
      throw new OverrideError(
        `${where}: new entry is missing required field(s) ${missing.join(', ')}.`,
      );
    }
    byKey.set(id, patch);
    added.push(patch);
  }

  for (const id of overrides.remove) {
    if (!schema.allowRemove) {
      throw new OverrideError(`${overrides.name}: Remove is not supported for this file.`);
    }
    if (!byKey.has(id)) throw new OverrideError(`${overrides.name}: Remove ${id}: no such ${key}.`);
    byKey.delete(id);
  }

  const result: YamlMap[] = [];
  for (const record of [...records, ...added]) {
    const id = record[key];
    if (!byKey.has(id)) continue;
    result.push(byKey.get(id) as YamlMap);
    // Guards against a record appearing twice when an id is both in records and added.
    byKey.delete(id);
  }
  return result;
}
