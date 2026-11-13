import { describe, expect, it } from 'vitest';
import type { ScriptExpr, ScriptStmt } from '../../src/data/types.ts';
import { tokenize } from './lexer.ts';
import { parseScript, type ParseResult } from './parser.ts';

function effects(source: string): ScriptStmt[] {
  const result = parseScript(source);
  if (!result.ok) throw new Error(`unsupported: ${result.reason} (${result.statement})`);
  return result.effects;
}

/** The value expression of a one-statement `bonus bX,<expr>;` script. */
function expr(source: string): ScriptExpr {
  const [statement] = effects(`bonus bStr,${source};`);
  if (statement?.k !== 'bonus') throw new Error('not a bonus');
  return statement.args[0] as ScriptExpr;
}

function unsupported(source: string): Extract<ParseResult, { ok: false }> {
  const result = parseScript(source);
  if (result.ok) throw new Error('expected unsupported');
  return result;
}

const num = (v: number): ScriptExpr => ({ k: 'num', v });
const op = (operator: string, ...args: ScriptExpr[]): ScriptExpr => ({
  k: 'op',
  op: operator,
  args,
});
const refine: ScriptExpr = { k: 'call', fn: 'getrefine', args: [] };

describe('tokenize', () => {
  it('skips comments and reads hex numbers, escaped strings and variables', () => {
    const tokens = tokenize('// line\n/* block */ 0x1F "a\\"b" .@r @t $g');
    expect(tokens.map((token) => [token.kind, token.value ?? token.text])).toEqual([
      ['num', 31],
      ['str', 'a"b'],
      ['var', '.@r'],
      ['var', '@t'],
      ['var', '$g'],
      ['end', ''],
    ]);
  });

  it('prefers two-character operators', () => {
    expect(tokenize('a>=b').map((token) => token.text)).toEqual(['a', '>=', 'b', '']);
  });

  it('marks an unterminated string and unknown characters as unknown', () => {
    expect(tokenize('"abc')[0]?.kind).toBe('unknown');
    expect(tokenize('`')[0]?.kind).toBe('unknown');
  });
});

