// Evaluates an item's parsed script (data-pipeline/script/parser.ts) for one
// build, the way rAthena runs it in status_calc_pc: statements in order,
// `bonus` commands collected as calls. Arithmetic follows script.cpp op_2num
// (integer, truncating division); a runtime error ends the script, keeping
// the bonuses collected so far, as rAthena's `st->state = END` does.
import type { AutobonusCommand, BonusStats, ScriptExpr, ScriptStmt } from '../data/types';

export type BonusArg = number | string;

export interface BonusCall {
  /** rAthena bonus name, e.g. `bAddRace`. */
  name: string;
  /** Evaluated values; the arity is `args.length`. */
  args: BonusArg[];
}

/** `skill` in an item script: a skill the item grants while worn. */
export interface GrantedSkill {
  /** Skill name (e.g. `MG_COLDBOLT`) or id, as the script gives it. */
  skill: BonusArg;
  level: number;
}

/**
 * `autobonus`…`autobonus3`: rate, duration and trigger evaluated when the
 * item is equipped, as rAthena's pc_autobonus stores them; `bonus` runs only
 * when it triggers.
 */
export interface AutoBonus {
  command: AutobonusCommand;
  bonus: readonly ScriptStmt[];
  /** Chance per 1000. */
  rate: number;
  /** Milliseconds. */
  duration: number;
  /** `BF_*` filter (autobonus, autobonus2); 0 when absent. */
  flag: number;
  /** Triggering skill (autobonus3). */
  skill?: BonusArg;
}

export interface EffectContext {
  /** `getrefine()`: refine level of the item whose script runs. */
  refine: number;
  /**
   * `readparam(bStr)` etc. rAthena's pc_readparam returns `sd->status.str`,
   * the raised stat without job bonus or equipment.
   */
  baseStats: BonusStats;
  baseLevel: number;
  jobLevel: number;
  /** rAthena job id (`Class`). */
  jobId: number;
  /** `getskilllv`; 0 for every skill until skills are modelled. */
  skillLevel: (skill: BonusArg) => number;
}

export interface EffectResult {
  calls: BonusCall[];
  skills: GrantedSkill[];
  autoBonuses: AutoBonus[];
  /** Why the script stopped early, if it did. */
  error?: string;
}

/**
 * MAPID (`eaclass()`) per supported job id, from rAthena map.hpp `e_mapid`.
 * Only normal jobs are supported, so no upper or baby bits.
 */
const MAPID_BY_JOB: Readonly<Record<number, number>> = {
  0: 0x0, // Novice
  1: 0x1, // Swordman
  2: 0x2, // Mage
  3: 0x3, // Archer
  4: 0x4, // Acolyte
  5: 0x5, // Merchant
  6: 0x6, // Thief
  7: 0x101, // Knight
  8: 0x104, // Priest
  9: 0x102, // Wizard
  10: 0x105, // Blacksmith
  11: 0x103, // Hunter
  12: 0x106, // Assassin
  14: 0x201, // Crusader
  15: 0x204, // Monk
  16: 0x202, // Sage
  17: 0x206, // Rogue
  18: 0x205, // Alchemist
  19: 0x203, // Bard
  20: 0x203, // Dancer
  23: 0x100, // Super Novice
  24: 0x8, // Gunslinger
  25: 0x9, // Ninja
  4046: 0x7, // Taekwon
  4047: 0x107, // Star Gladiator
  4049: 0x207, // Soul Linker
};

/** `pc_mapid2jobid` for first-class MAPIDs (`mapid & MAPID_FIRSTMASK`). */
const FIRST_JOB_BY_MAPID: Readonly<Record<number, number>> = {
  0x0: 0,
  0x1: 1,
  0x2: 2,
  0x3: 3,
  0x4: 4,
  0x5: 5,
  0x6: 6,
  0x7: 4046,
  0x8: 24,
  0x9: 25,
};
const MAPID_FIRSTMASK = 0xff;

const READPARAM_STATS: Readonly<Record<string, keyof BonusStats>> = {
  bStr: 'str',
  bAgi: 'agi',
  bVit: 'vit',
  bInt: 'int',
  bDex: 'dex',
  bLuk: 'luk',
};

export function mapIdOf(jobId: number): number {
  const mapId = MAPID_BY_JOB[jobId];
  if (mapId === undefined) throw new Error(`No MAPID for job ${jobId}.`);
  return mapId;
}

/** `BaseClass`: the first job of the job's tree (Knight → Swordman). */
export function baseClassOf(jobId: number): number {
  return FIRST_JOB_BY_MAPID[mapIdOf(jobId) & MAPID_FIRSTMASK] as number;
}

class ScriptEnd extends Error {}

function truthy(value: BonusArg): boolean {
  return typeof value === 'number' ? value !== 0 : value !== '';
}

function asNumber(value: BonusArg, what: string): number {
  if (typeof value !== 'number') throw new ScriptEnd(`${what} on a string`);
  return value;
}

