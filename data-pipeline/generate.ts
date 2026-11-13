import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DataMeta, NamesFile } from '../src/data/types.ts';
import { COVERAGE_FILE, coverageReport } from './coverage.ts';
import { hashData, hashOverrides, hashTexts, META_FILE } from './hash.ts';
import { loadHiddenItems } from './hiddenItems.ts';
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
  const hidden = loadHiddenItems(path.join(overridesDir, 'hidden-items.yml'));
  const items = generateItems(rathenaDir, overrides.items, hidden);
  console.log(`Equipment: ${items.data.length} (${hidden.size} hidden)`);
  const monsters = generateMonsters(rathenaDir, overrides.monsters);
  console.log(`Monsters: ${monsters.data.length}`);
  const tables = generateTables(rathenaDir);
  const coverage = coverageReport(items.data, items.names, items.scripts);
  const scripted = items.data.filter((item) => (items.scripts.get(item.id) ?? '').trim() !== '');
  const parsed = scripted.filter((item) => item.effects !== null).length;
  console.log(`Scripts: ${parsed} of ${scripted.length} parsed`);
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
    coverageHash: hashTexts({ [COVERAGE_FILE]: coverage }),
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(outputDir, { recursive: true });
  // A leftover file from a renamed output would break the data hash test.
  for (const fileName of readdirSync(outputDir)) {
    if (fileName.endsWith('.json') && fileName !== META_FILE && !(fileName in dataFiles)) {
      rmSync(path.join(outputDir, fileName));
      console.log(`  removed stale src/data/generated/${fileName}`);
    }
  }
  for (const [fileName, text] of Object.entries(dataFiles)) writeOutput(fileName, text);
  writeOutput(META_FILE, formatJson(dataMeta));
  writeFileSync(path.join(repoRoot, COVERAGE_FILE), coverage);
  console.log(`  wrote ${COVERAGE_FILE}`);
  console.log(`Data version: ${dataMeta.label} (${dataMeta.hash})`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
