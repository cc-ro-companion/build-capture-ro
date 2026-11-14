import { describe, expect, it } from 'vitest';
import type { Item } from '../src/data/types.ts';
import { applyComboOverrides, convertCombos, parseComboOverrides } from './combos.ts';

function equipment(id: number, aegisName: string): Item {
  return {
    id,
    aegisName,
    type: 'armor',
    attack: 0,
    defense: 0,
    range: 0,
    slots: 0,
    equipLevelMin: 0,
    equipLevelMax: 0,
    refineable: true,
    locations: ['Head_Top'],
    jobs: [1],
    effects: [],
  };
}

const EQUIPMENT = [
  equipment(1101, 'Sword'),
  equipment(2101, 'Guard'),
  equipment(2301, 'Cotton_Shirt'),
];

const RECORDS = [
  {
    Combos: [{ Combo: ['Guard', 'Sword'] }, { Combo: ['cotton_shirt', 'Sword'] }],
    Script: 'bonus bStr,1;',
  },
  // A card makes the combination impossible on ccRO.
  { Combos: [{ Combo: ['Sword', 'Poring_Card'] }], Script: 'bonus bLuk,1;' },
  { Combos: [{ Combo: ['Sword', 'Guard'] }], Script: 'bonus bAgi,2;' },
  { Combos: [{ Combo: ['Guard', 'Cotton_Shirt'] }], Script: 'getitem 501,1;' },
];

const str1 = { k: 'bonus', name: 'bStr', args: [{ k: 'num', v: 1 }] };
const agi2 = { k: 'bonus', name: 'bAgi', args: [{ k: 'num', v: 2 }] };

describe('convertCombos', () => {
  const { combos, stats } = convertCombos(RECORDS, EQUIPMENT);

  it('makes one combo per combination, items as sorted ids, cards dropped', () => {
    expect([...combos.values()].map((combo) => combo.items)).toEqual([
      [1101, 2101],
      [1101, 2301],
      [2101, 2301],
    ]);
    expect(stats).toEqual({ kept: 3, dropped: 1 });
  });

  it('lets a later record for the same items replace the script, as rAthena does', () => {
    expect(combos.get('1101,2101')?.effects).toEqual([agi2]);
    expect(combos.get('1101,2301')?.effects).toEqual([str1]);
  });

  it('keeps an unparsed script as effects null with the reason', () => {
    expect(combos.get('2101,2301')).toEqual({
      items: [2101, 2301],
      effects: null,
      unsupported: 'command "getitem"',
    });
  });

  it('rejects records it cannot read', () => {
    expect(() => convertCombos([{ Combos: 'x' }], EQUIPMENT)).toThrow('Combos must be a list.');
    expect(() => convertCombos([{ Clear: true, Combos: [] }], EQUIPMENT)).toThrow(
      'Clear is not supported.',
    );
  });
});

describe('combo overrides', () => {
  const base = () => convertCombos(RECORDS, EQUIPMENT).combos;

  it('replaces, adds and removes by item id list in any order', () => {
    const overrides = parseComboOverrides(
      [
        'Body:',
        '  - Items: [2101, 1101]',
        '    Script: bonus bStr,1;',
        '  - Items: [2301, 1101, 2101]',
        '    Script: bonus bAgi,2;',
        'Remove:',
        '  - [2301, 1101]',
      ].join('\n'),
      'combos.yml',
    );
    expect(applyComboOverrides(base(), overrides, EQUIPMENT)).toEqual([
      { items: [1101, 2101], effects: [str1] },
      { items: [1101, 2101, 2301], effects: [agi2] },
      { items: [2101, 2301], effects: null, unsupported: 'command "getitem"' },
    ]);
  });

  it('treats an empty file as no changes', () => {
    const overrides = parseComboOverrides('Body: []\nRemove: []\n', 'combos.yml');
    expect(applyComboOverrides(base(), overrides, EQUIPMENT)).toHaveLength(3);
  });

  it.each([
    ['Body:\n  - Items: [1101]\n    Script: ""', 'Body[0]: Items: needs a list of at least two'],
    ['Body:\n  - Items: [1101, 2101]', 'Body[0]: Script must be a string.'],
    ['Body:\n  - { Items: [1101, 2101], Script: "", Name: x }', 'unknown field "Name"'],
    ['Combos: []', 'unknown top-level key "Combos"'],
  ])('rejects %j', (text, message) => {
    expect(() => parseComboOverrides(text, 'combos.yml')).toThrow(message);
  });

  it('rejects unknown equipment and removing a combo that does not exist', () => {
    const unknownItem = parseComboOverrides(
      'Body:\n  - { Items: [1101, 9999], Script: "" }',
      'combos.yml',
    );
    expect(() => applyComboOverrides(base(), unknownItem, EQUIPMENT)).toThrow(
      'combos.yml: combo 1101,9999: no such equipment: 9999.',
    );
    const missing = parseComboOverrides('Remove:\n  - [2101, 2301, 1101]', 'combos.yml');
    expect(() => applyComboOverrides(base(), missing, EQUIPMENT)).toThrow(
      'combos.yml: Remove: no combo of items 1101,2101,2301.',
    );
  });
});
