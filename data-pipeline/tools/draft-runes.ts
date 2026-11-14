// One-off drafting of data-overrides/runes.yml from the game client's item
// info. Not part of `pnpm data`: the maintainer reviews every drafted rune and
// resolves its TODO lines by hand, after which the YAML is the source.
//   node data-pipeline/tools/draft-runes.ts <itemInfo.lua> [--rathena <dir>] [--out <file>] [--force] && pnpm format
// The client text is the only source for rune effects and its phrasing varies,
// so a line is mapped only when the phrase is unambiguous; everything else
// becomes `# TODO: <client text>` for the reviewer.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuneLocation } from '../../src/data/types.ts';
import { loadDb, PRE_RE_DIR, resolveRathenaDir } from '../rathena.ts';
import { TODO_MARKER } from '../runes.ts';

export interface ClientLine {
  text: string;
  /** Grey (`^808080`) lines mark card album conditions in the client. */
  grey: boolean;
}

export interface ClientRune {
  id: number;
  name: string;
  lines: ClientLine[];
}

export interface DraftSet {
  requires: number[];
  /** Names as the client lists them, for the YAML comment. */
  names: string[];
  script: string[];
}

export interface DraftAlbum {
  requires: string[];
  rightHandOnly: boolean;
  note?: string;
  script: string[];
}

export interface DraftRune {
  id: number;
  name: string;
  location: RuneLocation | undefined;
  script: string[];
  sets: DraftSet[];
  album: DraftAlbum[];
  source: ClientLine[];
}

export interface DraftContext {
  /** Lowercased rune name without " Rune" → rune id. */
  runeIdsByName: ReadonlyMap<string, number>;
  /** Lowercased English skill name → rAthena skill name. */
  skillsByName: ReadonlyMap<string, string>;
}

export const TODO_PREFIX = `${TODO_MARKER} `;
const RUNE_ID_MIN = 39000;
const RUNE_ID_MAX = 39999;
const GREY = '^808080';

const LOCATIONS: Record<string, RuneLocation> = {
  weapon: 'Weapon',
  shield: 'Shield',
  armor: 'Armor',
  garment: 'Garment',
  shoes: 'Footgear',
  footgear: 'Footgear',
  accessory: 'Accessory',
  headgear: 'Headgear',
};

const STATS: Record<string, string> = {
  str: 'bStr',
  strength: 'bStr',
  agi: 'bAgi',
  agility: 'bAgi',
  vit: 'bVit',
  vitality: 'bVit',
  int: 'bInt',
  intelligence: 'bInt',
  dex: 'bDex',
  dexterity: 'bDex',
  luk: 'bLuk',
  luck: 'bLuk',
};

const ELEMENTS: Record<string, string> = {
  neutral: 'Ele_Neutral',
  water: 'Ele_Water',
  earth: 'Ele_Earth',
  fire: 'Ele_Fire',
  wind: 'Ele_Wind',
  poison: 'Ele_Poison',
  holy: 'Ele_Holy',
  shadow: 'Ele_Dark',
  dark: 'Ele_Dark',
  ghost: 'Ele_Ghost',
  undead: 'Ele_Undead',
};

const RACES: Record<string, string> = {
  formless: 'RC_Formless',
  undead: 'RC_Undead',
  brute: 'RC_Brute',
  plant: 'RC_Plant',
  insect: 'RC_Insect',
  fish: 'RC_Fish',
  demon: 'RC_Demon',
  demihuman: 'RC_DemiHuman',
  angel: 'RC_Angel',
  dragon: 'RC_Dragon',
};

const SIZES: Record<string, string> = {
  small: 'Size_Small',
  medium: 'Size_Medium',
  large: 'Size_Large',
};

const STATUSES: Record<string, string> = {
  stun: 'Eff_Stun',
  curse: 'Eff_Curse',
  blind: 'Eff_Blind',
  'stone curse': 'Eff_Stone',
  sleep: 'Eff_Sleep',
  silence: 'Eff_Silence',
  poison: 'Eff_Poison',
  confusion: 'Eff_Confusion',
  freeze: 'Eff_Freeze',
  bleeding: 'Eff_Bleeding',
};

