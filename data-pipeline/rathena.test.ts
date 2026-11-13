import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDb, resolveRathenaDir } from './rathena.ts';

const fixtureRathena = path.join(import.meta.dirname, 'fixtures', 'rathena');
const repoRoot = path.resolve(import.meta.dirname, '..');

describe('loadDb', () => {
  it('concatenates bodies of imports in order, recursively, skipping renewal-only imports', () => {
    const db = loadDb(fixtureRathena, 'db/pre-re/main.yml');
    expect(db.header).toEqual({ Type: 'TEST_DB', Version: 1 });
    expect(db.body.map((entry) => entry.Id)).toEqual([1, 2, 3, 4]);
  });

  it('skips imports the caller excludes, including their own imports', () => {
    const db = loadDb(fixtureRathena, 'db/pre-re/main.yml', (importPath) =>
      importPath.endsWith('second.yml'),
    );
    expect(db.body.map((entry) => entry.Id)).toEqual([1, 4]);
  });

  it('returns an empty body for a file without Body', () => {
    expect(loadDb(fixtureRathena, 'db/pre-re/header_only.yml').body).toEqual([]);
  });
});

describe('resolveRathenaDir', () => {
  it('prefers --rathena over RATHENA_DIR', () => {
    const resolved = resolveRathenaDir(
      ['--rathena', fixtureRathena],
      { RATHENA_DIR: path.join(repoRoot, 'missing') },
      repoRoot,
    );
    expect(resolved).toBe(path.resolve(fixtureRathena));
  });

  it('falls back to RATHENA_DIR', () => {
    expect(resolveRathenaDir([], { RATHENA_DIR: fixtureRathena }, repoRoot)).toBe(
      path.resolve(fixtureRathena),
    );
  });

  it('falls back to the sibling rathena directory', () => {
    const fakeRepo = path.join(fixtureRathena, '..', 'repo');
    expect(resolveRathenaDir([], {}, fakeRepo)).toBe(path.resolve(fixtureRathena));
  });

  it('fails with a hint when the directory is not an rAthena checkout', () => {
    expect(() => resolveRathenaDir(['--rathena', repoRoot], {}, repoRoot)).toThrow(
      /--rathena <dir>/,
    );
  });

  it('fails when --rathena has no value', () => {
    expect(() => resolveRathenaDir(['--rathena'], {}, repoRoot)).toThrow(/needs a directory/);
  });
});
