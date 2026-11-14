import { describe, expect, it } from 'vitest';
import { parseRunes } from './runes.ts';

const yaml = (...lines: string[]) => lines.join('\n');

const TWO_RUNES = yaml(
  'Runes:',
  '  - Id: 39105',
  '    Name: Assaulter Rune',
  '    Location: Weapon',
  '    Reviewed: true',
  '    Script: |',
  '      bonus bCritAtkRate,10;',
  '    Sets:',
  '      - Requires: [39101]',
  '        Script: |',
  '          bonus bStr,10;',
  '    Album:',
  "      - Requires: ['Mobster Card']",
  '        RightHandOnly: true',
  "        Note: 'except with Bowling Bash'",
  '        Script: |',
  '          bonus bCritical,3;',
  '  - Id: 39101',
  '    Name: Anacondaq Rune',
  '    Location: Footgear',
  '    Reviewed: false',
  '    Script: |',
  '      bonus2 bAddEle,Ele_Poison,20;',
  "      # TODO: Add a 5% chance of gaining 'Red Potion' item each time a monster is killed",
);

describe('parseRunes', () => {
  it('converts runes, sorted by id, with names apart', () => {
    const { data, names } = parseRunes(TWO_RUNES, 'runes.yml');
    expect(names).toEqual({ 39101: 'Anacondaq Rune', 39105: 'Assaulter Rune' });
    expect(data.map((rune) => rune.id)).toEqual([39101, 39105]);
    expect(data[1]).toEqual({
      id: 39105,
      location: 'Weapon',
      effects: [{ k: 'bonus', name: 'bCritAtkRate', args: [{ k: 'num', v: 10 }] }],
      sets: [
        { requires: [39101], effects: [{ k: 'bonus', name: 'bStr', args: [{ k: 'num', v: 10 }] }] },
      ],
      album: [
        {
          requires: ['Mobster Card'],
          rightHandOnly: true,
          note: 'except with Bowling Bash',
          effects: [{ k: 'bonus', name: 'bCritical', args: [{ k: 'num', v: 3 }] }],
        },
      ],
      reviewed: true,
    });
  });

  it('drops TODO lines from a draft and keeps the mapped part', () => {
    const anacondaq = parseRunes(TWO_RUNES, 'runes.yml').data[0]!;
    expect(anacondaq.reviewed).toBe(false);
    expect(anacondaq.effects).toEqual([
      {
        k: 'bonus',
        name: 'bAddEle',
        args: [
          { k: 'const', name: 'ELE_POISON', v: 5 },
          { k: 'num', v: 20 },
        ],
      },
    ]);
  });

  it('rejects a reviewed rune that still has a TODO, in any script', () => {
    const reviewedDraft = TWO_RUNES.replace('Reviewed: false', 'Reviewed: true');
    expect(() => parseRunes(reviewedDraft, 'runes.yml')).toThrow(
      'runes.yml: rune 39101: Script: Reviewed rune still has "# TODO: Add a 5% chance',
    );
    const todoInSet = TWO_RUNES.replace('bonus bStr,10;', '# TODO: STR + 10');
    expect(() => parseRunes(todoInSet, 'runes.yml')).toThrow(
      'runes.yml: rune 39105: Sets[0]: Reviewed rune still has "# TODO: STR + 10".',
    );
  });

  it('accepts empty scripts and leaves out missing Sets and Album', () => {
    const text = yaml(
      'Runes:',
      '  - { Id: 39200, Name: Empty Rune, Location: Armor, Reviewed: true, Script: "" }',
    );
    expect(parseRunes(text, 'r.yml').data).toEqual([
      { id: 39200, location: 'Armor', effects: [], sets: [], album: [], reviewed: true },
    ]);
  });

  it('rejects a script outside the parsed subset', () => {
    const text = TWO_RUNES.replace('bonus bCritAtkRate,10;', 'getitem 501,1;');
    expect(() => parseRunes(text, 'runes.yml')).toThrow(
      'runes.yml: rune 39105: Script: script not parsed (command "getitem"): getitem 501,1;',
    );
  });

  it.each([
    ['Id: 39105', 'Id: 501', 'rune Id 501 is not a client rune id (39000-39999).'],
    ['Location: Weapon', 'Location: Shoes', 'rune 39105: Location must be one of'],
    ['Reviewed: true', 'Reviewed: yes please', 'rune 39105: Reviewed must be true or false.'],
    ['Requires: [39101]', 'Requires: [39999]', 'rune 39105: set needs unknown rune 39999.'],
    ['Requires: [39101]', 'Requires: [39105]', 'rune 39105: a set must not list its own rune.'],
    ['Requires: [39101]', 'Requires: []', 'rune 39105: Sets[0]: Requires must list rune ids.'],
    ["Requires: ['Mobster Card']", 'Requires: [1]', 'Album[0]: Requires must list card names.'],
    ['Id: 39101', 'Id: 39105', 'rune 39105 is listed twice.'],
  ])('rejects %s → %s', (from, to, message) => {
    expect(() => parseRunes(TWO_RUNES.replace(from, to), 'runes.yml')).toThrow(message);
  });
});

describe('parseRunes: empty set Requires', () => {
  const withEmptySet = (reviewed: boolean) =>
    yaml(
      'Runes:',
      '  - Id: 39200',
      '    Name: Draft Rune',
      '    Location: Armor',
      `    Reviewed: ${reviewed}`,
      '    Sets:',
      '      - Requires: []',
      '        Script: |',
      '          # TODO: STR + 1',
    );

  it('accepts it in a draft and rejects it once reviewed', () => {
    expect(parseRunes(withEmptySet(false), 'r.yml').data[0]!.sets).toEqual([
      { requires: [], effects: [] },
    ]);
    expect(() => parseRunes(withEmptySet(true), 'r.yml')).toThrow('Requires must list rune ids.');
  });
});

describe('parseRunes: Unmodelled', () => {
  const text = yaml(
    'Runes:',
    '  - Id: 39200',
    '    Name: Text Rune',
    '    Location: Weapon',
    '    Reviewed: true',
    "    Script: ''",
    '    Unmodelled:',
    "      - '-50 SP when unequipped'",
    '    Sets:',
    '      - Requires: [39101]',
    "        Script: ''",
    '        Unmodelled: [Disables an autocast]',
    '    Album:',
    "      - Requires: ['Snake Card']",
    "        Script: ''",
    '        Unmodelled: [Poison ticks faster]',
    '  - { Id: 39101, Name: Other Rune, Location: Weapon, Reviewed: true }',
  );

  it('keeps the texts per rune, set and album entry', () => {
    const rune = parseRunes(text, 'r.yml').data[1]!;
    expect(rune.unmodelled).toEqual(['-50 SP when unequipped']);
    expect(rune.sets[0]!.unmodelled).toEqual(['Disables an autocast']);
    expect(rune.album[0]!.unmodelled).toEqual(['Poison ticks faster']);
    expect('unmodelled' in parseRunes(text, 'r.yml').data[0]!).toBe(false);
  });

  it('rejects anything but a list of texts', () => {
    expect(() => parseRunes(text.replace('[Disables an autocast]', '[3]'), 'r.yml')).toThrow(
      'rune 39200: Sets[0]: Unmodelled must list texts.',
    );
  });
});
