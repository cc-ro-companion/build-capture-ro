import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

function writeOutput(fileName: string, value: unknown): void {
  writeFileSync(path.join(outputDir, fileName), formatJson(value));
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

  mkdirSync(outputDir, { recursive: true });
  writeOutput('jobs.json', jobs.data);
  writeOutput('items.json', items.data);
  writeOutput('monsters.json', monsters.data);
  writeOutput('tables.json', tables);
  writeOutput('names.en.json', {
    items: items.names,
    monsters: monsters.names,
    jobs: jobs.names,
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
