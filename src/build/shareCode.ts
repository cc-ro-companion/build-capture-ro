// Share codes: an opaque, compact binary encoding of a build plus the data
// version it was made with. Links live forever, so every format version ever
// published must keep decoding; add tags or bump the version, never reuse.
//
// Format version 1:
//   byte      format version (1)
//   repeated  varint tag, varint value; tag 0 ends the list
//             tags 1–9: job, base level, job level, STR..LUK
//             tag 10: right-hand weapon at +0 (0 = none); read only, phase 3
//               codes wrote it, tag 14 replaced it
//             tag 11: target monster id; tag 12: target dummy index + 1 (one of the two)
//             tag 13, repeated in list order: a dummy record as the value:
//               varint name length, the name as UTF-8, then varints level, DEF,
//               MDEF, STR, AGI, VIT, INT, DEX, LUK, size index, race index,
//               element index, element level (index tables in ./dummy)
//             tag 14, repeated, one per equipped slot: the value is varints
//               slot index (SLOTS order in ./equipment), item id, refine
//             tag 15, repeated, one per equipped slot with runes: varints slot
//               index, rune count, then each rune id − 39000
//             tag 16, repeated in list order: an inventory item as varints
//               item id, refine, rune count, then each rune id − 39000
//   4 bytes   data hash (8 hex characters)
//   varint    label length, then the label as UTF-8
import type { EngineConfig } from '../engine/config';
import { DUMMY_ELEMENTS, DUMMY_NUMBERS, DUMMY_RACES, DUMMY_SIZES } from './dummy';
import { MAX_RUNES, SLOTS } from './equipment';
import { BUILD_VERSION, normalizeBuild, type Build, type Target } from './model';
import type { GameData } from './resolve';

const FORMAT_VERSION = 1;
const MAX_PLAUSIBLE_FORMAT = 63;

const TAG_END = 0;
const FIELD_TAGS = {
  job: 1,
  baseLevel: 2,
  jobLevel: 3,
  str: 4,
  agi: 5,
  vit: 6,
  int: 7,
  dex: 8,
  luk: 9,
} as const;
const TAG_WEAPON = 10;
const TAG_TARGET_MONSTER = 11;
const TAG_TARGET_DUMMY = 12;
const TAG_DUMMY = 13;
const TAG_EQUIPPED = 14;
const TAG_RUNES = 15;
const TAG_INVENTORY = 16;
/** Rune ids are client ids 39xxx; storing the offset saves a byte per rune. */
const RUNE_ID_BASE = 39000;
type Field = keyof typeof FIELD_TAGS;
const FIELD_BY_TAG = new Map(
  Object.entries(FIELD_TAGS).map(([field, tag]) => [tag as number, field as Field]),
);

/** Values above this cannot come from a valid build; it also bounds varint length. */
const MAX_VALUE = 0x7fffffff;

export interface DataVersion {
  hash: string;
  label: string;
}

export interface RestoredBuild {
  build: Build;
  /** Things that were dropped or clamped while reading the build. */
  warnings: string[];
  /** Set when the build was made with other data than the current one. */
  dataHint: string | null;
}

export type RestoreResult = RestoredBuild | { error: string };

export function dataVersionHint(made: DataVersion, current: DataVersion): string | null {
  if (made.hash === current.hash) return null;
  return (
    `Made with data ${made.label} (${made.hash}); current data is ` +
    `${current.label} (${current.hash}). Numbers may differ.`
  );
}

/**
 * Turns untrusted build data plus the data version it names into a valid
 * build. Shared by share codes and the readable JSON in storage.
 */
export function restoreBuild(
  raw: unknown,
  made: DataVersion,
  data: GameData,
  config: EngineConfig,
  current: DataVersion,
): RestoreResult {
  const result = normalizeBuild(raw, data, config);
  if ('error' in result) return result;
  return { ...result, dataHint: dataVersionHint(made, current) };
}

function writeVarint(bytes: number[], value: number): void {
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest = Math.floor(rest / 0x80);
    if (rest > 0) byte |= 0x80;
    bytes.push(byte);
  } while (rest > 0);
}

