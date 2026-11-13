import path from 'node:path';
import { readRathenaSource, resolveRathenaDir } from './rathena.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

function main(): void {
  const rathenaDir = resolveRathenaDir(process.argv.slice(2), process.env, repoRoot);
  const source = readRathenaSource(rathenaDir);
  console.log(`rAthena: ${rathenaDir}`);
  console.log(`  commit ${source.commit} (${source.commitDate})`);
  if (source.dirty) {
    console.warn('  warning: db/pre-re has uncommitted changes; the output records rathenaDirty.');
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
