import { describe, expect, it } from 'vitest';
import type { Item } from '../src/data/types.ts';
import { bonusUsage, coverageReport } from './coverage.ts';

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
  item(3, null, { unsupported: 'command "skill"' }),
  item(4, null, { unsupported: 'command "skill"', hidden: true }),
  item(5, []),
];
const scripts = new Map([
  [1, 'bonus bStr;'],
  [2, 'bonus bStr;'],
  [3, 'skill "TF_DOUBLE",5;'],
  [4, 'bonus bStr,1;\nskill "A|B",1;'],
  [5, ''],
]);

describe('bonusUsage', () => {
  it('counts items per bonus name, including if branches, once per item', () => {
    expect(bonusUsage(items)).toEqual([
      ['bStr', 2],
      ['bAgi', 1],
    ]);
  });
});

describe('coverageReport', () => {
  const report = coverageReport(items, { 3: 'Nagan' }, scripts);

  it('counts only items with a script, also for the not-hidden subset', () => {
    expect(report).toContain('| All | 4 | 2 | 2 | 50.0 % |');
    expect(report).toContain('| Not hidden | 3 | 2 | 1 | 66.7 % |');
  });

  it('lists unsupported items by reason with the offending statement', () => {
    expect(report).toContain('| command "skill" | 2 |');
    expect(report).toContain('| 3 | Nagan |  | `skill "TF_DOUBLE",5;` |');
    // The table cell escapes the pipe inside the statement.
    expect(report).toContain(
      String.raw`| 4 | Item_4 | yes | 'skill "A\|B",1;' |`.replace(/'/g, '`'),
    );
  });

  it('ends with the bonus usage table', () => {
    expect(report).toContain('| `bStr` | 2 |');
  });
});
