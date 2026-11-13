// The current build in localStorage, as readable JSON so users can inspect,
// edit or generate it with their own tools. Storage can be missing or throw
// (private mode, blocked site data); the app then simply does not persist.
import type { EngineConfig } from '../engine/config';
import type { Build } from './model';
import type { GameData } from './resolve';
import { restoreBuild, type DataVersion, type RestoreResult } from './shareCode';

export const STORAGE_KEY = 'ccro-build-planner:current';
/** Where a saved build that could not be read is kept before autosave replaces it. */
export const UNREADABLE_KEY = 'ccro-build-planner:unreadable';

/** What is stored: the build plus the data version it was saved with. */
export interface StoredBuild extends Build {
  /** Data hash. */
  d: string;
  /** Data label. */
  l: string;
}

/** The browser's localStorage, or null where accessing it throws. */
export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function storedBuildJson(build: Build, version: DataVersion): string {
  const stored: StoredBuild = { ...build, d: version.hash, l: version.label };
  return JSON.stringify(stored, null, 2);
}

/** Saves the build; returns false when storage is unavailable. */
export function saveBuild(
  build: Build,
  version: DataVersion,
  storage: Storage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, storedBuildJson(build, version));
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses readable build JSON (as stored, or edited by hand). A missing
 * `d`/`l` counts as unknown data, which shows the data version hint.
 */
export function parseBuildJson(
  json: string,
  data: GameData,
  config: EngineConfig,
  current: DataVersion,
): RestoreResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: 'The saved build is not valid JSON.' };
  }
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const made: DataVersion = {
    hash: typeof record.d === 'string' ? record.d : 'unknown',
    label: typeof record.l === 'string' ? record.l : 'unknown',
  };
  return restoreBuild(raw, made, data, config, current);
}

/** The saved build, or null when nothing is saved or storage is unavailable. */
export function loadBuild(
  data: GameData,
  config: EngineConfig,
  current: DataVersion,
  storage: Storage | null = browserStorage(),
): RestoreResult | null {
  if (!storage) return null;
  let json: string | null;
  try {
    json = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return json === null ? null : parseBuildJson(json, data, config, current);
}

/**
 * Copies the saved build to UNREADABLE_KEY, so autosave does not destroy a
 * build that a newer planner made or that was edited by hand and broken.
 * Returns false when storage is unavailable or the copy fails.
 */
export function keepUnreadableBuild(storage: Storage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    const json = storage.getItem(STORAGE_KEY);
    if (json === null) return false;
    storage.setItem(UNREADABLE_KEY, json);
    return true;
  } catch {
    return false;
  }
}