describe('parseScript statements', () => {
  it('returns no effects for an empty script and empty statements', () => {
    expect(effects('')).toEqual([]);
    expect(effects(';;\n;')).toEqual([]);
  });

  it('parses bonus commands with 0 to 5 values', () => {
    expect(effects('bonus bUnbreakableWeapon;')).toEqual([
      { k: 'bonus', name: 'bUnbreakableWeapon', args: [] },
    ]);
    expect(effects('bonus bStr,1;')[0]).toMatchObject({ args: [num(1)] });
    expect(effects('bonus2 bAddRace,RC_DemiHuman,10;')[0]).toEqual({
      k: 'bonus',
      name: 'bAddRace',
      args: [{ k: 'const', name: 'RC_DEMIHUMAN', v: 7 }, num(10)],
    });
    expect(effects('bonus3 bAutoSpell,"AL_HEAL",1,10;')[0]).toMatchObject({ name: 'bAutoSpell' });
    expect(effects('bonus4 bAutoSpellOnSkill,"A","B",2,200;')[0]?.k).toBe('bonus');
    expect(effects('bonus5 bAutoSpellWhenHit,"A",8,150,BF_MAGIC,0;')[0]?.k).toBe('bonus');
  });

  it('rejects a bonus command with the wrong number of values', () => {
    expect(unsupported('bonus2 bAddRace,10;').reason).toBe('bonus2 with 1 values');
    expect(unsupported('bonus bStr,1,2;').reason).toBe('bonus with 2 values');
  });

  it('resolves bonus names case-insensitively to rAthena spelling', () => {
    expect(effects('BONUS bAGI,1; bonus bdex,2;').map((s) => s.k === 'bonus' && s.name)).toEqual([
      'bAgi',
      'bDex',
    ]);
  });

  it('rejects an unknown bonus name', () => {
    expect(unsupported('bonus bStrength,1;').reason).toBe('unknown bonus "bStrength"');
  });

  it('parses if without braces, with braces, else and else if', () => {
    const [statement] = effects(
      'if (getrefine() > 5) bonus bStr,1; else if (getrefine() > 2) { bonus bAgi,1; bonus bVit,1; } else bonus bLuk,1;',
    );
    expect(statement).toEqual({
      k: 'if',
      cond: op('>', refine, num(5)),
      then: [{ k: 'bonus', name: 'bStr', args: [num(1)] }],
      else: [
        {
          k: 'if',
          cond: op('>', refine, num(2)),
          then: [
            { k: 'bonus', name: 'bAgi', args: [num(1)] },
            { k: 'bonus', name: 'bVit', args: [num(1)] },
          ],
          else: [{ k: 'bonus', name: 'bLuk', args: [num(1)] }],
        },
      ],
    });
  });

  it('binds a dangling else to the nearest if', () => {
    const [outer] = effects('if (1) if (0) bonus bStr,1; else bonus bAgi,1;');
    expect(outer).toMatchObject({ k: 'if', else: [] });
    expect(outer?.k === 'if' && outer.then[0]).toMatchObject({ k: 'if', else: [{ name: 'bAgi' }] });
  });

  it('flattens a bare block', () => {
    expect(effects('{ bonus bStr,1; { bonus bAgi,1; } }')).toHaveLength(2);
  });

  it('parses .@ variable assignment and use', () => {
    expect(effects('.@r = getrefine(); bonus bStr,.@r;')).toEqual([
      { k: 'set', name: '.@r', value: refine },
      { k: 'bonus', name: 'bStr', args: [{ k: 'var', name: '.@r' }] },
    ]);
  });

  it('rejects other variables, compound assignment and ++', () => {
    expect(unsupported('@x = 1;').reason).toBe('variable "@x"');
    expect(unsupported('bonus bStr,$x;').reason).toBe('variable "$x"');
    expect(unsupported('.@r += 1;').reason).toBe('assignment "+="');
    expect(unsupported('bonus bStr,++.@r;').reason).toBe('operator "++"');
  });

  it('rejects other commands and names the offending statement', () => {
    const result = unsupported('bonus bStr,1;\nskill "TF_DOUBLE",5;\nbonus bAgi,1;');
    expect(result).toEqual({
      ok: false,
      reason: 'command "skill"',
      statement: 'skill "TF_DOUBLE",5;',
    });
    expect(unsupported('autobonus "{}",1,1;').reason).toBe('command "autobonus"');
    expect(unsupported('Callfunc "F_X";').reason).toBe('command "callfunc"');
  });

  it('reports syntax errors as unsupported instead of throwing', () => {
    expect(unsupported('bonus bStr,1').reason).toBe('syntax');
    expect(unsupported('if (1 bonus bStr,1;').reason).toBe('syntax');
    expect(unsupported('{ bonus bStr,1;').reason).toBe('syntax');
    expect(unsupported('bonus bStr,"abc;').reason).toBe('syntax: unknown character');
  });
});

