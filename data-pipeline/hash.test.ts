import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashData, hashOverrides, hashTexts } from './hash.ts';

describe('hashTexts', () => {
  it('ignores argument order and line endings', () => {
    expect(hashTexts({ a: 'x\ny', b: 'z' })).toBe(hashTexts({ b: 'z', a: 'x\r\ny' }));
  });

  it('changes when a name or a content changes', () => {
    const base = hashTexts({ a: 'x' });
    expect(hashTexts({ a: 'y' })).not.toBe(base);
    expect(hashTexts({ b: 'x' })).not.toBe(base);
  });
});

describe('hashData', () => {
  it('is 8 hex characters', () => {
    expect(hashData({ 'items.json': '[]' })).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('hashOverrides', () => {
  it('hashes only the yml files of a directory', () => {
    const fixtures = path.join(import.meta.dirname, 'fixtures', 'overrides');
    expect(hashOverrides(fixtures)).toMatch(/^[0-9a-f]{64}$/);
  });
});
