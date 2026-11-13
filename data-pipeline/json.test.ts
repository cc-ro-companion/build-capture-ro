import { describe, expect, it } from 'vitest';
import { formatJson } from './json.ts';

describe('formatJson', () => {
  it('keeps short flat arrays and objects on one line', () => {
    expect(formatJson({ list: [1, 2], row: { str: 1, agi: 0 }, empty: [] })).toBe(
      '{\n  "list": [1, 2],\n  "row": { "str": 1, "agi": 0 },\n  "empty": []\n}\n',
    );
  });

  it('breaks nested and long values over several lines', () => {
    const long = Array.from({ length: 60 }, (_, index) => index);
    const text = formatJson({ nested: [{ id: 1 }], long });
    expect(text).toContain('"nested": [\n    { "id": 1 }\n  ]');
    expect(text).toContain('"long": [\n    0,\n    1,');
  });

  it('leaves out undefined object values like JSON.stringify, and rejects undefined elsewhere', () => {
    expect(formatJson({ a: 1, b: undefined })).toBe('{ "a": 1 }\n');
    expect(formatJson({ nested: [{ b: undefined }] })).toBe('{\n  "nested": [\n    {}\n  ]\n}\n');
    expect(() => formatJson([1, undefined])).toThrow(/undefined/);
  });

  it('round-trips through JSON.parse, including strings with commas and quotes', () => {
    const value = { names: { '1': 'Sword, "Old",2' }, flags: [true, null, -1.5] };
    expect(JSON.parse(formatJson(value))).toEqual(value);
  });
});
