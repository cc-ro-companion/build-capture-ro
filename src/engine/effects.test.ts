import { describe, expect, it } from 'vitest';
import { items } from '../data';
import type { ScriptExpr, ScriptStmt } from '../data/types';
import { baseClassOf, evaluateEffects, mapIdOf, type EffectContext } from './effects';
import { stats } from './testData';

const num = (v: number): ScriptExpr => ({ k: 'num', v });
const str = (v: string): ScriptExpr => ({ k: 'str', v });
const op = (operator: string, ...args: ScriptExpr[]): ScriptExpr => ({
  k: 'op',
  op: operator,
  args,
});
const call = (fn: Extract<ScriptExpr, { k: 'call' }>['fn'], ...args: ScriptExpr[]): ScriptExpr => ({
  k: 'call',
  fn,
  args,
});
const ref = (name: Extract<ScriptExpr, { k: 'ref' }>['name']): ScriptExpr => ({ k: 'ref', name });
const bonus = (name: string, ...args: ScriptExpr[]): ScriptStmt => ({ k: 'bonus', name, args });

const KNIGHT = 7;

function context(partial: Partial<EffectContext> = {}): EffectContext {
  return {
    refine: 7,
    baseStats: stats({ str: 80, agi: 50 }),
    baseLevel: 90,
    jobLevel: 45,
    jobId: KNIGHT,
    skillLevel: () => 0,
    ...partial,
  };
}

/** Value of `bonus bStr,<expression>;`. */
function value(expression: ScriptExpr, partial: Partial<EffectContext> = {}) {
  return evaluateEffects([bonus('bStr', expression)], context(partial)).calls[0]?.args[0];
}

