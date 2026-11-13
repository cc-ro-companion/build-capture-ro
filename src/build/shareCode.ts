// Share codes: an opaque, compact binary encoding of a build plus the data
// version it was made with. Links live forever, so every format version ever
// published must keep decoding; add tags or bump the version, never reuse.
//
// Format version 1:
//   byte      format version (1)
//   repeated  varint tag, varint value; tag 0 ends the list
//   4 bytes   data hash (8 hex characters)
//   varint    label length, then the label as UTF-8
import type { EngineConfig } from '../engine/config';
import { BUILD_VERSION, normalizeBuild, type Build } from './model';
import type { GameData } from './resolve';

const FORMAT_VERSION = 1;

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
  weapon: 10,
  monster: 11,
} as const;
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
    weapon: build.weapon ?? 0,
    monster: build.monster ?? 0,
  };
  const bytes: number[] = [FORMAT_VERSION];
  for (const [field, tag] of Object.entries(FIELD_TAGS) as [Field, number][]) {
    const value = values[field];
    if (!Number.isInteger(value) || value < 0 || value > MAX_VALUE) {
      throw new Error(`Cannot encode ${field} = ${value}.`);
    }
    writeVarint(bytes, tag);
    writeVarint(bytes, value);
  }
  writeVarint(bytes, TAG_END);
  for (let offset = 0; offset < 8; offset += 2) {
    bytes.push(Number.parseInt(version.hash.slice(offset, offset + 2), 16));
  }
  const label = new TextEncoder().encode(version.label);
  writeVarint(bytes, label.length);
  bytes.push(...label);
  return toBase64Url(bytes);
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
      return format > FORMAT_VERSION
        ? { error: 'The share code was made with a newer version of the planner.' }
        : { error: 'The share code is not valid.' };
    }
    const values: Partial<Record<Field, number>> = {};
    for (let tag = reader.varint(); tag !== TAG_END; tag = reader.varint()) {
      const field = FIELD_BY_TAG.get(tag);
      if (!field) throw new CorruptCode(`has an unknown field ${tag}`);
      if (values[field] !== undefined) throw new CorruptCode(`repeats field ${tag}`);
      values[field] = reader.varint();
    }
    const hash = Array.from(reader.take(4), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const label = new TextDecoder('utf-8', { fatal: true }).decode(reader.take(reader.varint()));
    if (!reader.done) throw new CorruptCode('has extra data at the end');

    const optionalId = (value: number | undefined) => (value === 0 ? null : value);
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
        weapon: optionalId(values.weapon),
        monster: optionalId(values.monster),
      },
      made: { hash, label },
    };
  } catch (error) {
    if (error instanceof CorruptCode) return { error: `The share code ${error.message}.` };
    if (error instanceof TypeError) return { error: 'The share code has an invalid data label.' };
    throw error;
  }
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
