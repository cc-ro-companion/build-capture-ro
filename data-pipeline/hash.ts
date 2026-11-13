import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DATA_HASH_LENGTH = 8;
/** The generated file that holds the version; every other generated file is data. */
export const META_FILE = 'meta.json';

// Line endings are normalised so a CRLF working copy hashes like the LF
// content git stores and CI checks out.
function normalise(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** SHA-256 hex over named texts, independent of the order they are passed in. */
export function hashTexts(texts: Record<string, string>): string {
  const hash = createHash('sha256');
  for (const name of Object.keys(texts).sort()) {
    hash.update(`${name}\0${normalise(texts[name] as string)}\0`);
  }
  return hash.digest('hex');
}

/** Hash of every `.yml` file in the overrides directory. */
export function hashOverrides(overridesDir: string): string {
  const files = readdirSync(overridesDir).filter((name) => name.endsWith('.yml'));
  return hashTexts(
    Object.fromEntries(
      files.map((name) => [name, readFileSync(path.join(overridesDir, name), 'utf8')]),
    ),
  );
}

/** Short data version over the generated files' contents (meta.json excluded). */
export function hashData(files: Record<string, string>): string {
  return hashTexts(files).slice(0, DATA_HASH_LENGTH);
}
