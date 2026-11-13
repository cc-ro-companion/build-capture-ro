import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export type YamlMap = Record<string, unknown>;

export interface RathenaDb {
  header: YamlMap;
  body: YamlMap[];
}

export interface RathenaSource {
  commit: string;
  commitDate: string;
  dirty: boolean;
}

export const PRE_RE_DIR = 'db/pre-re';
const IMPORT_DIR = 'db/import/';
/** Source file holding `enum e_job`, read to check job ids. */
export const JOB_ENUM_FILE = 'src/common/mmo.hpp';
/** Base size table in `db/`; its footer imports the pre-renewal changes. */
export const SIZE_FIX_BASE_FILE = 'db/size_fix.yml';

/**
 * Picks the rAthena checkout: `--rathena <dir>`, else `RATHENA_DIR`, else a
 * sibling `rathena` directory next to this repository.
 */
export function resolveRathenaDir(
  args: readonly string[],
  env: Record<string, string | undefined>,
  repoRoot: string,
): string {
  const flagIndex = args.indexOf('--rathena');
  let chosen: string;
  if (flagIndex !== -1) {
    const value = args[flagIndex + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('--rathena needs a directory argument.');
    }
    chosen = value;
  } else if (env.RATHENA_DIR) {
    chosen = env.RATHENA_DIR;
  } else {
    chosen = path.join(repoRoot, '..', 'rathena');
  }
  const resolved = path.resolve(chosen);
  if (!existsSync(path.join(resolved, PRE_RE_DIR))) {
    throw new Error(
      `No rAthena checkout at ${resolved} (missing ${PRE_RE_DIR}). ` +
        'Pass --rathena <dir> or set RATHENA_DIR.',
    );
  }
  return resolved;
}

function isMap(value: unknown): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keys set to `true` in an rAthena flag map such as `Locations` or `Modes`. */
export function enabledKeys(map: unknown): string[] {
  if (!isMap(map)) return [];
  return Object.entries(map)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key);
}

/**
 * Loads an rAthena YAML db file and the files named in its `Footer.Imports`,
 * recursively, concatenating their bodies in file order. Import paths are
 * relative to the rAthena root, as in rAthena itself. `includeImport` lets a
 * caller skip imports it does not need (e.g. item_db's usable and etc files).
 */
export function loadDb(
  rathenaDir: string,
  relativePath: string,
  includeImport: (importPath: string) => boolean = () => true,
): RathenaDb {
  const filePath = path.join(rathenaDir, relativePath);
  const document: unknown = parse(readFileSync(filePath, 'utf8'));
  if (!isMap(document)) {
    throw new Error(`${relativePath}: expected a YAML map at the top level.`);
  }
  const header = isMap(document.Header) ? document.Header : {};
  const body: YamlMap[] = [];
  if (document.Body !== undefined && document.Body !== null) {
    if (!Array.isArray(document.Body)) {
      throw new Error(`${relativePath}: Body must be a list.`);
    }
    for (const entry of document.Body) {
      if (!isMap(entry)) throw new Error(`${relativePath}: every Body entry must be a map.`);
      body.push(entry);
    }
  }

  const footer = isMap(document.Footer) ? document.Footer : {};
  const imports = Array.isArray(footer.Imports) ? footer.Imports : [];
  for (const importEntry of imports) {
    if (!isMap(importEntry) || typeof importEntry.Path !== 'string') {
      throw new Error(`${relativePath}: every Footer.Imports entry needs a Path.`);
    }
    // rAthena skips imports tagged for the other game mode.
    if (importEntry.Mode !== undefined && importEntry.Mode !== 'Prerenewal') continue;
    // db/import holds a server's local, untracked changes; ccRO differences
    // live in data-overrides/ instead.
    if (importEntry.Path.startsWith(IMPORT_DIR)) continue;
    if (!includeImport(importEntry.Path)) continue;
    body.push(...loadDb(rathenaDir, importEntry.Path, includeImport).body);
  }
  return { header, body };
}

function git(rathenaDir: string, args: string[]): string {
  return execFileSync('git', ['-C', rathenaDir, ...args], { encoding: 'utf8' }).trim();
}

/** Reads the checkout's commit and whether the files the generator reads have local changes. */
export function readRathenaSource(rathenaDir: string): RathenaSource {
  const [commit = '', commitDate = ''] = git(rathenaDir, ['log', '-1', '--format=%H%n%cI']).split(
    '\n',
  );
  const status = git(rathenaDir, [
    'status',
    '--porcelain',
    '--',
    PRE_RE_DIR,
    SIZE_FIX_BASE_FILE,
    JOB_ENUM_FILE,
  ]);
  return { commit, commitDate, dirty: status.length > 0 };
}