/** Job names the client uses in class conditions → rAthena `Job_` constant. */
const JOBS: Record<string, string> = {
  novice: 'Job_Novice',
  'super novice': 'Job_Super_Novice',
  swordman: 'Job_Swordman',
  mage: 'Job_Mage',
  archer: 'Job_Archer',
  acolyte: 'Job_Acolyte',
  merchant: 'Job_Merchant',
  thief: 'Job_Thief',
  knight: 'Job_Knight',
  priest: 'Job_Priest',
  wizard: 'Job_Wizard',
  blacksmith: 'Job_Blacksmith',
  hunter: 'Job_Hunter',
  assassin: 'Job_Assassin',
  crusader: 'Job_Crusader',
  monk: 'Job_Monk',
  sage: 'Job_Sage',
  rogue: 'Job_Rogue',
  alchemist: 'Job_Alchemist',
  bard: 'Job_Bard',
  dancer: 'Job_Dancer',
};

/** Client spellings that differ from rAthena's skill_db `Description`. */
const SKILL_ALIASES: Record<string, string> = {
  'lord of vermillion': 'lord of vermilion',
  'heavens drive': "heaven's drive",
  'thunder storm': 'thunderstorm',
  'musical strike': 'melody strike',
  'throw arrow': 'slinging arrow',
  'double strafing': 'double strafe',
  'strip armor': 'divest armor',
  'auto guard': 'guard',
  'attention concentrate': 'improve concentration',
  'call spirits': 'summon spirit sphere',
};

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const SIGNED = String.raw`([+-])\s*(\d+)`;

function signed(sign: string, amount: string): number {
  return (sign === '-' ? -1 : 1) * Number(amount);
}

