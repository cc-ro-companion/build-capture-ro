import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DataMeta, NamesFile } from '../src/data/types.ts';
import { hashData, hashOverrides, META_FILE } from './hash.ts';
import { generateItems } from './items.ts';
import { generateJobs } from './jobs.ts';
import { formatJson } from './json.ts';
import { generateMonsters } from './monsters.ts';
import { loadMeta, loadOverrideFile } from './overrides.ts';
import { readRathenaSource, resolveRathenaDir } from './rathena.ts';
import { generateTables } from './tables.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const overridesDir = path.join(repoRoot, 'data-overrides');
const outputDir = path.join(repoRoot, 'src', 'data', 'generated');

function writeOutput(fileName: string, text: string): void {
  writeFileSync(path.join(outputDir, fileName), text);
  console.log(`  wrote src/data/generated/${fileName}`);
}

function main(): void {
  const rathenaDir = resolveRathenaDir(process.argv.slice(2), process.env, repoRoot);
  const source = readRathenaSource(rathenaDir);
  console.log(`rAthena: ${rathenaDir}`);
  console.log(`  commit ${source.commit} (${source.commitDate})`);
  if (source.dirty) {
    console.warn('  warning: db/pre-re has uncommitted changes; the output records rathenaDirty.');
  }

  const meta = loadMeta(path.join(overridesDir, 'meta.yml'));
  const overrides = {
    jobs: loadOverrideFile(path.join(overridesDir, 'jobs.yml')),
    items: loadOverrideFile(path.join(overridesDir, 'items.yml')),
    monsters: loadOverrideFile(path.join(overridesDir, 'monsters.yml')),
  };
  console.log(`Data label: ${meta.label}`);
  for (const file of Object.values(overrides)) {
    console.log(`  ${file.name}: ${file.body.length} patched, ${file.remove.length} removed`);
  }

  const jobs = generateJobs(rathenaDir, overrides.jobs);
  console.log(`Jobs: ${jobs.data.jobs.length}`);
  const items = generateItems(rathenaDir, overrides.items);
  console.log(`Equipment: ${items.data.length}`);
  const monsters = generateMonsters(rathenaDir, overrides.monsters);
  console.log(`Monsters: ${monsters.data.length}`);
  const tables = generateTables(rathenaDir);
  const names: NamesFile = { items: items.names, monsters: monsters.names, jobs: jobs.names };

  const dataFiles: Record<string, string> = {
    'jobs.json': formatJson(jobs.data),
    'items.json': formatJson(items.data),
    'monsters.json': formatJson(monsters.data),
    'tables.json': formatJson(tables),
    'names.en.json': formatJson(names),
  };
  const dataMeta: DataMeta = {
    label: meta.label,
    hash: hashData(dataFiles),
    rathenaCommit: source.commit,
    rathenaCommitDate: source.commitDate,
    rathenaDirty: source.dirty,
    overridesHash: hashOverrides(overridesDir),
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(outputDir, { recursive: true });
  for (const [fileName, text] of Object.entries(dataFiles)) writeOutput(fileName, text);
  writeOutput(META_FILE, formatJson(dataMeta));
  console.log(`Data version: ${dataMeta.label} (${dataMeta.hash})`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
