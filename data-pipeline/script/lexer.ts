// Tokens of rAthena item scripts, enough for the parsed subset. Anything the
// lexer does not know becomes an `unknown` token, which the parser reports as
// unsupported instead of throwing.

export type TokenKind = 'num' | 'str' | 'ident' | 'var' | 'punct' | 'unknown' | 'end';

export interface Token {
  kind: TokenKind;
  text: string;
  /** Numeric value for `num`, unescaped content for `str`. */
  value?: number | string;
  /** Offset of the token in the source, for error snippets. */
  start: number;
}

// Longest first, so `==` wins over `=`.
const PUNCTUATION = [
  '||',
  '&&',
  '==',
  '!=',
  '>=',
  '<=',
  '>>',
  '<<',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '|=',
  '&=',
  '^=',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  ',',
  ';',
  '?',
  ':',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '~',
  '&',
  '|',
  '^',
  '<',
  '>',
  '=',
];

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
// rAthena variable prefixes: `.@` scope, `.` npc, `@` temp char, `$`/`$@` global, `#`/`##` account.
const VARIABLE = /(?:\.@|\.|\$@|\$|@|##|#)[A-Za-z_][A-Za-z0-9_]*\$?/y;
const NUMBER = /0[xX][0-9a-fA-F]+|[0-9]+/y;
const SPACE = /(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/y;

function matchAt(pattern: RegExp, source: string, offset: number): string | undefined {
  pattern.lastIndex = offset;
  return pattern.exec(source)?.[0];
}

function readString(source: string, start: number): Token {
  let value = '';
  let offset = start + 1;
  while (offset < source.length && source[offset] !== '"') {
    if (source[offset] === '\\' && offset + 1 < source.length) {
      value += source[offset + 1];
      offset += 2;
    } else {
      value += source[offset];
      offset += 1;
    }
  }
  if (offset >= source.length) {
    return { kind: 'unknown', text: source.slice(start), start };
  }
  return { kind: 'str', text: source.slice(start, offset + 1), value, start };
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < source.length) {
    const space = matchAt(SPACE, source, offset);
    if (space !== undefined) {
      offset += space.length;
      continue;
    }
    const start = offset;
    const char = source[offset] as string;
    let token: Token;
    const number = matchAt(NUMBER, source, offset);
    const ident = matchAt(IDENT, source, offset);
    const variable = ident === undefined ? matchAt(VARIABLE, source, offset) : undefined;
    if (number !== undefined) {
      token = { kind: 'num', text: number, value: Number(number), start };
    } else if (ident !== undefined) {
      token = { kind: 'ident', text: ident, start };
    } else if (variable !== undefined) {
      token = { kind: 'var', text: variable, start };
    } else if (char === '"') {
      token = readString(source, offset);
    } else {
      const punct = PUNCTUATION.find((candidate) => source.startsWith(candidate, offset));
      token =
        punct === undefined
          ? { kind: 'unknown', text: char, start }
          : { kind: 'punct', text: punct, start };
    }
    tokens.push(token);
    offset += token.text.length;
  }
  tokens.push({ kind: 'end', text: '', start: source.length });
  return tokens;
}