/** "A, B and C" / "A & B" → ["A", "B", "C"]. */
export function splitList(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+and\s+|\s*&\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Looks every name up in `table` (case-insensitively); undefined if any is unknown. */
function lookupAll(names: readonly string[], table: Record<string, string>): string[] | undefined {
  const values: string[] = [];
  for (const name of names) {
    const value = table[name.toLowerCase()];
    if (value === undefined) return undefined;
    values.push(value);
  }
  return values;
}

function lookupSkills(text: string, context: DraftContext): string[] | undefined {
  const skills: string[] = [];
  for (const name of splitList(text.replace(/\s+skills?$/i, ''))) {
    const key = name.toLowerCase();
    const skill = context.skillsByName.get(SKILL_ALIASES[key] ?? key);
    if (skill === undefined) return undefined;
    skills.push(skill);
  }
  return skills;
}

type LineRule = [RegExp, (match: RegExpMatchArray, context: DraftContext) => string[] | undefined];

const each = (values: string[] | undefined, statement: (value: string) => string) =>
  values?.map(statement);

/** Phrase → rAthena script statements. Patterns match the whole normalized line. */
const LINE_RULES: LineRule[] = [
  [
    new RegExp(String.raw`^(STR|AGI|VIT|INT|DEX|LUK)\s*${SIGNED}$`, 'i'),
    (match) => [`bonus ${STATS[match[1]!.toLowerCase()]},${signed(match[2]!, match[3]!)};`],
  ],
  [/^All stats \+\s*(\d+)$/i, (match) => [`bonus bAllStats,${match[1]};`]],
  [
    new RegExp(String.raw`^ATK\s*${SIGNED}$`),
    (match) => [`bonus bBaseAtk,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^ATK\s*${SIGNED}%$`),
    (match) => [`bonus bAtkRate,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^MATK\s*${SIGNED}$`),
    (match) => [`bonus bMatk,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^MATK\s*${SIGNED}%$`),
    (match) => [`bonus bMatkRate,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^DEF\s*${SIGNED}$`),
    (match) => [`bonus bDef,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^MDEF\s*${SIGNED}$`),
    (match) => [`bonus bMdef,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^HIT\s*${SIGNED}$`),
    (match) => [`bonus bHit,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^(?:Add a )?Flee Rate\s*${SIGNED}$`, 'i'),
    (match) => [`bonus bFlee,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^Perfect Dodge\s*${SIGNED}$`, 'i'),
    (match) => [`bonus bFlee2,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^(?:CRIT|Critical Rate)\s*${SIGNED}$`),
    (match) => [`bonus bCritical,${signed(match[1]!, match[2]!)};`],
  ],
  [
    new RegExp(String.raw`^(?:Maximum|Max) (HP|SP)\s*${SIGNED}$`, 'i'),
    (match) => [`bonus bMax${match[1]!.toUpperCase()},${signed(match[2]!, match[3]!)};`],
  ],
  [
    new RegExp(String.raw`^(?:Maximum|Max) (HP|SP)\s*${SIGNED}%$`, 'i'),
    (match) => [`bonus bMax${match[1]!.toUpperCase()}rate,${signed(match[2]!, match[3]!)};`],
  ],
  [
    new RegExp(String.raw`^(?:Additional )?Maximum HP and SP\s*${SIGNED}%$`, 'i'),
    (match) => {
      const amount = signed(match[1]!, match[2]!);
      return [`bonus bMaxHPrate,${amount};`, `bonus bMaxSPrate,${amount};`];
    },
  ],
  [
    new RegExp(String.raw`^(HP|SP) Recovery\s*${SIGNED}%$`, 'i'),
    (match) => [`bonus b${match[1]!.toUpperCase()}recovRate,${signed(match[2]!, match[3]!)};`],
  ],
  [
    new RegExp(String.raw`^HP and SP Recovery\s*${SIGNED}%$`, 'i'),
    (match) => {
      const amount = signed(match[1]!, match[2]!);
      return [`bonus bHPrecovRate,${amount};`, `bonus bSPrecovRate,${amount};`];
    },
  ],
  [
    /^(?:Attack Speed \+\s*|Increases Attack Speed by )(\d+)%$/i,
    (match) => [`bonus bAspdRate,${match[1]};`],
  ],
  [/^Decreases Attack Speed by (\d+)%$/i, (match) => [`bonus bAspdRate,-${match[1]};`]],
  [/^Reduce Cast(?:ing)? Time by (\d+)%$/i, (match) => [`bonus bCastrate,-${match[1]};`]],
  [/^Increase Cast(?:ing)? Time by (\d+)%$/i, (match) => [`bonus bCastrate,${match[1]};`]],
  [
    /^(?:Reduce SP Consumption of skills by (\d+)%|Reduce (\d+)% SP com?s?umption)$/i,
    (match) => [`bonus bUseSPrate,-${match[1] ?? match[2]};`],
  ],
  [/^Movement Speed \+\s*(\d+)%$/i, (match) => [`bonus bSpeedRate,${match[1]};`]],
  [
    /^Inflict (\d+)% more damage with Critical attacks$/i,
    (match) => [`bonus bCritAtkRate,${match[1]};`],
  ],
  [
    /^(?:Ranged Attack Damage \+\s*(\d+)%|Inflict (\d+)% more damage with Long Range Physical attacks?)$/i,
    (match) => [`bonus bLongAtkRate,${match[1] ?? match[2]};`],
  ],
  [
    /^(?:Reduce damage from Long Range attacks by (\d+)%|Receive (\d+)% less damage from Long Range Physical attacks?)$/i,
    (match) => [`bonus bLongAtkDef,${match[1] ?? match[2]};`],
  ],
  [
    /^Increase damage on (\w+) Property (?:monsters?|enemies) by (\d+)%$/i,
    (match) =>
      each(lookupAll([match[1]!], ELEMENTS), (element) => `bonus2 bAddEle,${element},${match[2]};`),
  ],
  [
    /^Increase damage on (.+?) monsters? by (\d+)%$/i,
    (match) =>
      each(
        lookupAll(splitList(match[1]!), RACES),
        (race) => `bonus2 bAddRace,${race},${match[2]};`,
      ),
  ],
  [
    /^Damage \(all types\) \+\s*(\d+)% vs race (\w+)$/i,
    (match) =>
      each(lookupAll([match[2]!], RACES), (race) => `bonus2 bAddRace,${race},${match[1]};`),
  ],
  [
    /^Increase damage inflicted on (\w+) size monsters? by (\d+)%$/i,
    (match) =>
      each(lookupAll([match[1]!], SIZES), (size) => `bonus2 bAddSize,${size},${match[2]};`),
  ],
  [
    /^(?:Critical Rate \+\s*(\d+) on (.+?) monsters?|Add a Critical Rate \+\s*(\d+) to the (.+?) monsters?)$/i,
    (match) =>
      each(
        lookupAll(splitList(match[2] ?? match[4]!), RACES),
        (race) => `bonus2 bCriticalAddRace,${race},${match[1] ?? match[3]};`,
      ),
  ],
  [
    /^(?:Add a (\d+)% resistance against (.+?) Property attacks|(\d+)% Resistance to (\w+) attacks|Increase resistance to (\w+) Property attacks by (\d+)%|Add a resistance against (\w+) Property attacks by (\d+)%)$/i,
    (match) => {
      const amount = match[1] ?? match[3] ?? match[6] ?? match[8];
      const names = match[2] ?? match[4] ?? match[5] ?? match[7];
      return each(
        lookupAll(splitList(names!), ELEMENTS),
        (element) => `bonus2 bSubEle,${element},${amount};`,
      );
    },
  ],
  [
    /^Increase damage from (\w+) Property attacks by (\d+)%$/i,
    (match) =>
      each(
        lookupAll([match[1]!], ELEMENTS),
        (element) => `bonus2 bSubEle,${element},-${match[2]};`,
      ),
  ],
  [
    /^(?:Reduce damage from (.+?) monsters? by (\d+)%|Receive (\d+)% less damage from (.+?) monsters?)$/i,
    (match) => {
      const amount = match[2] ?? match[3];
      const names = (match[1] ?? match[4])!;
      const sizes = /^(.+?) sizes?$/i.exec(names);
      if (sizes) {
        return each(
          lookupAll(splitList(sizes[1]!), SIZES),
          (size) => `bonus2 bSubSize,${size},${amount};`,
        );
      }
      if (/^boss$/i.test(names)) return [`bonus2 bSubClass,Class_Boss,${amount};`];
      return each(
        lookupAll(splitList(names), RACES),
        (race) => `bonus2 bSubRace,${race},${amount};`,
      );
    },
  ],
  [
    /^Receive (\d+)% more damage from normal monsters?$/i,
    (match) => [`bonus2 bSubClass,Class_Normal,-${match[1]};`],
  ],
  [
    /^Receive (\d+)% more Experience Points from (.+?) monsters?$/i,
    (match) =>
      each(
        lookupAll(splitList(match[2]!), RACES),
        (race) => `bonus2 bExpAddRace,${race},${match[1]};`,
      ),
  ],
  [
    /^(?:Inflict (\d+)% more damage with (.+)|Damage \+\s*(\d+)% with (.+))$/i,
    (match, context) =>
      each(
        lookupSkills((match[2] ?? match[4])!, context),
        (skill) => `bonus2 bSkillAtk,"${skill}",${match[1] ?? match[3]};`,
      ),
  ],
  [
    new RegExp(
      String.raw`^Add a ${NUMBER}% chance of auto casting Level (\d+) (.+?) on (?:the|an) (?:enemy|user) when attacking$`,
      'i',
    ),
    (match, context) =>
      each(
        lookupSkills(match[3]!, context),
        (skill) => `bonus3 bAutoSpell,"${skill}",${match[2]},${perMille(match[1]!)};`,
      ),
  ],
  [
    new RegExp(
      String.raw`^Add a ${NUMBER}% chance of auto casting Level (\d+) (.+?)(?: (?:on|around) (?:the|an) (?:enemy|user))? when the user receives Physical Damage$`,
      'i',
    ),
    (match, context) =>
      each(
        lookupSkills(match[3]!, context),
        (skill) => `bonus3 bAutoSpellWhenHit,"${skill}",${match[2]},${perMille(match[1]!)};`,
      ),
  ],
  [
    /^(?:(\w+) an enemy when you attack|Inflict (\w+) status when you attack) \(Success Chance (\d+)%\)$/i,
    (match) =>
      each(
        lookupAll([match[1] ?? match[2]!], STATUSES),
        (status) => `bonus2 bAddEff,${status},${Number(match[3]) * 100};`,
      ),
  ],
  [
    /^Causes (\w+) effect to enemies by (\d+)% chance$/i,
    (match) =>
      each(
        lookupAll([match[1]!], STATUSES),
        (status) => `bonus2 bAddEff,${status},${Number(match[2]) * 100};`,
      ),
  ],
  [
    /^(?:Add a (\d+)% resistance against (.+)|Increase resistance to (.+?) status by (\d+)%)$/i,
    (match) => {
      const amount = Number(match[1] ?? match[4]) * 100;
      return each(
        lookupAll(splitList((match[2] ?? match[3])!), STATUSES),
        (status) => `bonus2 bResEff,${status},${amount};`,
      );
    },
  ],
  [
    /^Gain immunity to the (.+?) status$/i,
    (match) =>
      each(lookupAll([match[1]!], STATUSES), (status) => `bonus2 bResEff,${status},10000;`),
  ],
  [
    /^Drain (\d+) SP from its owner on each attack$/i,
    (match) => [`bonus bSPDrainValue,-${match[1]};`],
  ],
  [
    /^(?:Gain|Restore) (\d+) SP (?:every time when attacking|on every physical attack on enemies)$/i,
    (match) => [`bonus bSPDrainValue,${match[1]};`],
  ],
  [
    /^Gain (\d+) (HP|SP) each time an enemy is killed by a Physical Melee Damage$/i,
    (match) => [`bonus b${match[2]!.toUpperCase()}GainValue,${match[1]};`],
  ],
  [
    /^Enable a (\d+)% chance of gaining (\d+)% of the damage inflicted on an enemy as HP with each attack$/i,
    (match) => [`bonus2 bHPDrainRate,${Number(match[1]) * 10},${match[2]};`],
  ],
  [
    /^Make a weapon indestructible \(except in upgrade attempts\)$/i,
    () => ['bonus bUnbreakableWeapon;'],
  ],
  [
    /^Make an armor indestructible \(except in upgrade attempts\)$/i,
    () => ['bonus bUnbreakableArmor;'],
  ],
  [
    /^(?:Blesses an Armor|Enchant Armors?|Enchant an Armor) with the (\w+) Property$/i,
    (match) => each(lookupAll([match[1]!], ELEMENTS), (element) => `bonus bDefEle,${element};`),
  ],
  [/^(?:Spell|Skill) casting can not be interrupted$/i, () => ['bonus bNoCastCancel;']],
  [
    /^Reflect single target Magic back at the caster \(Success Chance (\d+)%\)$/i,
    (match) => [`bonus bMagicDamageReturn,${match[1]};`],
  ],
  [
    /^Allows its user to use certain skills without spending Gemstones$/i,
    () => ['bonus bNoGemStone;'],
  ],
  [
    /^Increase (STR|AGI|VIT|INT|DEX|LUK) by an amount equal to the refine rate of the equipment this card is compound(?:ed)? on$/i,
    (match) => [`bonus ${STATS[match[1]!.toLowerCase()]},getrefine();`],
  ],
  [
    /^Every (\d+) Base (\w+), you gain (\d+) (\w+)$/i,
    (match) => {
      const from = STATS[match[2]!.toLowerCase()];
      const to = STATS[match[4]!.toLowerCase()];
      if (from === undefined || to === undefined) return undefined;
      return [`bonus ${to},readparam(${from})/${match[1]}*${match[3]};`];
    },
  ],
];

function perMille(percent: string): number {
  return Math.round(Number(percent) * 10);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
}

/** rAthena statements for one client line, or undefined if no phrase matches. */
export function mapLine(text: string, context: DraftContext): string[] | undefined {
  const line = normalize(text);
  for (const [pattern, build] of LINE_RULES) {
    const match = line.match(pattern);
    if (match) {
      const statements = build(match, context);
      if (statements !== undefined) return statements;
    }
  }
  // Lines like "STR + 2, Maximum HP + 5%" join several phrases with commas.
  if (line.includes(', ')) {
    const statements: string[] = [];
    for (const part of line.split(', ')) {
      const mapped = mapLine(part, context);
      if (mapped === undefined) return undefined;
      statements.push(...mapped);
    }
    return statements;
  }
  return undefined;
}

function mapLines(lines: readonly string[], context: DraftContext): string[] {
  return lines.flatMap((line) => mapLine(line, context) ?? [`${TODO_PREFIX}${normalize(line)}`]);
}

type Header =
  | { kind: 'condition'; expression: string }
  | { kind: 'set'; names: string[] }
  | { kind: 'album'; requires: string[]; rightHandOnly: boolean; note?: string }
  | { kind: 'unknown'; text: string };

function classCondition(inner: string): string | undefined {
  const classMatch = /^(.+?) Class$/.exec(inner);
  const names = splitList(classMatch ? classMatch[1]! : inner);
  const jobs = lookupAll(names, JOBS);
  if (jobs === undefined) return undefined;
  // "[X Class]" covers the job tree (rAthena cards use BaseClass for that);
  // a bare job name is only that job.
  const reference = classMatch ? 'BaseClass' : 'BaseJob';
  return jobs.map((job) => `${reference} == ${job}`).join(' || ');
}

export function parseHeader(line: ClientLine): Header | undefined {
  const bracket = /^\[(.*)\]$/.exec(line.text.trim());
  if (!bracket) return undefined;
  const inner = bracket[1]!.trim();

  const set = /^\+\s*(.+) Rune$/.exec(inner);
  if (set) return { kind: 'set', names: splitList(set[1]!) };

  const album = /^\+\s*(.+? Card)( \(Right-Hand only\))?(?:, (.+))?$/.exec(inner);
  if (album) {
    return {
      kind: 'album',
      requires: [album[1]!],
      rightHandOnly: album[2] !== undefined,
      ...(album[3] !== undefined ? { note: album[3] } : {}),
    };
  }

  const refineAtLeast =
    /^(?:Refine Rate|When compounded into an item with refine rate of) \+?(\d+) or higher$/i.exec(
      inner,
    );
  if (refineAtLeast) return { kind: 'condition', expression: `getrefine() >= ${refineAtLeast[1]}` };
  const refineRange = /^When compounded into an item with refine rate of \+?(\d+)~\+?(\d+)$/i.exec(
    inner,
  );
  if (refineRange) {
    const low = Number(refineRange[1]);
    const upper = `getrefine() <= ${refineRange[2]}`;
    return { kind: 'condition', expression: low > 0 ? `getrefine() >= ${low} && ${upper}` : upper };
  }
  const baseStat = /^Base (\w+) >= (\d+)$/i.exec(inner);
  if (baseStat) {
    const stat = STATS[baseStat[1]!.toLowerCase()];
    if (stat !== undefined)
      return { kind: 'condition', expression: `readparam(${stat}) >= ${baseStat[2]}` };
  }
  const job = classCondition(inner);
  if (job !== undefined) return { kind: 'condition', expression: job };

  return { kind: 'unknown', text: inner };
}

/** Parses the client's `tbl = { [id] = { ... }, ... }` and keeps the 39xxx items named "… Rune". */
export function parseClientRunes(luaText: string): ClientRune[] {
  const runes: ClientRune[] = [];
  const entryPattern = /\[(\d+)\] = \{([\s\S]*?)\n\t\},?/g;
  for (const entry of luaText.matchAll(entryPattern)) {
    const id = Number(entry[1]);
    if (id < RUNE_ID_MIN || id > RUNE_ID_MAX) continue;
    const body = entry[2]!;
    const name = /\bidentifiedDisplayName = "([^"]*)"/.exec(body)?.[1];
    if (name === undefined || !name.endsWith(' Rune')) continue;
    // The leading tab keeps "unidentifiedDescriptionName" from matching.
    const description = /\tidentifiedDescriptionName = \{([\s\S]*?)\n\t\t\}/.exec(body)?.[1] ?? '';
    const lines = [...description.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((quoted) => {
      const raw = quoted[1]!.replace(/\\(.)/g, '$1');
      return { text: raw.replace(/\^[0-9A-Fa-f]{6}/g, '').trim(), grey: raw.includes(GREY) };
    });
    runes.push({ id, name, lines });
  }
  return runes;
}

