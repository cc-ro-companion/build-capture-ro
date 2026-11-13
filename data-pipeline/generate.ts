import path from 'node:path';
import { loadMeta, loadOverrideFile } from './overrides.ts';
import { readRathenaSource, resolveRathenaDir } from './rathena.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const overridesDir = path.join(repoRoot, 'data-overrides');

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
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