function toBase64Url(bytes: readonly number[]): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(code) || code.length % 4 === 1) return null;
  const base64 = code.replaceAll('-', '+').replaceAll('_', '/');
  try {
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeShareCode(build: Build, version: DataVersion): string {
  if (!/^[0-9a-f]{8}$/.test(version.hash)) {
    throw new Error(`Data hash must be 8 hex characters, got "${version.hash}".`);
  }
  const values: Record<Field, number> = {
    job: build.job,
    baseLevel: build.baseLevel,
    jobLevel: build.jobLevel,
    ...build.stats,
  };
  const bytes: number[] = [FORMAT_VERSION];
  const writeValue = (name: string, value: number) => {
    if (!Number.isInteger(value) || value < 0 || value > MAX_VALUE) {
      throw new Error(`Cannot encode ${name} = ${value}.`);
    }
    writeVarint(bytes, value);
  };
  for (const [field, tag] of Object.entries(FIELD_TAGS) as [Field, number][]) {
    writeVarint(bytes, tag);
    writeValue(field, values[field]);
  }
  if (build.target && 'monster' in build.target) {
    writeVarint(bytes, TAG_TARGET_MONSTER);
    writeValue('target monster', build.target.monster);
  } else if (build.target && 'dummy' in build.target) {
    writeVarint(bytes, TAG_TARGET_DUMMY);
    writeValue('target dummy', build.target.dummy + 1);
  }
  SLOTS.forEach((slot, index) => {
    const entry = build.equipment[slot];
    if (!entry) return;
    writeVarint(bytes, TAG_EQUIPPED);
    writeValue('slot', index);
    writeValue(`${slot} item`, entry.item);
    writeValue(`${slot} refine`, entry.refine);
  });
  const writeRunes = (where: string, runes: readonly number[]) => {
    writeValue(`${where} rune count`, runes.length);
    for (const rune of runes) writeValue(`${where} rune`, rune - RUNE_ID_BASE);
  };
  SLOTS.forEach((slot, index) => {
    const runes = build.equipment[slot]?.runes;
    if (!runes || runes.length === 0) return;
    writeVarint(bytes, TAG_RUNES);
    writeValue('slot', index);
    writeRunes(slot, runes);
  });
  for (const ref of build.inventory) {
    writeVarint(bytes, TAG_INVENTORY);
    writeValue('inventory item', ref.item);
    writeValue('inventory refine', ref.refine);
    writeRunes('inventory', ref.runes ?? []);
  }
  for (const dummy of build.dummies) {
    writeVarint(bytes, TAG_DUMMY);
    writeText(bytes, dummy.name);
    for (const { key } of DUMMY_NUMBERS) writeValue(`dummy ${key}`, dummy[key]);
    writeValue('dummy size', DUMMY_SIZES.indexOf(dummy.size));
    writeValue('dummy race', DUMMY_RACES.indexOf(dummy.race));
    writeValue('dummy element', DUMMY_ELEMENTS.indexOf(dummy.element));
    writeValue('dummy element level', dummy.elementLevel);
  }
  writeVarint(bytes, TAG_END);
  for (let offset = 0; offset < 8; offset += 2) {
    bytes.push(Number.parseInt(version.hash.slice(offset, offset + 2), 16));
  }
  writeText(bytes, version.label);
  return toBase64Url(bytes);
}

function writeText(bytes: number[], text: string): void {
  const encoded = new TextEncoder().encode(text);
  writeVarint(bytes, encoded.length);
  bytes.push(...encoded);
}

class Reader {
  private offset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  byte(): number {
    const value = this.bytes[this.offset++];
    if (value === undefined) throw new CorruptCode('ends early');
    return value;
  }

  varint(): number {
    let value = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const byte = this.byte();
      value += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) {
        if (value > MAX_VALUE) throw new CorruptCode('holds a number that is too large');
        return value;
      }
    }
    throw new CorruptCode('holds a number that is too long');
  }

  text(): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(this.take(this.varint()));
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new CorruptCode('ends early');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

class CorruptCode extends Error {}

interface DecodedCode {
  raw: Record<string, unknown>;
  made: DataVersion;
}