describe('evaluateEffects', () => {
  it('collects bonus calls in order with their values; a flag bonus has none', () => {
    const result = evaluateEffects(
      [bonus('bStr', num(1)), bonus('bUnbreakableWeapon'), bonus('bSkillAtk', str('A'), num(5))],
      context(),
    );
    expect(result).toEqual({
      calls: [
        { name: 'bStr', args: [1] },
        { name: 'bUnbreakableWeapon', args: [] },
        { name: 'bSkillAtk', args: ['A', 5] },
      ],
      skills: [],
      autoBonuses: [],
    });
  });

  it('collects granted skills and autobonuses with evaluated values, inside taken branches only', () => {
    const inner = [bonus('bBaseAtk', num(50))];
    const result = evaluateEffects(
      [
        { k: 'skill', skill: str('MG_COLDBOLT'), level: op('+', num(1), num(2)) },
        {
          k: 'if',
          cond: op('>=', call('getrefine'), num(7)),
          then: [
            {
              k: 'autobonus',
              command: 'autobonus',
              bonus: inner,
              rate: op('*', call('getrefine'), num(2)),
              duration: num(5000),
              flag: num(1),
            },
          ],
          else: [{ k: 'skill', skill: num(5), level: num(1) }],
        },
        {
          k: 'autobonus',
          command: 'autobonus3',
          bonus: [],
          rate: num(100),
          duration: num(3000),
          skill: str('AL_HEAL'),
        },
      ],
      context({ refine: 7 }),
    );
    expect(result.skills).toEqual([{ skill: 'MG_COLDBOLT', level: 3 }]);
    expect(result.autoBonuses).toEqual([
      { command: 'autobonus', bonus: inner, rate: 14, duration: 5000, flag: 1 },
      { command: 'autobonus3', bonus: [], rate: 100, duration: 3000, flag: 0, skill: 'AL_HEAL' },
    ]);
    // The bonus script runs only when the autobonus triggers, so it adds no calls now.
    expect(result.calls).toEqual([]);
  });

  it('does integer arithmetic like op_2num: division and modulo truncate toward zero', () => {
    expect(value(op('/', num(7), num(2)))).toBe(3);
    expect(value(op('/', num(-7), num(2)))).toBe(-3);
    expect(value(op('%', num(-7), num(3)))).toBe(-1);
    expect(value(op('-', op('*', num(2), num(3)), num(1)))).toBe(5);
    expect(value(op('|', num(1), op('&', num(6), num(3))))).toBe(3);
    expect(value(op('<<', num(1), num(4)))).toBe(16);
  });

  it('gives comparisons and logic operators 1 or 0', () => {
    expect(value(op('>=', num(3), num(3)))).toBe(1);
    expect(value(op('<', num(3), num(3)))).toBe(0);
    expect(value(op('&&', num(2), num(0)))).toBe(0);
    expect(value(op('||', num(0), num(5)))).toBe(1);
    expect(value(op('!', num(5)))).toBe(0);
    expect(value(op('-', num(5)))).toBe(-5);
    expect(value(op('~', num(0)))).toBe(-1);
  });

  it('picks a ternary branch', () => {
    expect(value(op('?:', op('>', call('getrefine'), num(5)), num(10), num(20)))).toBe(10);
    expect(value(op('?:', num(0), num(10), num(20)))).toBe(20);
  });

  it('ends the script on division by zero, keeping earlier bonuses, even inside && and ?:', () => {
    const divideByZero = op('/', num(1), num(0));
    const result = evaluateEffects(
      [bonus('bAgi', num(1)), bonus('bStr', op('&&', num(0), divideByZero)), bonus('bVit', num(1))],
      context(),
    );
    expect(result).toEqual({
      calls: [{ name: 'bAgi', args: [1] }],
      skills: [],
      autoBonuses: [],
      error: 'division by zero',
    });
    expect(
      evaluateEffects([bonus('bStr', op('?:', num(1), num(2), divideByZero))], context()).error,
    ).toBe('division by zero');
  });

  it('compares strings and ends the script on other string arithmetic', () => {
    expect(value(op('==', str('a'), str('a')))).toBe(1);
    expect(value(op('+', str('a'), str('b')))).toBe('ab');
    expect(evaluateEffects([bonus('bStr', op('*', str('a'), num(2)))], context()).error).toBe(
      'operator * on a string',
    );
  });

  it('runs if/else on the refine of the item', () => {
    const statements: ScriptStmt[] = [
      {
        k: 'if',
        cond: op('>', call('getrefine'), num(5)),
        then: [bonus('bStr', num(1))],
        else: [bonus('bAgi', num(1))],
      },
    ];
    expect(evaluateEffects(statements, context({ refine: 6 })).calls[0]?.name).toBe('bStr');
    expect(evaluateEffects(statements, context({ refine: 5 })).calls[0]?.name).toBe('bAgi');
  });

  it('stores .@ variables; an unset one reads as 0', () => {
    const result = evaluateEffects(
      [
        { k: 'set', name: '.@r', value: call('getrefine') },
        bonus('bStr', op('*', { k: 'var', name: '.@r' }, num(2))),
        bonus('bAgi', { k: 'var', name: '.@unset' }),
      ],
      context({ refine: 4 }),
    );
    expect(result.calls.map((c) => c.args[0])).toEqual([8, 0]);
  });

  it('reads raised stats (no job bonus) with readparam, and the levels', () => {
    expect(value(call('readparam', str('bStr')))).toBe(80);
    expect(value(call('readparam', str('bAgi')))).toBe(50);
    expect(value(ref('BaseLevel'))).toBe(90);
    expect(value(ref('JobLevel'))).toBe(45);
    expect(
      evaluateEffects([bonus('bStr', call('readparam', str('bMaxHP')))], context()).error,
    ).toBe('readparam(bMaxHP)');
  });

  it('reads the job as Class, BaseJob, BaseClass and eaclass()', () => {
    expect(value(ref('Class'))).toBe(KNIGHT);
    expect(value(ref('BaseJob'))).toBe(KNIGHT);
    expect(value(ref('BaseClass'))).toBe(1);
    expect(value(call('eaclass'))).toBe(0x101);
  });

  it('gives skill level 0 by default and passes the skill to the context', () => {
    expect(value(call('getskilllv', str('AL_DP')))).toBe(0);
    const levels = (skill: string | number) => (skill === 'AL_DP' ? 7 : 0);
    expect(value(call('getskilllv', str('AL_DP')), { skillLevel: levels })).toBe(7);
  });

  it('computes min, max and pow', () => {
    expect(value(call('max', call('getskilllv', str('X')), num(1)))).toBe(1);
    expect(value(call('min', num(4), num(2), num(3)))).toBe(2);
    expect(value(call('pow', num(2), num(5)))).toBe(32);
  });
});

describe('job helpers', () => {
  it('maps jobs to their first class like pc_mapid2jobid(class_ & MAPID_FIRSTMASK)', () => {
    expect(baseClassOf(0)).toBe(0);
    expect(baseClassOf(23)).toBe(0); // Super Novice → Novice
    expect(baseClassOf(20)).toBe(3); // Dancer → Archer
    expect(baseClassOf(4049)).toBe(4046); // Soul Linker → Taekwon
    expect(baseClassOf(25)).toBe(25); // Ninja
  });

  it('knows the MAPID of every shipped job', () => {
    expect(mapIdOf(15)).toBe(0x204);
    expect(() => mapIdOf(4008)).toThrow('No MAPID for job 4008.');
  });
});

describe('evaluateEffects on shipped items', () => {
  it('runs every parsed script without throwing, for several jobs and refines', () => {
    for (const jobId of [0, KNIGHT, 12, 20, 4049]) {
      for (const refine of [0, 10]) {
        for (const item of items) {
          if (item.effects === null) continue;
          expect(() =>
            evaluateEffects(item.effects ?? [], context({ jobId, refine })),
          ).not.toThrow();
        }
      }
    }
  });
});