describe('parseScript expressions', () => {
  it('reads numbers, strings and parentheses', () => {
    expect(expr('0x10')).toEqual(num(16));
    expect(expr('((3))')).toEqual(num(3));
  });

  it('resolves constants case-insensitively and keeps rAthena spelling', () => {
    expect(expr('Ele_fire')).toEqual({ k: 'const', name: 'ELE_FIRE', v: 3 });
    expect(expr('Job_SuperNovice')).toEqual({ k: 'const', name: 'Job_SuperNovice', v: 23 });
    expect(expr('EAJ_KNIGHT')).toEqual({ k: 'const', name: 'EAJ_KNIGHT', v: 257 });
  });

  it('reads character parameters case-insensitively', () => {
    expect(expr('class')).toEqual({ k: 'ref', name: 'Class' });
    expect(expr('BaseLevel + JobLevel + BaseJob + BaseClass')).toEqual(
      op(
        '+',
        op('+', op('+', { k: 'ref', name: 'BaseLevel' }, { k: 'ref', name: 'JobLevel' }), {
          k: 'ref',
          name: 'BaseJob',
        }),
        { k: 'ref', name: 'BaseClass' },
      ),
    );
  });

  it('rejects unknown names', () => {
    expect(unsupported('bonus2 bAddItemGroupHealRate,IG_Potion,20;').reason).toBe(
      'unknown name "IG_Potion"',
    );
  });

  it("follows rAthena's precedence: * over +, + over comparison, && over ||", () => {
    expect(expr('1 + 2 * 3')).toEqual(op('+', num(1), op('*', num(2), num(3))));
    expect(expr('1 < 2 + 3')).toEqual(op('<', num(1), op('+', num(2), num(3))));
    expect(expr('1 || 2 && 3')).toEqual(op('||', num(1), op('&&', num(2), num(3))));
    expect(expr('1 == 2 < 3')).toEqual(op('==', num(1), op('<', num(2), num(3))));
    expect(expr('1 | 2 ^ 3 & 4')).toEqual(
      op('|', num(1), op('^', num(2), op('&', num(3), num(4)))),
    );
    expect(expr('1 << 2 + 3')).toEqual(op('<<', num(1), op('+', num(2), num(3))));
  });

  it('is left-associative within a level', () => {
    expect(expr('10 - 3 - 2')).toEqual(op('-', op('-', num(10), num(3)), num(2)));
    expect(expr('8 / 2 % 3')).toEqual(op('%', op('/', num(8), num(2)), num(3)));
  });

  it('binds unary operators to the operand only', () => {
    expect(expr('-2 * 3')).toEqual(op('*', op('-', num(2)), num(3)));
    expect(expr('!1 + 1')).toEqual(op('+', op('!', num(1)), num(1)));
    expect(expr('~0')).toEqual(op('~', num(0)));
    expect(expr('-(1 + 2)')).toEqual(op('-', op('+', num(1), num(2))));
  });

  it('parses the ternary operator with the lowest precedence', () => {
    expect(expr('1 + 2 ? 3 : 4 + 5')).toEqual(
      op('?:', op('+', num(1), num(2)), num(3), op('+', num(4), num(5))),
    );
    expect(expr('1 ? 2 : 3 ? 4 : 5')).toEqual(
      op('?:', num(1), num(2), op('?:', num(3), num(4), num(5))),
    );
    expect(expr('1 + (0 ? 2 : 3)')).toEqual(op('+', num(1), op('?:', num(0), num(2), num(3))));
  });

  it('parses the supported functions', () => {
    expect(expr('getrefine()')).toEqual(refine);
    expect(expr('readparam(bagi)')).toEqual({
      k: 'call',
      fn: 'readparam',
      args: [{ k: 'str', v: 'bAgi' }],
    });
    expect(expr('getskilllv("AL_DP")')).toEqual({
      k: 'call',
      fn: 'getskilllv',
      args: [{ k: 'str', v: 'AL_DP' }],
    });
    expect(expr('getskilllv(28)')).toMatchObject({ fn: 'getskilllv', args: [num(28)] });
    expect(expr('eaclass()')).toMatchObject({ fn: 'eaclass', args: [] });
    expect(expr('max(1,2,3) + min(4,5) + pow(2,3)')).toBeDefined();
  });

  it('rejects unknown functions and wrong argument counts', () => {
    expect(unsupported('bonus bStr,gettime(DT_MONTH);').reason).toBe('function "gettime"');
    expect(unsupported('bonus bStr,getrefine(1);').reason).toBe('getrefine with 1 arguments');
    expect(unsupported('bonus bStr,pow(2);').reason).toBe('pow with 1 arguments');
    expect(unsupported('bonus bStr,readparam(5);').reason).toBe('readparam of a non-parameter');
    expect(unsupported('bonus bStr,getskilllv(.@s);').reason).toBe(
      'getskilllv with a computed skill',
    );
  });
});

