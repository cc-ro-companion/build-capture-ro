import { describe, expect, it } from 'vitest';
import type { Item } from '../src/data/types.ts';
import { bonusUsage, commandUsage, coverageReport } from './coverage.ts';

function item(id: number, effects: Item['effects'], extra: Partial<Item> = {}): Item {
  return {
    id,
    aegisName: `Item_${id}`,
    type: 'armor',
    attack: 0,
    defense: 0,
    range: 0,
    slots: 0,
    equipLevelMin: 0,
    equipLevelMax: 0,
    refineable: false,
    locations: ['Armor'],
    jobs: [0],
    effects,
    ...extra,
  };
}

const str = { k: 'bonus' as const, name: 'bStr', args: [] };
const items = [
  item(1, [
    str,
    { k: 'if', cond: { k: 'num', v: 1 }, then: [str], else: [{ ...str, name: 'bAgi' }] },
  ]),
  item(2, [str]),
  item(3, null, { unsupported: 'command "callfunc"' }),
  item(4, null, { unsupported: 'command "callfunc"', hidden: true }),
  item(5, []),
  item(6, [
    { k: 'skill', skill: { k: 'str', v: 'TF_DOUBLE' }, level: { k: 'num', v: 5 } },
    {
      k: 'if',
      cond: { k: 'num', v: 1 },
      then: [
        {
          k: 'autobonus',
          command: 'autobonus',
          bonus: [str],
          rate: { k: 'num', v: 10 },
          duration: { k: 'num', v: 1000 },
        },
      ],
      else: [],
    },
  ]),
];
const scripts = new Map([
  [1, 'bonus bStr;'],
  [2, 'bonus bStr;'],
  [3, 'callfunc "F_X";'],
  [4, 'bonus bStr,1;\ncallfunc "A|B";'],
  [5, ''],
  [6, 'skill "TF_DOUBLE",5; if (1) autobonus "{ bonus bStr; }",10,1000;'],
]);

describe('bonusUsage', () => {
  it('counts items per bonus name, including if branches, once per item', () => {
    expect(bonusUsage(items)).toEqual([
      ['bStr/0', 2],
      ['bAgi/0', 1],
    ]);
  });
});

describe('coverageReport', () => {
  const report = coverageReport(items, { 3: 'Nagan' }, scripts);

  it('counts only items with a script, also for the not-hidden subset', () => {
    expect(report).toContain('| All | 5 | 3 | 2 | 60.0 % |');
    expect(report).toContain('| Not hidden | 4 | 3 | 1 | 75.0 % |');
  });

  it('lists unsupported items by reason with the offending statement', () => {
    expect(report).toContain('| command "callfunc" | 2 |');
    expect(report).toContain('| 3 | Nagan |  | `callfunc "F_X";` |');
    // The table cell escapes the pipe inside the statement.
    expect(report).toContain(
      String.raw`| 4 | Item_4 | yes | 'callfunc "A\|B";' |`.replace(/'/g, '`'),
    );
  });

  it('ends with the bonus usage table, marking computed bonuses by arity', () => {
    // bonus bStr; without a value is not the computed bStr/1.
    expect(report).toContain('| `bStr` | 0 | 2 |  |');
    expect(report).toContain('0 of 2 bonuses are computed; 2 are stored only.');
  });

  it('counts stored-only commands per item, including if branches', () => {
    expect(commandUsage(items)).toEqual([
      ['autobonus', 1],
      ['skill', 1],
    ]);
    expect(report).toContain('## Commands stored only');
    expect(report).toContain('| `skill` | 1 |');
    expect(report).toContain('| `autobonus` | 1 |');
  });
});
