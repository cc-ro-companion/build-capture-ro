// Typed access to the generated game data. The JSON is written by
// `pnpm data`; never edit it by hand.
import itemsJson from './generated/items.json';
import jobsJson from './generated/jobs.json';
import metaJson from './generated/meta.json';
import monstersJson from './generated/monsters.json';
import namesJson from './generated/names.en.json';
import runesJson from './generated/runes.json';
import tablesJson from './generated/tables.json';
import type { DataMeta, Item, JobsFile, Monster, NamesFile, Rune, TablesFile } from './types';

export type * from './types';

// TypeScript infers per-record literal shapes from the JSON (e.g. a job's
// `baseAspd` lacking `Dagger`) that do not compare to the index signatures in
// types.ts, so the data goes through `unknown`. The generator writes these
// shapes from the same types, and data.test.ts checks the content.
export const dataMeta: DataMeta = metaJson;
export const jobsData = jobsJson as unknown as JobsFile;
export const items = itemsJson as unknown as Item[];
export const monsters = monstersJson as unknown as Monster[];
export const runes = runesJson as unknown as Rune[];
export const tables = tablesJson as unknown as TablesFile;
export const namesEn: NamesFile = namesJson;