// Real scripts from rAthena db/pre-re/item_db_equip.yml (commit 7f080871c), by item id.
describe('parseScript real item scripts', () => {
  const plain: Record<number, string> = {
    1313: 'bonus bStr,2;\n',
    2370: 'bonus bMaxHP,300;\nbonus bMaxSP,30;\nbonus bBaseAtk,10;\nbonus bAGI,1;\n',
    2754: 'bonus2 bExpAddRace,RC_undead,15;\n',
    5574: 'bonus bdex,2;\nbonus bHitRate,3;\n',
    5490: 'bonus bMdef,5;\nbonus2 bSubClass,Class_Boss,10;\nbonus bHealpower2,10;\nbonus bAddItemHealRate,10;\n',
  };

  it.each(Object.entries(plain))('parses plain script of item %s', (_, source) => {
    const statements = effects(source);
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.every((statement) => statement.k === 'bonus')).toBe(true);
  });

  it('1187 Krasnaya: refine conditions with squared refine and max(getskilllv)', () => {
    const statements = effects(`bonus2 bAddRace,RC_DemiHuman,70;
bonus2 bAddRace,RC_Player_Human,70;
bonus2 bIgnoreDefRaceRate,RC_DemiHuman,25;
bonus2 bIgnoreDefRaceRate,RC_Player_Human,25;
bonus bUnbreakableWeapon;
if (getrefine()>5) {
   bonus2 bAddRace,RC_DemiHuman,(getrefine()-3)*(getrefine()-3);
   bonus2 bAddRace,RC_Player_Human,(getrefine()-3)*(getrefine()-3);
   bonus2 bIgnoreDefRaceRate,RC_DemiHuman,5;
   bonus2 bIgnoreDefRaceRate,RC_Player_Human,5;
}
if (getrefine()>8) {
   bonus3 bAutoSpell,"LK_CONCENTRATION",max(getskilllv("LK_CONCENTRATION"),1),30;
   bonus3 bAutoSpell,"LK_AURABLADE",max(getskilllv("LK_AURABLADE"),1),30;
}
`);
    expect(statements).toHaveLength(7);
    expect(statements[5]).toMatchObject({
      k: 'if',
      cond: op('>', refine, num(5)),
      then: [
        {
          name: 'bAddRace',
          args: [
            { k: 'const', name: 'RC_DEMIHUMAN' },
            op('*', op('-', refine, num(3)), op('-', refine, num(3))),
          ],
        },
        {},
        {},
        {},
      ],
    });
  });

  it('1265: readparam and BaseLevel inside a negated sum', () => {
    const statements = effects(`bonus bIgnoreDefRace,RC_DemiHuman;
bonus bIgnoreDefRace,RC_Player_Human;
bonus bFlee,-(readparam(bAgi)+BaseLevel);
bonus bHPrecovRate,-100;
bonus bSPrecovRate,-100;
`);
    expect(statements[2]).toEqual({
      k: 'bonus',
      name: 'bFlee',
      args: [
        op(
          '-',
          op(
            '+',
            { k: 'call', fn: 'readparam', args: [{ k: 'str', v: 'bAgi' }] },
            { k: 'ref', name: 'BaseLevel' },
          ),
        ),
      ],
    });
  });

  it('1370: stat condition', () => {
    const statements = effects(`bonus bAspdRate,-40;
bonus bUseSPrate,100;
if (readparam(bStr)>=95) {
   bonus bBaseAtk,340;
   bonus2 bAddEff,Eff_Stun,3000;
   bonus bBreakArmorRate,500;
}
`);
    expect(statements[2]).toMatchObject({ k: 'if', cond: { op: '>=' } });
  });

  it('1426: job conditions without braces inside a refine condition', () => {
    const statements = effects(`bonus bUnbreakableWeapon;
if (getrefine()>8) {
   if (BaseJob == Job_Knight)
      bonus4 bAutoSpellOnSkill,"KN_PIERCE","NPC_CRITICALWOUND",2,200;
   else if (BaseJob == Job_Crusader)
      bonus3 bAutoSpell,"PA_PRESSURE",5,100;
}
`);
    const inner = statements[1]?.k === 'if' ? statements[1].then[0] : undefined;
    expect(inner).toMatchObject({
      k: 'if',
      cond: op('==', { k: 'ref', name: 'BaseJob' }, { k: 'const', name: 'JOB_KNIGHT', v: 7 }),
      else: [{ k: 'if', then: [{ name: 'bAutoSpell' }], else: [] }],
    });
  });

  it('1548: skill level as a bonus value', () => {
    const statements = effects(`bonus bHealPower,getskilllv("AL_DP");
bonus bCritical,getskilllv("PR_MACEMASTERY")*2;
bonus bInt,1;
bonus bLuk,1;
`);
    expect(statements).toHaveLength(4);
  });

  it('1562: a comparison used as a number', () => {
    const [, autoSpell] = effects(`bonus bInt,3;
bonus3 bAutoSpell,"AL_BLESSING",3+(getskilllv("AL_BLESSING")>3)*(getskilllv("AL_BLESSING")-3),20;
`);
    expect(autoSpell).toMatchObject({ args: [{ k: 'str' }, { op: '+' }, num(20)] });
  });

  it('1640: refine in a variable and a ternary', () => {
    const statements = effects(`bonus bMatkRate,15;
.@r = getrefine();
bonus2 bIgnoreMdefRaceRate,RC_DemiHuman,25 + ((.@r>5) ? 5 : 0);
if (.@r>8) {
   bonus bCastrate,-5;
   bonus bDelayRate,-5;
   bonus bMatkRate,5;
}
`);
    expect(statements[2]).toMatchObject({
      args: [{}, { op: '+', args: [num(25), { op: '?:' }] }],
    });
  });

  it('5262: stat and first-job condition with && and ||', () => {
    const statements = effects(`bonus bStr,2;
bonus bUnbreakableHelm;
if (readparam(bDex)<56 && (BaseClass == Job_Swordman || BaseClass == Job_Merchant || BaseClass == Job_Thief))
   bonus bDex,JobLevel/7;
`);
    expect(statements[2]).toMatchObject({ k: 'if', cond: { op: '&&' } });
  });

  it('5592: else-if chain on job with lowercase class', () => {
    const [statement] =
      effects(`if (BaseClass == Job_Swordman || BaseClass == Job_Merchant || BaseClass == Job_Thief || (BaseJob == Job_Taekwon && Class!=Job_Soul_Linker))
   bonus bStr,1;
else if (BaseClass == Job_Mage || BaseClass == Job_Acolyte || class == Job_Ninja || class == Job_Soul_Linker)
   bonus bInt,1;
else if (BaseClass == Job_Archer || BaseClass == Job_Gunslinger)
   bonus bDex,1;
else if (BaseJob == Job_Novice || BaseJob == Job_SuperNovice) {
   bonus bMaxHP,80;
   bonus bMaxSP,30;
}
`);
    expect(statement).toMatchObject({
      k: 'if',
      else: [{ k: 'if', else: [{ k: 'if', else: [{ k: 'if', then: [{}, {}], else: [] }] }] }],
    });
  });

  it('5682: if and else with braces', () => {
    const [, statement] = effects(`bonus bHealPower,2;
if (getrefine() > 6) {
   bonus bMatk,10;
   bonus5 bAutoSpellWhenHit,"NPC_MAGICMIRROR",8,150,BF_MAGIC,0;
}
else {
   bonus5 bAutoSpellWhenHit,"NPC_MAGICMIRROR",7,150,BF_MAGIC,0;
}
`);
    expect(statement).toMatchObject({ k: 'if', then: [{}, {}], else: [{}] });
  });

  it('5545: lowercase element constant inside a refine condition', () => {
    expect(
      effects(`bonus bVit,2;
bonus2 bSubEle,Ele_fire,5;
if (getrefine()>6) {
   bonus bDef,1;
   bonus bVit,1;
}
`),
    ).toHaveLength(3);
  });

  it.each([
    [1133, 'bonus bAtkEle,Ele_Fire;\nskill "MG_FIREBOLT",3;\n', 'command "skill"'],
    [
      1281,
      'autobonus "{ bonus bAspdRate,100; }",70,3000,BF_WEAPON,"{ specialeffect2 EF_POTION_BERSERK; }";\n',
      'command "autobonus"',
    ],
    [
      2132,
      'bonus2 bSubEle,Ele_All,20;\nif (vip_status(VIP_STATUS_ACTIVE)) {\n   bonus bAllStats,1;\n}\n',
      'function "vip_status"',
    ],
    [
      5547,
      'bonus2 bSkillAtk, "WZ_HEAVENDRIVE", 15 + getequiprefinerycnt(EQI_HAND_R);\n;\n',
      'function "getequiprefinerycnt"',
    ],
  ])('marks item %s unsupported', (_, source, reason) => {
    expect(unsupported(source).reason).toBe(reason);
  });
});
