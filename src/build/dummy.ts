// Training dummies: ccRO lets each player configure their own dummy, so a
// build keeps its own list of dummy settings by value. HP and the boss flag
// cannot be seen or changed in game, so they are not part of a dummy.
import type { Monster, Size } from '../data/types';
import { integerOrUndefined, isRecord } from './untrusted';

// These lists double as the share code's index tables: only ever append.
export const DUMMY_SIZES: readonly Size[] = ['small', 'medium', 'large'];
export const DUMMY_RACES: readonly string[] = [
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
];
export const DUMMY_ELEMENTS: readonly string[] = [
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
];

export const MAX_DUMMIES = 20;
export const MAX_DUMMY_NAME_LENGTH = 30;

export interface Dummy {
  name: string;
  level: number;
  def: number;
  mdef: number;
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
  size: Size;
  race: string;
  element: string;
  elementLevel: number;
}

export type DummyNumber = Exclude<keyof Dummy, 'name' | 'size' | 'race' | 'element'>;

/** Numeric settings in share code order, with the ranges the game allows. */
export const DUMMY_NUMBERS: readonly {
  key: DummyNumber;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: 'level', label: 'Level', min: 1, max: 99 },
  { key: 'def', label: 'DEF', min: 1, max: 999 },
  { key: 'mdef', label: 'MDEF', min: 1, max: 999 },
  { key: 'str', label: 'STR', min: 1, max: 999 },
  { key: 'agi', label: 'AGI', min: 1, max: 999 },
  { key: 'vit', label: 'VIT', min: 1, max: 999 },
  { key: 'int', label: 'INT', min: 1, max: 999 },
  { key: 'dex', label: 'DEX', min: 1, max: 999 },
  { key: 'luk', label: 'LUK', min: 1, max: 999 },
];

export const DUMMY_ELEMENT_LEVEL = { min: 1, max: 4 } as const;

export function defaultDummyName(index: number): string {
  return `Dummy ${index + 1}`;
}

export function defaultDummy(index: number): Dummy {
  return {
    name: defaultDummyName(index),
    level: 1,
    def: 1,
    mdef: 1,
    str: 1,
    agi: 1,
    vit: 1,
    int: 1,
    dex: 1,
    luk: 1,
    size: 'medium',
    race: 'Formless',
    element: 'Neutral',
    elementLevel: 1,
  };
}

function normalizeName(raw: unknown, index: number, warnings: string[]): string {
  const fallback = defaultDummyName(index);
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name === '') {
    warnings.push(`Dummy ${index + 1} has no name; named "${fallback}".`);
    return fallback;
  }
  // Count code points so a cut never splits a character in two.
  const characters = [...name];
  if (characters.length > MAX_DUMMY_NAME_LENGTH) {
    const cut = characters.slice(0, MAX_DUMMY_NAME_LENGTH).join('');
    warnings.push(
      `Dummy name "${name}" is longer than ${MAX_DUMMY_NAME_LENGTH} characters; cut to "${cut}".`,
    );
    return cut;
  }
  return name;
}

function normalizeDummy(raw: unknown, index: number, warnings: string[]): Dummy {
  const record = isRecord(raw) ? raw : {};
  const dummy = defaultDummy(index);
  dummy.name = normalizeName(record.name, index, warnings);
  const prefix = `Dummy "${dummy.name}"`;

  const clamp = (label: string, value: unknown, min: number, max: number) => {
    const number = integerOrUndefined(value);
    if (number === undefined) {
      warnings.push(`${prefix}: ${label} is missing or not a number; set to ${min}.`);
      return min;
    }
    const clamped = Math.min(Math.max(number, min), max);
    if (clamped !== number) {
      warnings.push(`${prefix}: ${label} ${number} is outside ${min}–${max}; set to ${clamped}.`);
    }
    return clamped;
  };
  for (const { key, label, min, max } of DUMMY_NUMBERS) {
    dummy[key] = clamp(label, record[key], min, max);
  }
  dummy.elementLevel = clamp(
    'Element level',
    record.elementLevel,
    DUMMY_ELEMENT_LEVEL.min,
    DUMMY_ELEMENT_LEVEL.max,
  );

  const choose = <T extends string>(
    label: string,
    value: unknown,
    options: readonly T[],
    fallback: T,
  ) => {
    if (options.includes(value as T)) return value as T;
    warnings.push(`${prefix}: unknown ${label} ${String(value)}; set to ${fallback}.`);
    return fallback;
  };
  dummy.size = choose('size', record.size, DUMMY_SIZES, dummy.size);
  dummy.race = choose('race', record.race, DUMMY_RACES, dummy.race);
  dummy.element = choose('element', record.element, DUMMY_ELEMENTS, dummy.element);
  return dummy;
}

/** Valid dummies from untrusted data; problems become warnings. */
export function normalizeDummies(raw: unknown, warnings: string[]): Dummy[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('The dummy list is not a list; removed.');
    return [];
  }
  if (raw.length > MAX_DUMMIES) {
    warnings.push(
      `${raw.length} dummies is more than ${MAX_DUMMIES}; the last ` +
        `${raw.length - MAX_DUMMIES} were removed.`,
    );
  }
  return raw.slice(0, MAX_DUMMIES).map((entry, index) => normalizeDummy(entry, index, warnings));
}

export function sameDummy(a: Dummy, b: Dummy): boolean {
  return (Object.keys(a) as (keyof Dummy)[]).every((key) => a[key] === b[key]);
}

/**
 * The dummy as an engine target: a normal monster without modes or race
 * groups. HP is unknown in game; 0 stands for "not shown".
 */
export function dummyMonster(dummy: Dummy): Monster {
  return {
    id: 0,
    aegisName: 'TRAINING_DUMMY',
    level: dummy.level,
    hp: 0,
    attackMin: 0,
    attackMax: 0,
    defense: dummy.def,
    magicDefense: dummy.mdef,
    str: dummy.str,
    agi: dummy.agi,
    vit: dummy.vit,
    int: dummy.int,
    dex: dummy.dex,
    luk: dummy.luk,
    size: dummy.size,
    race: dummy.race,
    raceGroups: [],
    element: dummy.element,
    elementLevel: dummy.elementLevel,
    class: 'normal',
    modes: [],
    attackRange: 1,
    attackDelay: 0,
    attackMotion: 0,
    damageMotion: 0,
    walkSpeed: 0,
  };
}
