import { describe, expect, it } from 'vitest';
import { dataMeta } from '../data';
import { rAthenaDefaults } from '../engine/config';
import { defaultDummy, type Dummy } from './dummy';
import { autoAttack } from '../engine/autoAttack';
import { statusWindow } from '../engine/status';
import { defaultBuild, type Build } from './model';
import { gameData, resolveBuild } from './resolve';
import {
  decodeShareCode,
  encodeShareCode,
  shareCodeFromFragment,
  shareLink,
  type DataVersion,
} from './shareCode';

const current: DataVersion = { hash: dataMeta.hash, label: dataMeta.label };

// Assassin 99/50 with a Jur (katar) against Poring.
const typical: Build = {
  ...defaultBuild(),
  job: 12,
  baseLevel: 99,
  jobLevel: 50,
  stats: { str: 99, agi: 90, vit: 30, int: 1, dex: 40, luk: 10 },
  equipment: { rightHand: { item: 1250, refine: 7 } },
  target: { monster: 1002 },
};

// Every slot filled: dual-wielded knives, goggles over top and mid headgear.
const fullGear: Build = {
  ...typical,
  equipment: {
    headTop: { item: 2224, refine: 4 },
    headLow: { item: 2218, refine: 0 },
    armor: { item: 2303, refine: 10 },
    garment: { item: 2503, refine: 5 },
    shoes: { item: 2403, refine: 3 },
    accessoryLeft: { item: 2601, refine: 0 },
    accessoryRight: { item: 2604, refine: 0 },
    rightHand: { item: 1201, refine: 8 },
    leftHand: { item: 1204, refine: 6 },
  },
};

// Written by the phase 3 encoder (commit a85e1b9): the typical build with
// Jur as `weapon` (tag 10), data 1a2b3c4d "ccRO 2026-11".
const PHASE_3_CODE = 'AQEMAmMDMgRjBVoGHgcBCCgJCgriCQvqBwAaKzxNDGNjUk8gMjAyNi0xMQ';

// The same character against a configured dummy, as a validation session uses.
const dummy: Dummy = {
  ...defaultDummy(0),
  name: 'Training Dummy',
  level: 99,
  def: 40,
  vit: 120,
  agi: 150,
  luk: 60,
  size: 'large',
  race: 'Demihuman',
  element: 'Ghost',
  elementLevel: 2,
};
const withDummy: Build = { ...typical, dummies: [dummy], target: { dummy: 0 } };

function decode(code: string) {
  return decodeShareCode(code, gameData, rAthenaDefaults, current);
}

function bytesOf(code: string): number[] {
  const binary = atob(code.replaceAll('-', '+').replaceAll('_', '/'));
  return Array.from(binary, (character) => character.charCodeAt(0));
}