export function draftRune(rune: ClientRune, context: DraftContext): DraftRune {
  let location: RuneLocation | undefined;
  const source: ClientLine[] = [];
  // Effect lines grouped under the header that precedes them, until the next header.
  const sections: { header: Header | undefined; lines: string[] }[] = [
    { header: undefined, lines: [] },
  ];
  for (const line of rune.lines) {
    if (line.text === '' || /^Weight:/i.test(line.text)) continue;
    source.push(line);
    const compound = /^Compound on:\s*(.+)$/i.exec(line.text);
    if (compound) {
      location = LOCATIONS[compound[1]!.trim().toLowerCase()];
      continue;
    }
    const header = parseHeader(line);
    if (header !== undefined) sections.push({ header, lines: [] });
    else sections.at(-1)!.lines.push(line.text);
  }

  const script: string[] = [];
  const sets: DraftSet[] = [];
  const album: DraftAlbum[] = [];
  for (const { header, lines } of sections) {
    const mapped = mapLines(lines, context);
    if (header === undefined) {
      script.push(...mapped);
    } else if (header.kind === 'condition') {
      script.push(
        `if (${header.expression}) {`,
        ...mapped.map((statement) => `  ${statement}`),
        '}',
      );
    } else if (header.kind === 'set') {
      const requires: number[] = [];
      const unknown: string[] = [];
      for (const name of header.names) {
        const id = context.runeIdsByName.get(name.toLowerCase());
        if (id === undefined) unknown.push(name);
        else requires.push(id);
      }
      const todos = unknown.map((name) => `${TODO_PREFIX}unknown rune "${name} Rune" in this set`);
      sets.push({ requires, names: header.names, script: [...todos, ...mapped] });
    } else if (header.kind === 'album') {
      album.push({
        requires: header.requires,
        rightHandOnly: header.rightHandOnly,
        ...(header.note !== undefined ? { note: header.note } : {}),
        script: mapped,
      });
    } else {
      script.push(
        `${TODO_PREFIX}condition [${header.text}]`,
        ...mapped.map((statement) => `  ${statement}`),
      );
    }
  }
  if (location === undefined) script.unshift(`${TODO_PREFIX}no "Compound on" location`);
  return { id: rune.id, name: rune.name, location, script, sets, album, source };
}

