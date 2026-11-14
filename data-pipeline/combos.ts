import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { Combo, Item } from '../src/data/types.ts';
import { OverrideError } from './overrides.ts';
import { loadDb, type YamlMap } from './rathena.ts';
import { parseScript } from './script/parser.ts';

/** Base file; its footer imports db/pre-re/item_combos.yml. */
export const COMBO_BASE_FILE = 'db/item_combos.yml';

function isMap(value: unknown): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const keyOf = (items: readonly number[]) => items.join(',');

function scriptFields(script: unknown, where: string): Pick<Combo, 'effects' | 'unsupported'> {
  if (script !== undefined && script !== null && typeof script !== 'string') {
    throw new Error(`${where}: Script must be a string.`);
  }
  const result = parseScript(typeof script === 'string' ? script : '');
  return result.ok ? { effects: result.effects } : { effects: null, unsupported: result.reason };
}

export interface ComboStats {
  /** Combos kept from rAthena, before overrides. */
  kept: number;
  /**
   * Combos dropped because an item is not generated equipment: cards (ccRO has
   * none), ammo, or gear no supported character can wear. None can complete.
   */
  dropped: number;
}

/**
 * Converts rAthena combo records. Each record lists one or more item
 * combinations sharing a script; every combination becomes its own combo.
 * Combinations naming an item that is not generated equipment are dropped,
 * since a build can never hold all their items.
 * Like rAthena's ComboDatabase, a later record for the same items replaces
 * the earlier script.
 */
export function convertCombos(
  records: readonly YamlMap[],
  equipment: readonly Item[],
): { combos: Map<string, Combo>; stats: ComboStats } {
  const idByAegis = new Map(equipment.map((item) => [item.aegisName.toLowerCase(), item.id]));
  const combos = new Map<string, Combo>();
  let dropped = 0;
  records.forEach((record, index) => {
    const where = `${COMBO_BASE_FILE}: entry ${index + 1}`;
    if (record.Clear !== undefined) throw new Error(`${where}: Clear is not supported.`);
    if (!Array.isArray(record.Combos)) throw new Error(`${where}: Combos must be a list.`);
    const fields = scriptFields(record.Script, where);
    for (const combination of record.Combos) {
      if (!isMap(combination) || !Array.isArray(combination.Combo)) {
        throw new Error(`${where}: every Combos entry needs a Combo list.`);
      }
      const ids = combination.Combo.map((name) =>
        typeof name === 'string' ? idByAegis.get(name.toLowerCase()) : undefined,
      );
      if (ids.some((id) => id === undefined)) {
        dropped++;
        continue;
      }
      const items = (ids as number[]).sort((a, b) => a - b);
      combos.set(keyOf(items), { items, ...fields });
    }
  });
  return { combos, stats: { kept: combos.size, dropped } };
}

export interface ComboOverrides {
  name: string;
  body: { items: number[]; script: string }[];
  remove: number[][];
}

function idList(value: unknown, where: string): number[] {
  if (!Array.isArray(value) || value.length < 2 || !value.every((id) => Number.isInteger(id))) {
    throw new OverrideError(`${where}: needs a list of at least two item ids.`);
  }
  return [...(value as number[])].sort((a, b) => a - b);
}

/**
 * Parses combos.yml: `Body` entries `{ Items: [ids], Script }` replace the
 * script of the combo with those items or add a new combo; `Remove` lists
 * item id lists. Ids may be given in any order.
 */
export function parseComboOverrides(text: string, name: string): ComboOverrides {
  const document: unknown = parse(text) ?? {};
  if (!isMap(document)) throw new OverrideError(`${name}: expected a YAML map at the top level.`);
  for (const key of Object.keys(document)) {
    if (key !== 'Body' && key !== 'Remove') {
      throw new OverrideError(`${name}: unknown top-level key "${key}" (expected Body, Remove).`);
    }
  }
  const body = document.Body ?? [];
  const remove = document.Remove ?? [];
  if (!Array.isArray(body)) throw new OverrideError(`${name}: Body must be a list.`);
  if (!Array.isArray(remove)) throw new OverrideError(`${name}: Remove must be a list.`);
  return {
    name,
    body: body.map((entry, index) => {
      const where = `${name}: Body[${index}]`;
      if (!isMap(entry)) throw new OverrideError(`${where}: must be a map.`);
      for (const key of Object.keys(entry)) {
        if (key !== 'Items' && key !== 'Script') {
          throw new OverrideError(`${where}: unknown field "${key}" (expected Items, Script).`);
        }
      }
      if (typeof entry.Script !== 'string') {
        throw new OverrideError(`${where}: Script must be a string.`);
      }
      return { items: idList(entry.Items, `${where}: Items`), script: entry.Script };
    }),
    remove: remove.map((entry, index) => idList(entry, `${name}: Remove[${index}]`)),
  };
}

export function applyComboOverrides(
  combos: Map<string, Combo>,
  overrides: ComboOverrides,
  equipment: readonly Item[],
): Combo[] {
  const equipmentIds = new Set(equipment.map((item) => item.id));
  const result = new Map(combos);
  for (const items of overrides.remove) {
    if (!result.delete(keyOf(items))) {
      throw new OverrideError(`${overrides.name}: Remove: no combo of items ${keyOf(items)}.`);
    }
  }
  for (const { items, script } of overrides.body) {
    const unknown = items.filter((id) => !equipmentIds.has(id));
    if (unknown.length > 0) {
      throw new OverrideError(
        `${overrides.name}: combo ${keyOf(items)}: no such equipment: ${unknown.join(', ')}.`,
      );
    }
    result.set(keyOf(items), {
      items,
      ...scriptFields(script, `${overrides.name}: combo ${keyOf(items)}`),
    });
  }
  return [...result.values()].sort((a, b) => {
    for (let i = 0; i < Math.min(a.items.length, b.items.length); i++) {
      if (a.items[i] !== b.items[i]) return a.items[i]! - b.items[i]!;
    }
    return a.items.length - b.items.length;
  });
}

export function generateCombos(
  rathenaDir: string,
  overridesPath: string,
  equipment: readonly Item[],
): { data: Combo[]; stats: ComboStats } {
  const records = loadDb(rathenaDir, COMBO_BASE_FILE).body;
  const { combos, stats } = convertCombos(records, equipment);
  const overrides = parseComboOverrides(
    readFileSync(overridesPath, 'utf8'),
    path.basename(overridesPath),
  );
  return { data: applyComboOverrides(combos, overrides, equipment), stats };
}
