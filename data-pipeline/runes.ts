import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { AlbumEffect, Rune, RuneLocation, RuneSet, ScriptStmt } from '../src/data/types.ts';
import { OverrideError } from './overrides.ts';
import { parseScript } from './script/parser.ts';

/** Marks client text the draft tool could not map; see data-pipeline/tools/draft-runes.ts. */
export const TODO_MARKER = '# TODO:';
export const RUNE_ID_MIN = 39000;
export const RUNE_ID_MAX = 39999;
const LOCATIONS: readonly RuneLocation[] = [
  'Weapon',
  'Shield',
  'Armor',
  'Garment',
  'Footgear',
  'Accessory',
  'Headgear',
];

type YamlMap = Record<string, unknown>;

function isMap(value: unknown): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isTodo = (line: string) => line.trim().startsWith(TODO_MARKER);

/**
 * Parses one rune script. TODO lines are dropped from drafts so the mapped
 * part still counts; a reviewed rune must not have any left. Rune scripts are
 * written by hand in the parsed subset, so a parse failure is an error, not
 * an unsupported effect.
 */
function runeScript(value: unknown, reviewed: boolean, where: string): ScriptStmt[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'string') throw new OverrideError(`${where}: Script must be a string.`);
  const lines = value.split('\n');
  const todo = lines.find(isTodo);
  if (todo !== undefined && reviewed) {
    throw new OverrideError(`${where}: Reviewed rune still has "${todo.trim()}".`);
  }
  const result = parseScript(lines.filter((line) => !isTodo(line)).join('\n'));
  if (!result.ok) {
    throw new OverrideError(`${where}: script not parsed (${result.reason}): ${result.statement}`);
  }
  return result.effects;
}

function list(value: unknown, where: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new OverrideError(`${where} must be a list.`);
  return value;
}

/**
 * `Unmodelled`: client text of effects that no rAthena bonus expresses (or
 * that only matter outside a planner), shown in the "not modelled" notes.
 * Left out of the output when empty.
 */
function unmodelled(value: unknown, where: string): { unmodelled?: string[] } {
  const texts = list(value, `${where}: Unmodelled`);
  if (!texts.every((text) => typeof text === 'string' && text !== '')) {
    throw new OverrideError(`${where}: Unmodelled must list texts.`);
  }
  return texts.length > 0 ? { unmodelled: texts as string[] } : {};
}

function convertSet(value: unknown, reviewed: boolean, where: string): RuneSet {
  if (!isMap(value)) throw new OverrideError(`${where}: must be a map.`);
  const requires = list(value.Requires, `${where}: Requires`);
  // A draft whose set runes the tool could not name has none yet.
  const empty = requires.length === 0 && reviewed;
  if (empty || !requires.every((id) => Number.isInteger(id))) {
    throw new OverrideError(`${where}: Requires must list rune ids.`);
  }
  return {
    requires: requires as number[],
    effects: runeScript(value.Script, reviewed, where),
    ...unmodelled(value.Unmodelled, where),
  };
}

function convertAlbum(value: unknown, reviewed: boolean, where: string): AlbumEffect {
  if (!isMap(value)) throw new OverrideError(`${where}: must be a map.`);
  const requires = list(value.Requires, `${where}: Requires`);
  if (requires.length === 0 || !requires.every((name) => typeof name === 'string')) {
    throw new OverrideError(`${where}: Requires must list card names.`);
  }
  if (value.RightHandOnly !== undefined && typeof value.RightHandOnly !== 'boolean') {
    throw new OverrideError(`${where}: RightHandOnly must be true or false.`);
  }
  if (value.Note !== undefined && typeof value.Note !== 'string') {
    throw new OverrideError(`${where}: Note must be a string.`);
  }
  return {
    requires: requires as string[],
    rightHandOnly: value.RightHandOnly === true,
    ...(value.Note !== undefined ? { note: value.Note } : {}),
    effects: runeScript(value.Script, reviewed, where),
    ...unmodelled(value.Unmodelled, where),
  };
}

function convertRune(entry: unknown, fileName: string): { rune: Rune; name: string } {
  if (!isMap(entry)) throw new OverrideError(`${fileName}: every rune must be a map.`);
  const id = entry.Id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < RUNE_ID_MIN || id > RUNE_ID_MAX) {
    throw new OverrideError(
      `${fileName}: rune Id ${String(id)} is not a client rune id (${RUNE_ID_MIN}-${RUNE_ID_MAX}).`,
    );
  }
  const where = `${fileName}: rune ${id}`;
  if (typeof entry.Name !== 'string' || entry.Name === '') {
    throw new OverrideError(`${where}: missing Name.`);
  }
  if (!LOCATIONS.includes(entry.Location as RuneLocation)) {
    throw new OverrideError(
      `${where}: Location must be one of ${LOCATIONS.join(', ')}, not "${String(entry.Location)}".`,
    );
  }
  if (typeof entry.Reviewed !== 'boolean') {
    throw new OverrideError(`${where}: Reviewed must be true or false.`);
  }
  const reviewed = entry.Reviewed;
  const sets = list(entry.Sets, `${where}: Sets`).map((set, index) =>
    convertSet(set, reviewed, `${where}: Sets[${index}]`),
  );
  const album = list(entry.Album, `${where}: Album`).map((effect, index) =>
    convertAlbum(effect, reviewed, `${where}: Album[${index}]`),
  );
  return {
    rune: {
      id,
      location: entry.Location as RuneLocation,
      effects: runeScript(entry.Script, reviewed, `${where}: Script`),
      ...unmodelled(entry.Unmodelled, where),
      sets,
      album,
      reviewed,
    },
    name: entry.Name,
  };
}

/** Parses runes.yml into runes sorted by id and their names. */
export function parseRunes(
  text: string,
  fileName: string,
): { data: Rune[]; names: Record<number, string> } {
  const document: unknown = parse(text) ?? {};
  if (!isMap(document)) throw new OverrideError(`${fileName}: expected a map with Runes.`);
  const runes: Rune[] = [];
  const names: Record<number, string> = {};
  for (const entry of list(document.Runes, `${fileName}: Runes`)) {
    const { rune, name } = convertRune(entry, fileName);
    if (names[rune.id] !== undefined) {
      throw new OverrideError(`${fileName}: rune ${rune.id} is listed twice.`);
    }
    runes.push(rune);
    names[rune.id] = name;
  }
  for (const rune of runes) {
    for (const set of rune.sets) {
      for (const required of set.requires) {
        if (required === rune.id) {
          throw new OverrideError(
            `${fileName}: rune ${rune.id}: a set must not list its own rune.`,
          );
        }
        if (names[required] === undefined) {
          throw new OverrideError(
            `${fileName}: rune ${rune.id}: set needs unknown rune ${required}.`,
          );
        }
      }
    }
  }
  runes.sort((a, b) => a.id - b.id);
  return { data: runes, names };
}

export function loadRunes(filePath: string): { data: Rune[]; names: Record<number, string> } {
  return parseRunes(readFileSync(filePath, 'utf8'), path.basename(filePath));
}