export function countTodos(drafts: readonly DraftRune[]): number {
  const isTodo = (line: string) => line.trim().startsWith(TODO_PREFIX);
  return drafts.reduce(
    (total, draft) =>
      total +
      draft.script.filter(isTodo).length +
      draft.sets.reduce((sum, set) => sum + set.script.filter(isTodo).length, 0) +
      draft.album.reduce((sum, entry) => sum + entry.script.filter(isTodo).length, 0),
    0,
  );
}

/** YAML double-quoted scalar; JSON string syntax is valid YAML. */
const quote = (text: string) => JSON.stringify(text);

function renderScript(lines: readonly string[], indent: string): string[] {
  if (lines.length === 0) return [`${indent}Script: ''`];
  return [`${indent}Script: |`, ...lines.map((line) => `${indent}  ${line}`)];
}

export function renderRunesYaml(drafts: readonly DraftRune[], sourceLabel: string): string {
  const out: string[] = [
    `# ccRO runes. Drafted once by data-pipeline/tools/draft-runes.ts from ${sourceLabel};`,
    '# hand-maintained from then on. See data-overrides/README.md.',
    '#',
    '# Each entry: Id and Name (client), Location, Reviewed, Script (rAthena item',
    '# script, run in the context of the item the rune sits in), Sets (bonuses',
    '# that need other runes equipped too) and Album (card album effects, phase 8).',
    '# The comment above each entry is the client text it was drafted from.',
    '# `# TODO:` lines are client text the draft could not map; resolve them and',
    '# set Reviewed: true. The pipeline rejects a reviewed rune with a TODO left.',
    'Runes:',
  ];
  for (const draft of drafts) {
    out.push('');
    out.push(`  # ${draft.id} ${draft.name}`);
    for (const line of draft.source) out.push(`  #   ${line.grey ? '(grey) ' : ''}${line.text}`);
    out.push(`  - Id: ${draft.id}`);
    out.push(`    Name: ${quote(draft.name)}`);
    out.push(`    Location: ${draft.location ?? "''"}`);
    out.push('    Reviewed: false');
    out.push(...renderScript(draft.script, '    '));
    if (draft.sets.length > 0) {
      out.push('    Sets:');
      for (const set of draft.sets) {
        out.push(`      - Requires: [${set.requires.join(', ')}] # ${set.names.join(', ')}`);
        out.push(...renderScript(set.script, '        '));
      }
    }
    if (draft.album.length > 0) {
      out.push('    Album:');
      for (const entry of draft.album) {
        out.push(`      - Requires: [${entry.requires.map(quote).join(', ')}]`);
        if (entry.rightHandOnly) out.push('        RightHandOnly: true');
        if (entry.note !== undefined) out.push(`        Note: ${quote(entry.note)}`);
        out.push(...renderScript(entry.script, '        '));
      }
    }
  }
  return `${out.join('\n')}\n`;
}

