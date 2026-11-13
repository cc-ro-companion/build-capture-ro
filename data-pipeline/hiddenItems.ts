import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { OverrideError } from './overrides.ts';

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses `hidden-items.yml`: a map of review groups, each a list of
 * `{ id, hide, ... }` entries. Returns the ids with `hide: true`. Other keys
 * (`name`, `from`, `reason`) are review notes and are not read.
 */
export function parseHiddenItems(text: string, name: string): Set<number> {
  const document: unknown = parse(text) ?? {};
  if (!isMap(document)) throw new OverrideError(`${name}: expected a map of groups.`);
  const hidden = new Set<number>();
  for (const [group, entries] of Object.entries(document)) {
    if (!Array.isArray(entries)) throw new OverrideError(`${name}: ${group} must be a list.`);
    for (const entry of entries) {
      if (!isMap(entry) || typeof entry.id !== 'number') {
        throw new OverrideError(`${name}: ${group}: every entry needs a numeric id.`);
      }
      if (entry.hide !== undefined && typeof entry.hide !== 'boolean') {
        throw new OverrideError(`${name}: ${group}: id ${entry.id}: hide must be true or false.`);
      }
      if (entry.hide === true) hidden.add(entry.id);
    }
  }
  return hidden;
}

export function loadHiddenItems(filePath: string): Set<number> {
  return parseHiddenItems(readFileSync(filePath, 'utf8'), path.basename(filePath));
}