function binary(operator: string, left: BonusArg, right: BonusArg): BonusArg {
  // op_2 compares and concatenates strings; any other operator on a string is an error.
  if (typeof left === 'string' || typeof right === 'string') {
    if (typeof left === 'string' && typeof right === 'string') {
      if (operator === '==') return left === right ? 1 : 0;
      if (operator === '!=') return left !== right ? 1 : 0;
      if (operator === '+') return left + right;
    }
    throw new ScriptEnd(`operator ${operator} on a string`);
  }
  switch (operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
    case '%':
      if (right === 0) throw new ScriptEnd('division by zero');
      return operator === '/' ? Math.trunc(left / right) : left % right;
    case '&':
      return left & right;
    case '|':
      return left | right;
    case '^':
      return left ^ right;
    case '<<':
      return left << right;
    case '>>':
      return left >> right;
    case '&&':
      return left !== 0 && right !== 0 ? 1 : 0;
    case '||':
      return left !== 0 || right !== 0 ? 1 : 0;
    case '==':
      return left === right ? 1 : 0;
    case '!=':
      return left !== right ? 1 : 0;
    case '<':
      return left < right ? 1 : 0;
    case '<=':
      return left <= right ? 1 : 0;
    case '>':
      return left > right ? 1 : 0;
    case '>=':
      return left >= right ? 1 : 0;
    default:
      throw new ScriptEnd(`operator ${operator}`);
  }
}

class Evaluator {
  private readonly variables = new Map<string, BonusArg>();
  readonly calls: BonusCall[] = [];
  readonly skills: GrantedSkill[] = [];
  readonly autoBonuses: AutoBonus[] = [];
  private readonly context: EffectContext;

  constructor(context: EffectContext) {
    this.context = context;
  }

  run(statements: readonly ScriptStmt[]): void {
    for (const statement of statements) {
      switch (statement.k) {
        case 'bonus':
          this.calls.push({
            name: statement.name,
            args: statement.args.map((arg) => this.value(arg)),
          });
          break;
        case 'set':
          this.variables.set(statement.name, this.value(statement.value));
          break;
        case 'if':
          this.run(truthy(this.value(statement.cond)) ? statement.then : statement.else);
          break;
        case 'skill':
          this.skills.push({
            skill: this.value(statement.skill),
            level: asNumber(this.value(statement.level), 'skill level'),
          });
          break;
        case 'autobonus': {
          const autoBonus: AutoBonus = {
            command: statement.command,
            bonus: statement.bonus,
            rate: asNumber(this.value(statement.rate), statement.command),
            duration: asNumber(this.value(statement.duration), statement.command),
            flag:
              statement.flag === undefined
                ? 0
                : asNumber(this.value(statement.flag), statement.command),
          };
          if (statement.skill !== undefined) autoBonus.skill = this.value(statement.skill);
          this.autoBonuses.push(autoBonus);
          break;
        }
      }
    }
  }

  // rAthena evaluates every operand, including both sides of && / || and all
  // three of ?:, so a division by zero anywhere in them ends the script.
  value(expression: ScriptExpr): BonusArg {
    switch (expression.k) {
      case 'num':
      case 'str':
      case 'const':
        return expression.v;
      case 'var':
        // Unset script variables read as 0.
        return this.variables.get(expression.name) ?? 0;
      case 'ref':
        return this.ref(expression.name);
      case 'call':
        return this.call(expression.fn, expression.args);
      case 'op': {
        const args = expression.args.map((arg) => this.value(arg));
        if (expression.op === '?:') return truthy(args[0] as BonusArg) ? args[1]! : args[2]!;
        if (args.length === 1) {
          const operand = asNumber(args[0] as BonusArg, `unary ${expression.op}`);
          if (expression.op === '-') return -operand;
          if (expression.op === '!') return operand === 0 ? 1 : 0;
          return ~operand;
        }
        return binary(expression.op, args[0] as BonusArg, args[1] as BonusArg);
      }
    }
  }

  private ref(name: string): number {
    const { context } = this;
    switch (name) {
      case 'BaseLevel':
        return context.baseLevel;
      case 'JobLevel':
        return context.jobLevel;
      case 'BaseClass':
        return baseClassOf(context.jobId);
      // Supported jobs are not rebirth or baby jobs, so BaseJob (SP_BASESECOND)
      // and Class are the job itself; Bard and Dancer stay apart by sex.
      default:
        return context.jobId;
    }
  }

  private call(fn: string, args: readonly ScriptExpr[]): number {
    const values = args.map((arg) => this.value(arg));
    const numbers = () => values.map((value) => asNumber(value, fn));
    switch (fn) {
      case 'getrefine':
        return this.context.refine;
      case 'readparam': {
        const stat = READPARAM_STATS[values[0] as string];
        if (stat === undefined) throw new ScriptEnd(`readparam(${String(values[0])})`);
        return this.context.baseStats[stat];
      }
      case 'getskilllv':
        return this.context.skillLevel(values[0] as BonusArg);
      case 'eaclass':
        return mapIdOf(this.context.jobId);
      case 'min':
        return Math.min(...numbers());
      case 'max':
        return Math.max(...numbers());
      case 'pow': {
        const [base, exponent] = numbers() as [number, number];
        return Math.trunc(base ** exponent);
      }
      default:
        throw new ScriptEnd(`function ${fn}`);
    }
  }
}

/** Runs an item's effects for one build and returns the bonus calls it makes. */
export function evaluateEffects(
  effects: readonly ScriptStmt[],
  context: EffectContext,
): EffectResult {
  const evaluator = new Evaluator(context);
  try {
    evaluator.run(effects);
    return { calls: evaluator.calls, skills: evaluator.skills, autoBonuses: evaluator.autoBonuses };
  } catch (error) {
    if (!(error instanceof ScriptEnd)) throw error;
    return {
      calls: evaluator.calls,
      skills: evaluator.skills,
      autoBonuses: evaluator.autoBonuses,
      error: error.message,
    };
  }
}
