// Parses the subset of rAthena item script that the planner can evaluate into
// the ScriptStmt AST (src/data/types.ts). Anything outside the subset makes
// the whole script unsupported, with a reason and the offending statement.
// Grammar and precedence follow rAthena's src/map/script.cpp (parse_line,
// parse_syntax, parse_subexpr).
import type {
  AutobonusCommand,
  ScriptExpr,
  ScriptFunction,
  ScriptRef,
  ScriptStmt,
} from '../../src/data/types.ts';
import { BONUS_NAMES, SCRIPT_CONSTANTS } from './constants.ts';
import { tokenize, type Token } from './lexer.ts';

export type ParseResult =
  | { ok: true; effects: ScriptStmt[] }
  | {
      ok: false;
      /** Short category for grouping, e.g. `command "autobonus"`. */
      reason: string;
      /** First line of the statement that could not be parsed. */
      statement: string;
    };

// rAthena resolves constants, parameters and function names case-insensitively.
const lower = (text: string) => text.toLowerCase();
const constantsByLowerName = new Map(
  Object.entries(SCRIPT_CONSTANTS).map(([name, value]) => [lower(name), { name, value }]),
);
const bonusByLowerName = new Map(BONUS_NAMES.map((name) => [lower(name), name]));
const REFS: readonly ScriptRef[] = ['BaseLevel', 'JobLevel', 'BaseJob', 'BaseClass', 'Class'];
const refByLowerName = new Map(REFS.map((name) => [lower(name), name]));

/** Allowed argument counts per function. */
const FUNCTIONS: Record<ScriptFunction, { min: number; max: number }> = {
  getrefine: { min: 0, max: 0 },
  readparam: { min: 1, max: 1 },
  getskilllv: { min: 1, max: 1 },
  eaclass: { min: 0, max: 0 },
  min: { min: 1, max: Infinity },
  max: { min: 1, max: Infinity },
  pow: { min: 2, max: 2 },
};
const functionByLowerName = new Map(
  Object.keys(FUNCTIONS).map((name) => [lower(name), name as ScriptFunction]),
);

/** Value counts per bonus command, as rAthena's buildin signatures allow. */
const BONUS_COMMANDS: Record<string, { min: number; max: number }> = {
  bonus: { min: 0, max: 1 },
  bonus2: { min: 2, max: 2 },
  bonus3: { min: 3, max: 3 },
  bonus4: { min: 4, max: 4 },
  bonus5: { min: 5, max: 5 },
};

/** Binary operator precedence from rAthena's parse_subexpr; higher binds tighter. */
const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '|': 3,
  '^': 4,
  '&': 5,
  '==': 6,
  '!=': 6,
  '<': 7,
  '<=': 7,
  '>': 7,
  '>=': 7,
  '<<': 8,
  '>>': 8,
  '+': 9,
  '-': 9,
  '*': 10,
  '/': 10,
  '%': 10,
};
const AUTOBONUS_COMMANDS: readonly AutobonusCommand[] = ['autobonus', 'autobonus2', 'autobonus3'];

const TERNARY_PRECEDENCE = 0;
const UNARY_PRECEDENCE = 11;

class Unsupported extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

