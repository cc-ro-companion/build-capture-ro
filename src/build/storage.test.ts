import { describe, expect, it } from 'vitest';
import { dataMeta } from '../data';
import { rAthenaDefaults } from '../engine/config';
import { defaultBuild, type Build } from './model';
import { gameData } from './resolve';
import type { DataVersion } from './shareCode';
import { loadBuild, saveBuild, STORAGE_KEY } from './storage';

const current: DataVersion = { hash: dataMeta.hash, label: dataMeta.label };
const build: Build = { ...defaultBuild(), job: 1, baseLevel: 50, jobLevel: 30, weapon: 1101 };

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, String(value)),
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error('SecurityError');
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

function load(storage: Storage | null) {
  return loadBuild(gameData, rAthenaDefaults, current, storage);
}

describe('storage', () => {
  it('saves readable JSON with the data version and loads it back', () => {
    const storage = memoryStorage();
    expect(saveBuild(build, current, storage)).toBe(true);
    const json = storage.getItem(STORAGE_KEY) ?? '';
    expect(JSON.parse(json)).toEqual({ ...build, d: current.hash, l: current.label });
    expect(json).toContain('\n  "baseLevel": 50');
    expect(load(storage)).toEqual({ build, warnings: [], dataHint: null });
  });

  it('returns null when nothing is saved', () => {
    expect(load(memoryStorage())).toBeNull();
  });

  it('accepts hand-edited JSON and warns about bad values', () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...build, stats: { ...build.stats, str: 150 }, d: current.hash }),
    );
    const result = load(storage);
    expect(result).toMatchObject({ build: { stats: { str: 99 } } });
    expect(result && 'warnings' in result && result.warnings).toEqual([
      'STR 150 is outside 1–99; set to 99.',
    ]);
  });

  it('shows the data version hint for a build saved with other data', () => {
    const storage = memoryStorage();
    saveBuild(build, { hash: '0badc0de', label: 'old' }, storage);
    const result = load(storage);
    expect(result && 'dataHint' in result && result.dataHint).toMatch(/Made with data old/);
  });

  it('reports invalid JSON as an error', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{oops');
    expect(load(storage)).toEqual({ error: expect.any(String) });
  });

  it('does not throw when storage throws or is missing', () => {
    expect(saveBuild(build, current, throwingStorage())).toBe(false);
    expect(load(throwingStorage())).toBeNull();
    expect(saveBuild(build, current, null)).toBe(false);
    expect(load(null)).toBeNull();
  });
});
