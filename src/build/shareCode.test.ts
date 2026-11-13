import { describe, expect, it } from 'vitest';
import { dataMeta } from '../data';
import { rAthenaDefaults } from '../engine/config';
import { defaultBuild, type Build } from './model';
import { gameData } from './resolve';
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
  weapon: 1250,
  monster: 1002,
};

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

  it('round-trips bare hands and no target', () => {
    const build = { ...typical, weapon: null, monster: null };
    expect(decode(encodeShareCode(build, current))).toMatchObject({ build });
  });

  it('is url-safe and keeps a typical link under 200 characters', () => {
    const code = encodeShareCode(typical, current);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const link = shareLink('https://cc-ro-companion.github.io/build-capture-ro/', code);
    expect(link.length).toBeLessThan(200);
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
    const code = encodeShareCode({ ...typical, weapon: 99999, baseLevel: 200 }, current);
    const result = decode(code);
    expect(result).toMatchObject({ build: { weapon: null, baseLevel: 99 } });
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