class Parser {
  private position = 0;
  private readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  /** Source offset where the statement being parsed starts. */
  statementStart = 0;

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.position + offset, this.tokens.length - 1)] as Token;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'end') this.position++;
    return token;
  }

  private isPunct(text: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.kind === 'punct' && token.text === text;
  }

  private isKeyword(text: string): boolean {
    const token = this.peek();
    return token.kind === 'ident' && token.text === text;
  }

  private expect(text: string): void {
    const token = this.next();
    if (token.kind !== 'punct' || token.text !== text) {
      throw new Unsupported(token.kind === 'unknown' ? 'syntax: unknown character' : 'syntax');
    }
  }

  parseProgram(): ScriptStmt[] {
    const statements: ScriptStmt[] = [];
    while (this.peek().kind !== 'end') statements.push(...this.parseStatement());
    return statements;
  }

  /** One statement; an empty statement or block yields zero or several. */
  private parseStatement(): ScriptStmt[] {
    this.statementStart = this.peek().start;
    const token = this.peek();
    if (this.isPunct(';')) {
      this.next();
      return [];
    }
    if (this.isPunct('{')) {
      this.next();
      const statements: ScriptStmt[] = [];
      while (!this.isPunct('}')) {
        if (this.peek().kind === 'end') throw new Unsupported('syntax');
        statements.push(...this.parseStatement());
      }
      this.next();
      return statements;
    }
    if (token.kind === 'ident' && token.text === 'if') return [this.parseIf()];
    if (token.kind === 'ident' && Object.hasOwn(BONUS_COMMANDS, lower(token.text)))
      return [this.parseBonus()];
    if (token.kind === 'ident' && lower(token.text) === 'skill') return [this.parseSkill()];
    const autobonus = AUTOBONUS_COMMANDS.find((command) => command === lower(token.text));
    if (token.kind === 'ident' && autobonus !== undefined) return [this.parseAutobonus(autobonus)];
    if (token.kind === 'var') return [this.parseAssignment()];
    if (token.kind === 'ident') throw new Unsupported(`command "${lower(token.text)}"`);
    throw new Unsupported(token.kind === 'unknown' ? 'syntax: unknown character' : 'syntax');
  }

  private parseIf(): ScriptStmt {
    this.next();
    this.expect('(');
    const cond = this.parseExpression();
    this.expect(')');
    const then = this.parseStatement();
    let otherwise: ScriptStmt[] = [];
    if (this.isKeyword('else')) {
      this.next();
      otherwise = this.parseStatement();
    }
    return { k: 'if', cond, then, else: otherwise };
  }

  private parseBonus(): ScriptStmt {
    const command = lower(this.next().text);
    const nameToken = this.next();
    if (nameToken.kind !== 'ident') throw new Unsupported('syntax: bonus without a name');
    const name = bonusByLowerName.get(lower(nameToken.text));
    if (name === undefined) throw new Unsupported(`unknown bonus "${nameToken.text}"`);
    const args: ScriptExpr[] = [];
    while (this.isPunct(',')) {
      this.next();
      args.push(this.parseExpression());
    }
    this.expect(';');
    const counts = BONUS_COMMANDS[command] as { min: number; max: number };
    if (args.length < counts.min || args.length > counts.max) {
      throw new Unsupported(`${command} with ${args.length} values`);
    }
    return { k: 'bonus', name, args };
  }

  /** `skill <id or "name">,<level>{,<flag>};` */
  private parseSkill(): ScriptStmt {
    this.next();
    const skill = this.parseSkillRef('skill');
    this.expect(',');
    const level = this.parseExpression();
    let flag: ScriptExpr | undefined;
    if (this.isPunct(',')) {
      this.next();
      flag = this.parseExpression();
    }
    this.expect(';');
    return flag === undefined ? { k: 'skill', skill, level } : { k: 'skill', skill, level, flag };
  }

  /**
   * `autobonus "<bonus script>",<rate>,<duration>{,<flag>{,"<other script>"}};`,
   * the same for autobonus2, and autobonus3 with a skill in place of the
   * flag. The bonus script must parse too; the other script is kept as text.
   */
  private parseAutobonus(command: AutobonusCommand): ScriptStmt {
    this.next();
    const scriptToken = this.next();
    if (scriptToken.kind !== 'str') throw new Unsupported(`${command} without a bonus script`);
    const inner = parseScript(scriptToken.value as string);
    if (!inner.ok) throw new Unsupported(`${command} bonus: ${inner.reason}`);
    this.expect(',');
    const rate = this.parseExpression();
    this.expect(',');
    const duration = this.parseExpression();
    const statement: Extract<ScriptStmt, { k: 'autobonus' }> = {
      k: 'autobonus',
      command,
      bonus: inner.effects,
      rate,
      duration,
    };
    if (command === 'autobonus3') {
      this.expect(',');
      statement.skill = this.parseSkillRef(command);
    } else if (this.isPunct(',')) {
      this.next();
      statement.flag = this.parseExpression();
    }
    if (this.isPunct(',')) {
      this.next();
      const other = this.next();
      if (other.kind !== 'str') throw new Unsupported(`${command} with a non-text other script`);
      statement.onStart = other.value as string;
    }
    this.expect(';');
    return statement;
  }

  /** A skill given by name or id, as `skill` and `autobonus3` take it. */
  private parseSkillRef(command: string): ScriptExpr {
    const skill = this.parseExpression();
    if (skill.k !== 'str' && skill.k !== 'num')
      throw new Unsupported(`${command} with a computed skill`);
    return skill;
  }

  private parseAssignment(): ScriptStmt {
    const name = this.next().text;
    if (!name.startsWith('.@')) throw new Unsupported(`variable "${name}"`);
    if (!this.isPunct('=')) throw new Unsupported(`assignment "${this.peek().text}"`);
    this.next();
    const value = this.parseExpression();
    this.expect(';');
    return { k: 'set', name, value };
  }

  /** rAthena's parse_subexpr: precedence climbing; `limit` is the binding power to beat. */
  parseExpression(limit = -1): ScriptExpr {
    let left: ScriptExpr;
    const token = this.peek();
    if (token.kind === 'punct' && (token.text === '++' || token.text === '--')) {
      throw new Unsupported(`operator "${token.text}"`);
    }
    if (
      token.kind === 'punct' &&
      (token.text === '-' || token.text === '!' || token.text === '~')
    ) {
      this.next();
      left = { k: 'op', op: token.text, args: [this.parseExpression(UNARY_PRECEDENCE)] };
    } else {
      left = this.parsePrimary();
    }
    for (;;) {
      const operator = this.peek();
      if (operator.kind !== 'punct') break;
      if (operator.text === '?') {
        if (TERNARY_PRECEDENCE <= limit) break;
        this.next();
        const then = this.parseExpression();
        this.expect(':');
        const otherwise = this.parseExpression();
        left = { k: 'op', op: '?:', args: [left, then, otherwise] };
        continue;
      }
      const precedence = BINARY_PRECEDENCE[operator.text];
      if (precedence === undefined || precedence <= limit) break;
      this.next();
      left = { k: 'op', op: operator.text, args: [left, this.parseExpression(precedence)] };
    }
    return left;
  }

  private parsePrimary(): ScriptExpr {
    const token = this.next();
    switch (token.kind) {
      case 'num':
        return { k: 'num', v: token.value as number };
      case 'str':
        return { k: 'str', v: token.value as string };
      case 'var':
        if (!token.text.startsWith('.@')) throw new Unsupported(`variable "${token.text}"`);
        return { k: 'var', name: token.text };
      case 'ident':
        return this.isPunct('(') ? this.parseCall(token) : this.resolveName(token.text);
      case 'punct':
        if (token.text === '(') {
          const inner = this.parseExpression();
          this.expect(')');
          return inner;
        }
        throw new Unsupported('syntax');
      default:
        throw new Unsupported(token.kind === 'unknown' ? 'syntax: unknown character' : 'syntax');
    }
  }

  private parseCall(nameToken: Token): ScriptExpr {
    const fn = functionByLowerName.get(lower(nameToken.text));
    if (fn === undefined) throw new Unsupported(`function "${lower(nameToken.text)}"`);
    this.expect('(');
    const args: ScriptExpr[] = [];
    if (!this.isPunct(')')) {
      args.push(fn === 'readparam' ? this.parseBonusName() : this.parseExpression());
      while (this.isPunct(',')) {
        this.next();
        args.push(this.parseExpression());
      }
    }
    this.expect(')');
    const counts = FUNCTIONS[fn];
    if (args.length < counts.min || args.length > counts.max) {
      throw new Unsupported(`${fn} with ${args.length} arguments`);
    }
    if (fn === 'getskilllv' && args[0]?.k !== 'str' && args[0]?.k !== 'num') {
      throw new Unsupported('getskilllv with a computed skill');
    }
    return { k: 'call', fn, args };
  }

  /** `readparam(bStr)`: the argument is a bonus name, kept as a string. */
  private parseBonusName(): ScriptExpr {
    const token = this.next();
    const name = token.kind === 'ident' ? bonusByLowerName.get(lower(token.text)) : undefined;
    if (name === undefined) throw new Unsupported('readparam of a non-parameter');
    return { k: 'str', v: name };
  }

  private resolveName(text: string): ScriptExpr {
    const ref = refByLowerName.get(lower(text));
    if (ref !== undefined) return { k: 'ref', name: ref };
    const constant = constantsByLowerName.get(lower(text));
    if (constant !== undefined) return { k: 'const', name: constant.name, v: constant.value };
    throw new Unsupported(`unknown name "${text}"`);
  }
}

function statementSnippet(source: string, start: number): string {
  const line = source.slice(start).split('\n')[0] ?? '';
  const trimmed = line.trim();
  return trimmed.length > 100 ? `${trimmed.slice(0, 97)}...` : trimmed;
}

export function parseScript(source: string): ParseResult {
  const parser = new Parser(tokenize(source));
  try {
    return { ok: true, effects: parser.parseProgram() };
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error;
    return {
      ok: false,
      reason: error.reason,
      statement: statementSnippet(source, parser.statementStart),
    };
  }
}
