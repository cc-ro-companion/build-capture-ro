import { describe, expect, it } from 'vitest';
import { items } from '../data';
import type { ScriptStmt } from '../data/types';
import {
  BONUS_LABELS,
  BonusSet,
  COMPUTED_BONUSES,
  notModelledLabels,
  type SourcedBonusCall,
} from './bonuses';

const RC_DEMIHUMAN = 7;
const RC_UNDEAD = 1;

function call(
  name: string,
  args: (number | string)[],
  source: SourcedBonusCall['source'] = 'none',
): SourcedBonusCall {
  return { name, args, itemId: 1, source };
}

const set = new BonusSet([
  call('bStr', [2]),
  call('bStr', [3]),
  call('bAddRace', [RC_DEMIHUMAN, 10]),
  call('bAddRace', [RC_DEMIHUMAN, 5], 'shield'),
  call('bAddRace', [RC_DEMIHUMAN, 7], 'leftWeapon'),
  call('bAddRace', [RC_UNDEAD, 20]),
  call('bAddEle', [3, 10, 1]),
  call('bAtkEle', [3]),
  call('bAtkEle', [4]),
  call('bPerfectHitRate', [20]),
  call('bPerfectHitRate', [5]),
  call('bNoSizeFix', []),
  call('bIgnoreDefRace', [RC_DEMIHUMAN]),
]);

describe('BonusSet', () => {
  it('sums values by name and key', () => {
    expect(set.sum('bStr')).toBe(5);
    expect(set.sum('bAddRace', [RC_DEMIHUMAN])).toBe(22);
    expect(set.sum('bAddRace', [RC_UNDEAD])).toBe(20);
    expect(set.sum('bAgi')).toBe(0);
  });

  it('filters by source, like rAthena routes weapon bonuses by lr_flag', () => {
    expect(set.sum('bAddRace', [RC_DEMIHUMAN], ['none', 'shield'])).toBe(15);
    expect(set.sum('bAddRace', [RC_DEMIHUMAN], ['leftWeapon'])).toBe(7);
  });

  it('does not mix arities: bonus3 bAddEle is not bonus2 bAddEle', () => {
    expect(set.sum('bAddEle', [3])).toBe(0);
    expect(set.sum('bAddEle', [3, 10])).toBe(1);
  });

  it('keeps the highest or the last value where rAthena does', () => {
    expect(set.max('bPerfectHitRate')).toBe(20);
    expect(set.last('bAtkEle')).toBe(4);
    expect(set.last('bAtkEle', [], ['shield'])).toBeUndefined();
  });

  it('finds flag and bitmask bonuses', () => {
    expect(set.has('bNoSizeFix')).toBe(true);
    expect(set.has('bIgnoreDefRace', [RC_DEMIHUMAN])).toBe(true);
    expect(set.has('bIgnoreDefRace', [RC_UNDEAD])).toBe(false);
  });
});

describe('notModelledLabels', () => {
  it('lists each uncomputed bonus once, by label, including a computed name at another arity', () => {
    expect(
      notModelledLabels([
        { name: 'bStr', args: [1] },
        { name: 'bSubRace', args: [7, 10] },
        { name: 'bSubRace', args: [1, 10] },
        { name: 'bAddEle', args: [3, 10, 1] },
        { name: 'bSomethingNew', args: [] },
      ]),
    ).toEqual(['damage reduction from a race', 'damage against an element', 'bSomethingNew']);
  });

  it('leaves bAtkRate out of the computed list (renewal only)', () => {
    expect(COMPUTED_BONUSES.has('bAtkRate/1')).toBe(false);
  });
});

describe('labels for shipped data', () => {
  function names(statements: readonly ScriptStmt[], into: Set<string>): void {
    for (const statement of statements) {
      if (statement.k === 'bonus') into.add(statement.name);
      if (statement.k === 'if') {
        names(statement.then, into);
        names(statement.else, into);
      }
    }
  }

  it('has a plain-word label for every bonus a shipped item uses', () => {
    const used = new Set<string>();
    for (const item of items) names(item.effects ?? [], used);
    expect([...used].filter((name) => BONUS_LABELS[name] === undefined)).toEqual([]);
  });

  it('labels every computed bonus', () => {
    const computed = [...COMPUTED_BONUSES].map((key) => key.split('/')[0] as string);
    expect(computed.filter((name) => BONUS_LABELS[name] === undefined)).toEqual([]);
  });
});