function codeOf(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

describe('share code', () => {
  it('round-trips the build and data version', () => {
    const result = decode(encodeShareCode(typical, current));
    expect(result).toEqual({ build: typical, warnings: [], dataHint: null });
  });

  it('round-trips full gear with refines', () => {
    expect(decode(encodeShareCode(fullGear, current))).toEqual({
      build: fullGear,
      warnings: [],
      dataHint: null,
    });
  });

  it('opens a phase 3 code with the weapon in the right hand and the same numbers', () => {
    const result = decode(PHASE_3_CODE);
    if (!('build' in result)) throw new Error(result.error);
    expect(result.build).toEqual({
      ...typical,
      equipment: { rightHand: { item: 1250, refine: 0 } },
    });
    expect(result.warnings).toEqual([]);
    // Recorded from the phase 3 engine for this build (commit a85e1b9).
    const resolved = resolveBuild(result.build, gameData);
    const status = statusWindow(resolved.character, rAthenaDefaults);
    expect(status).toMatchObject({ atk: [341, 0], aspd: 172, critRate: 86, def: [0, 32] });
    const attack = autoAttack(
      resolved.character,
      resolved.monster ?? fail(),
      gameData.tables,
      rAthenaDefaults,
    );
    expect(attack.normal).toEqual({ min: 274, max: 342, avg: 308.0882352941176 });
    expect(attack.crit).toEqual({ min: 344, max: 344, avg: 344 });
    expect(attack.dps).toBe(559.822357203751);
  });

  it('rejects a code that fills a slot twice', () => {
    const bytes = bytesOf(encodeShareCode(typical, current));
    // Tag 14 for the right hand (slot 8), item 1201, +0, inserted before the first field.
    expect(decode(codeOf([1, 14, 8, 0xb1, 0x09, 0, ...bytes.slice(1)]))).toEqual({
      error: expect.stringMatching(/repeats the rightHand slot/),
    });
    // Tag 10 (phase 3 weapon) next to a tag 14 right hand.
    expect(decode(codeOf([1, 10, 0xb1, 0x09, ...bytes.slice(1)]))).toEqual({
      error: expect.stringMatching(/repeats the rightHand slot/),
    });
  });

  it('decodes an unknown slot index as a warning', () => {
    const bytes = bytesOf(encodeShareCode(typical, current));
    const result = decode(codeOf([1, 14, 40, 0xb1, 0x09, 0, ...bytes.slice(1)]));
    expect(result).toMatchObject({ build: { equipment: typical.equipment } });
    expect('warnings' in result && result.warnings).toEqual([
      'Unknown equipment slot #40; its item was removed.',
    ]);
  });

  it('round-trips bare hands and no target', () => {
    const build = { ...typical, equipment: {}, target: null };
    expect(decode(encodeShareCode(build, current))).toMatchObject({ build });
  });

  it('round-trips dummies and a dummy target', () => {
    const build: Build = {
      ...withDummy,
      dummies: [dummy, { ...defaultDummy(1), name: 'Wägen ☆' }, defaultDummy(2)],
      target: { dummy: 2 },
    };
    expect(decode(encodeShareCode(build, current))).toEqual({
      build,
      warnings: [],
      dataHint: null,
    });
  });

  it.each([
    ['a monster target', typical],
    ['one dummy as target', withDummy],
    ['full gear', fullGear],
  ])('is url-safe and keeps a typical link with %s under 200 characters', (_, build) => {
    const code = encodeShareCode(build, current);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const link = shareLink('https://cc-ro-companion.github.io/build-capture-ro/', code);
    expect(link.length).toBeLessThan(200);
  });

  it('decodes dummy problems as warnings', () => {
    const build: Build = {
      ...withDummy,
      dummies: [{ ...dummy, def: 1500 }],
      target: { dummy: 3 },
    };
    const result = decode(encodeShareCode(build, current));
    expect(result).toMatchObject({ build: { dummies: [{ def: 999 }], target: null } });
    expect('warnings' in result && result.warnings).toHaveLength(2);
  });

  it('shows the data version hint for a code made with other data', () => {
    const code = encodeShareCode(typical, { hash: '0badc0de', label: 'ccRO 2026-10' });
    const result = decode(code);
    expect(result).toMatchObject({ build: typical });
    expect('dataHint' in result && result.dataHint).toBe(
      `Made with data ccRO 2026-10 (0badc0de); current data is ${current.label} ` +
        `(${current.hash}). Numbers may differ.`,
    );
  });

  it('decodes content problems as warnings, not errors', () => {
    const build = { ...typical, equipment: { armor: { item: 99999, refine: 0 } }, baseLevel: 200 };
    const result = decode(encodeShareCode(build, current));
    expect(result).toMatchObject({ build: { equipment: {}, baseLevel: 99 } });
    expect('warnings' in result && result.warnings).toHaveLength(2);
  });

  it.each([
    ['empty', ''],
    ['not base64url', 'a+b/c'],
    ['garbage', 'zzzz'],
  ])('rejects a corrupted code (%s) without a build', (_, code) => {
    expect(decode(code)).toEqual({ error: expect.any(String) });
  });

  it('rejects truncated codes and trailing bytes', () => {
    const bytes = bytesOf(encodeShareCode(typical, current));
    for (let length = 1; length < bytes.length; length++) {
      expect(decode(codeOf(bytes.slice(0, length)))).toHaveProperty('error');
    }
    expect(decode(codeOf([...bytes, 0]))).toHaveProperty('error');
  });

  it('rejects a code with two targets', () => {
    const bytes = bytesOf(encodeShareCode(typical, current));
    // Tag 12 (dummy index + 1) with value 1, inserted before the first field.
    expect(decode(codeOf([1, 12, 1, ...bytes.slice(1)]))).toEqual({
      error: expect.stringMatching(/more than one target/),
    });
  });

  it.each([
    ['a dummy', withDummy],
    ['full gear', fullGear],
  ])('rejects truncated codes with %s', (_, build) => {
    const bytes = bytesOf(encodeShareCode(build, current));
    for (let length = 1; length < bytes.length; length++) {
      expect(decode(codeOf(bytes.slice(0, length)))).toHaveProperty('error');
    }
  });

  it('rejects a newer format version and unknown fields', () => {
    const bytes = bytesOf(encodeShareCode(typical, current));
    expect(decode(codeOf([2, ...bytes.slice(1)]))).toEqual({
      error: expect.stringMatching(/newer version/),
    });
    // Field tag 99 with value 1, inserted before the first field.
    expect(decode(codeOf([1, 99, 1, ...bytes.slice(1)]))).toEqual({
      error: expect.stringMatching(/unknown field/),
    });
  });

  it('reads the code from a #b= fragment only', () => {
    expect(shareCodeFromFragment('#b=AQEM')).toBe('AQEM');
    expect(shareCodeFromFragment('#x=AQEM')).toBeNull();
    expect(shareCodeFromFragment('')).toBeNull();
  });

  it('replaces an existing fragment in the link', () => {
    expect(shareLink('https://host/app/#b=old', 'new')).toBe('https://host/app/#b=new');
  });
});

function fail(): never {
  throw new Error('test build needs a monster');
}