export function buildContext(
  runes: readonly ClientRune[],
  skills: readonly { name: string; description: string }[],
): DraftContext {
  const runeIdsByName = new Map(
    runes.map((rune) => [rune.name.replace(/ Rune$/, '').toLowerCase(), rune.id] as const),
  );
  const skillsByName = new Map<string, string>();
  for (const skill of skills) {
    const key = skill.description.toLowerCase();
    // Keep the first (lowest id) skill when several share a description.
    if (!skillsByName.has(key)) skillsByName.set(key, skill.name);
  }
  return { runeIdsByName, skillsByName };
}

function main(args: readonly string[]): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const itemInfoPath = args.find(
    (arg, index) =>
      !arg.startsWith('--') && args[index - 1] !== '--rathena' && args[index - 1] !== '--out',
  );
  if (itemInfoPath === undefined) {
    throw new Error(
      'Usage: draft-runes.ts <itemInfo.lua> [--rathena <dir>] [--out <file>] [--force]',
    );
  }
  const outIndex = args.indexOf('--out');
  const outPath =
    outIndex === -1
      ? path.join(repoRoot, 'data-overrides', 'runes.yml')
      : path.resolve(args[outIndex + 1]!);
  if (existsSync(outPath) && !args.includes('--force')) {
    throw new Error(`${outPath} exists and may hold reviewed runes; pass --force to overwrite it.`);
  }

  const rathenaDir = resolveRathenaDir(args, process.env, repoRoot);
  const skills = loadDb(rathenaDir, `${PRE_RE_DIR}/skill_db.yml`).body.flatMap((entry) =>
    typeof entry.Name === 'string' && typeof entry.Description === 'string'
      ? [{ name: entry.Name, description: entry.Description }]
      : [],
  );
  // The client file is single-byte encoded; rune text is ASCII.
  const runes = parseClientRunes(readFileSync(itemInfoPath, 'latin1'));
  const context = buildContext(runes, skills);
  const drafts = runes.map((rune) => draftRune(rune, context));
  writeFileSync(outPath, renderRunesYaml(drafts, path.basename(itemInfoPath)));
  console.log(`Runes: ${drafts.length}, TODO lines: ${countTodos(drafts)}`);
  console.log(`  wrote ${path.relative(repoRoot, outPath)}`);
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}