function readCode(code: string): DecodedCode | { error: string } {
  const bytes = fromBase64Url(code.trim());
  if (!bytes || bytes.length === 0) return { error: 'The share code is not valid.' };
  const reader = new Reader(bytes);
  try {
    const format = reader.byte();
    if (format !== FORMAT_VERSION) {
      // Random input usually starts with a large byte; only small numbers are
      // plausible future format versions worth telling the user about.
      return format > FORMAT_VERSION && format <= MAX_PLAUSIBLE_FORMAT
        ? { error: 'The share code was made with a newer version of the planner.' }
        : { error: 'The share code is not valid.' };
    }
    const values: Partial<Record<Field, number>> = {};
    let target: Target = null;
    const dummies: Record<string, unknown>[] = [];
    // Unknown slot indexes are kept as `#index` keys so normalize warns about them.
    const equipment: Record<string, { item: number; refine: number; runes?: number[] }> = {};
    const addEquipped = (slot: string, item: number, refine: number) => {
      if (slot in equipment) throw new CorruptCode(`repeats the ${slot} slot`);
      equipment[slot] = { item, refine };
    };
    const runesBySlot = new Map<string, number[]>();
    const inventory: { item: number; refine: number; runes?: number[] }[] = [];
    const readRunes = (): number[] => {
      const count = reader.varint();
      if (count > MAX_RUNES) throw new CorruptCode('holds too many runes for one item');
      return Array.from({ length: count }, () => reader.varint() + RUNE_ID_BASE);
    };
    let weaponSeen = false;
    for (let tag = reader.varint(); tag !== TAG_END; tag = reader.varint()) {
      if (tag === TAG_TARGET_MONSTER || tag === TAG_TARGET_DUMMY) {
        if (target !== null) throw new CorruptCode('has more than one target');
        const value = reader.varint();
        if (tag === TAG_TARGET_MONSTER) target = { monster: value };
        // Index + 1 on the wire; 0 is not a valid dummy and becomes -1 for normalize.
        else target = { dummy: value - 1 };
        continue;
      }
      if (tag === TAG_DUMMY) {
        dummies.push(readDummy(reader));
        continue;
      }
      if (tag === TAG_WEAPON) {
        if (weaponSeen) throw new CorruptCode(`repeats field ${tag}`);
        weaponSeen = true;
        const weapon = reader.varint();
        if (weapon !== 0) addEquipped('rightHand', weapon, 0);
        continue;
      }
      if (tag === TAG_EQUIPPED) {
        const index = reader.varint();
        const item = reader.varint();
        const refine = reader.varint();
        addEquipped(SLOTS[index] ?? `#${index}`, item, refine);
        continue;
      }
      if (tag === TAG_RUNES) {
        const index = reader.varint();
        const slot = SLOTS[index] ?? `#${index}`;
        if (runesBySlot.has(slot)) throw new CorruptCode(`repeats the runes of ${slot}`);
        runesBySlot.set(slot, readRunes());
        continue;
      }
      if (tag === TAG_INVENTORY) {
        const item = reader.varint();
        const refine = reader.varint();
        const runes = readRunes();
        inventory.push({ item, refine, ...(runes.length > 0 ? { runes } : {}) });
        continue;
      }
      const field = FIELD_BY_TAG.get(tag);
      if (!field) throw new CorruptCode(`has an unknown field ${tag}`);
      if (values[field] !== undefined) throw new CorruptCode(`repeats field ${tag}`);
      values[field] = reader.varint();
    }
    for (const [slot, runes] of runesBySlot) {
      const entry = equipment[slot];
      if (!entry) throw new CorruptCode(`has runes for the empty ${slot} slot`);
      entry.runes = runes;
    }
    const hash = Array.from(reader.take(4), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const label = reader.text();
    if (!reader.done) throw new CorruptCode('has extra data at the end');

    return {
      raw: {
        v: BUILD_VERSION,
        job: values.job,
        baseLevel: values.baseLevel,
        jobLevel: values.jobLevel,
        stats: {
          str: values.str,
          agi: values.agi,
          vit: values.vit,
          int: values.int,
          dex: values.dex,
          luk: values.luk,
        },
        equipment,
        inventory,
        dummies,
        target,
      },
      made: { hash, label },
    };
  } catch (error) {
    if (error instanceof CorruptCode) return { error: `The share code ${error.message}.` };
    if (error instanceof TypeError) return { error: 'The share code holds invalid text.' };
    throw error;
  }
}

/**
 * A dummy record. Unknown index values are passed on as descriptive strings
 * so normalize replaces them with a warning instead of failing the code.
 */
function readDummy(reader: Reader): Record<string, unknown> {
  const dummy: Record<string, unknown> = { name: reader.text() };
  for (const { key } of DUMMY_NUMBERS) dummy[key] = reader.varint();
  const fromTable = (table: readonly string[], index: number) => table[index] ?? `#${index}`;
  dummy.size = fromTable(DUMMY_SIZES, reader.varint());
  dummy.race = fromTable(DUMMY_RACES, reader.varint());
  dummy.element = fromTable(DUMMY_ELEMENTS, reader.varint());
  dummy.elementLevel = reader.varint();
  return dummy;
}

export function decodeShareCode(
  code: string,
  data: GameData,
  config: EngineConfig,
  current: DataVersion,
): RestoreResult {
  const decoded = readCode(code);
  if ('error' in decoded) return decoded;
  return restoreBuild(decoded.raw, decoded.made, data, config, current);
}

const FRAGMENT_PREFIX = '#b=';

/** The share code in a URL fragment such as `#b=AQEM...`, or null. */
export function shareCodeFromFragment(fragment: string): string | null {
  return fragment.startsWith(FRAGMENT_PREFIX) ? fragment.slice(FRAGMENT_PREFIX.length) : null;
}

/** A link to the page at `pageUrl` (fragment replaced) that opens the build. */
export function shareLink(pageUrl: string, code: string): string {
  const withoutFragment = pageUrl.split('#')[0] ?? pageUrl;
  return `${withoutFragment}${FRAGMENT_PREFIX}${code}`;
}
