import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseScript } from '../script/parser.ts';
import {
  buildContext,
  countTodos,
  draftRune,
  mapLine,
  parseClientRunes,
  renderRunesYaml,
  type DraftContext,
} from './draft-runes.ts';

// Entries shaped like the client's itemInfo: tab indentation, colour codes,
// an unidentified description before the identified one.
const CLIENT_TEXT = `tbl = {
\t[2101] = {
\t\tunidentifiedDisplayName = "Guard",
\t\tidentifiedDisplayName = "Guard",
\t\tidentifiedDescriptionName = { "Not a rune" },
\t\tslotCount = 1,
\t\tClassNum = 0
\t},
\t[39101] = {
\t\tunidentifiedDisplayName = "Anacondaq Rune",
\t\tunidentifiedResourceName = "39501",
\t\tunidentifiedDescriptionName = { "" },
\t\tidentifiedDisplayName = "Anacondaq Rune",
\t\tidentifiedResourceName = "39501",
\t\tidentifiedDescriptionName = {
\t\t\t"Increase damage on Poison Property monster by 20%.",
\t\t\t"Compound on:^6600FF Weapon^000000",
\t\t\t"Weight:^009900 1^000000"
\t\t},
\t\tslotCount = 0,
\t\tClassNum = 0
\t},
\t[39103] = {
\t\tunidentifiedDisplayName = "Andre Larva Rune",
\t\tidentifiedDisplayName = "Andre Larva Rune",
\t\tidentifiedDescriptionName = {
\t\t\t"INT + 1",
\t\t\t"Maximum SP + 10",
\t\t\t"^808080[+Beholder Card (Right-Hand only), except with Bowling Bash]^000000",
\t\t\t"Reduce Cast Time by 5%",
\t\t\t"Compound on:^6600FF Weapon^000000",
\t\t\t"Weight:^009900 1^000000"
\t\t},
\t\tslotCount = 0,
\t\tClassNum = 0
\t},
\t[39331] = {
\t\tidentifiedDisplayName = "Solider Rune",
\t\tidentifiedDescriptionName = {
\t\t\t"Flee Rate + 5",
\t\t\t"[+ Assaulter & Seal Rune]",
\t\t\t"Add a 0.3% chance of auto casting Level 1 Weapon Perfection on the enemy when attacking.",
\t\t\t"[Swordman, Merchant Class]",
\t\t\t"STR + 2, Maximum HP + 5%",
\t\t\t"[When compounded into an item with refine rate of 0~4]",
\t\t\t"Add a 5% chance of gaining 'Red Potion' item each time a monster is killed.",
\t\t\t"Compound on:^6600FF Shoes^000000"
\t\t},
\t\tslotCount = 0
\t},
\t[39105] = {
\t\tidentifiedDisplayName = "Assaulter Rune",
\t\tidentifiedDescriptionName = {
\t\t\t"[Rogue]",
\t\t\t"Every 18 Base STR, you gain 1 INT.",
\t\t\t"Compound on:^6600FF Accessory^000000"
\t\t},
\t\tslotCount = 0
\t},
}
`;

const SKILLS = [
  { name: 'BS_WEAPONPERFECT', description: 'Weapon Perfection' },
  { name: 'MC_MAMMONITE', description: 'Mammonite' },
  { name: 'WZ_VERMILION', description: 'Lord of Vermilion' },
  { name: 'WZ_HEAVENDRIVE', description: "Heaven's Drive" },
  { name: 'AL_HEAL', description: 'Heal' },
  { name: 'AL_HEAL_DUPLICATE', description: 'Heal' },
];

const runes = parseClientRunes(CLIENT_TEXT);
const context: DraftContext = buildContext(runes, SKILLS);

describe('parseClientRunes', () => {
  it('keeps 39xxx items named "… Rune", in file order', () => {
    expect(runes.map((rune) => rune.id)).toEqual([39101, 39103, 39331, 39105]);
  });

  it('reads the identified description, strips colours and marks grey lines', () => {
    expect(runes[1]!.lines).toEqual([
      { text: 'INT + 1', grey: false },
      { text: 'Maximum SP + 10', grey: false },
      { text: '[+Beholder Card (Right-Hand only), except with Bowling Bash]', grey: true },
      { text: 'Reduce Cast Time by 5%', grey: false },
      { text: 'Compound on: Weapon', grey: false },
      { text: 'Weight: 1', grey: false },
    ]);
  });
});

describe('mapLine', () => {
  it.each([
    ['STR + 10', ['bonus bStr,10;']],
    ['VIT -3', ['bonus bVit,-3;']],
    ['ATK + 30', ['bonus bBaseAtk,30;']],
    ['ATK + 10%, MATK + 10%', ['bonus bAtkRate,10;', 'bonus bMatkRate,10;']],
    ['All stats + 1, MATK + 15', ['bonus bAllStats,1;', 'bonus bMatk,15;']],
    ['Flee Rate + 3', ['bonus bFlee,3;']],
    ['Perfect Dodge + 5', ['bonus bFlee2,5;']],
    ['Maximum HP + 20%', ['bonus bMaxHPrate,20;']],
    ['Max SP + 100', ['bonus bMaxSP,100;']],
    ['Maximum HP and SP - 2%', ['bonus bMaxHPrate,-2;', 'bonus bMaxSPrate,-2;']],
    ['Reduce Casting Time by 10%.', ['bonus bCastrate,-10;']],
    ['Increase damage on Poison Property monster by 20%.', ['bonus2 bAddEle,Ele_Poison,20;']],
    ['Increase damage on Undead monster by 5%.', ['bonus2 bAddRace,RC_Undead,5;']],
    ['Increase damage inflicted on Small size monster by 15%.', ['bonus2 bAddSize,Size_Small,15;']],
    [
      'Critical Rate + 9 on Demon and Undead monster.',
      ['bonus2 bCriticalAddRace,RC_Demon,9;', 'bonus2 bCriticalAddRace,RC_Undead,9;'],
    ],
    [
      'Add a 10% resistance against Shadow and Undead Property attacks.',
      ['bonus2 bSubEle,Ele_Dark,10;', 'bonus2 bSubEle,Ele_Undead,10;'],
    ],
    [
      'Reduce damage from Small, Medium and Large size monsters by 5%.',
      [
        'bonus2 bSubSize,Size_Small,5;',
        'bonus2 bSubSize,Size_Medium,5;',
        'bonus2 bSubSize,Size_Large,5;',
      ],
    ],
    ['Receive 10% less damage from Boss monster.', ['bonus2 bSubClass,Class_Boss,10;']],
    [
      'Inflict 10% more damage with Heavens Drive and Lord of Vermillion.',
      ['bonus2 bSkillAtk,"WZ_HEAVENDRIVE",10;', 'bonus2 bSkillAtk,"WZ_VERMILION",10;'],
    ],
    [
      'Add a 0.3% chance of auto casting Level 1 Weapon Perfection on the enemy when attacking.',
      ['bonus3 bAutoSpell,"BS_WEAPONPERFECT",1,3;'],
    ],
    [
      'Add a 5% chance of auto casting Level 3 Heal on the user when the user receives Physical Damage.',
      ['bonus3 bAutoSpellWhenHit,"AL_HEAL",3,50;'],
    ],
    ['Blind an enemy when you attack (Success Chance 5%).', ['bonus2 bAddEff,Eff_Blind,500;']],
    ['Gain immunity to the Stone Curse status.', ['bonus2 bResEff,Eff_Stone,10000;']],
    ['Drain 1 SP from its owner on each attack.', ['bonus bSPDrainValue,-1;']],
    ['Enchant Armors with the Shadow Property.', ['bonus bDefEle,Ele_Dark;']],
    [
      'Increase INT by an amount equal to the refine rate of the equipment this card is compounded on.',
      ['bonus bInt,getrefine();'],
    ],
    ['Every 18 Base STR, you gain 1 INT.', ['bonus bInt,readparam(bStr)/18*1;']],
  ])('%s', (text, expected) => {
    expect(mapLine(text, context)).toEqual(expected);
  });

  it.each([
    'AGI + 5, Critical Rate + 3%',
    'Inflict 10% more damage with Fire, Cold and Lightning Bolt skill.',
    "Add a 5% chance of gaining 'Red Potion' item each time a monster is killed.",
    'Increase damage on Space monster by 5%.',
  ])('leaves "%s" unmapped', (text) => {
    expect(mapLine(text, context)).toBeUndefined();
  });
});

describe('draftRune', () => {
  it('maps location, plain lines and album headers', () => {
    const draft = draftRune(runes[1]!, context);
    expect(draft.location).toBe('Weapon');
    expect(draft.script).toEqual(['bonus bInt,1;', 'bonus bMaxSP,10;']);
    expect(draft.album).toEqual([
      {
        requires: ['Beholder Card'],
        rightHandOnly: true,
        note: 'except with Bowling Bash',
        script: ['bonus bCastrate,-5;'],
      },
    ]);
    expect(draft.source.some((line) => line.text.startsWith('Weight'))).toBe(false);
  });

  it('scopes each header to the lines up to the next header', () => {
    const draft = draftRune(runes[2]!, context);
    expect(draft.location).toBe('Footgear');
    expect(draft.script).toEqual([
      'bonus bFlee,5;',
      'if (BaseClass == Job_Swordman || BaseClass == Job_Merchant) {',
      '  bonus bStr,2;',
      '  bonus bMaxHPrate,5;',
      '}',
      'if (getrefine() <= 4) {',
      "  # TODO: Add a 5% chance of gaining 'Red Potion' item each time a monster is killed",
      '}',
    ]);
    expect(draft.sets).toEqual([
      {
        requires: [39105],
        names: ['Assaulter', 'Seal'],
        script: [
          '# TODO: unknown rune "Seal Rune" in this set',
          'bonus3 bAutoSpell,"BS_WEAPONPERFECT",1,3;',
        ],
      },
    ]);
  });

  it('uses BaseJob for a bare job name', () => {
    expect(draftRune(runes[3]!, context).script).toEqual([
      'if (BaseJob == Job_Rogue) {',
      '  bonus bInt,readparam(bStr)/18*1;',
      '}',
    ]);
  });
});

describe('renderRunesYaml', () => {
  const drafts = runes.map((rune) => draftRune(rune, context));
  const yaml = renderRunesYaml(drafts, 'itemInfo.lua');

  it('writes YAML whose scripts parse once TODO lines are dropped', () => {
    const document = parse(yaml) as { Runes: Record<string, unknown>[] };
    expect(document.Runes.map((rune) => rune.Id)).toEqual([39101, 39103, 39331, 39105]);
    const solider = document.Runes[2]!;
    expect(solider).toMatchObject({ Location: 'Footgear', Reviewed: false });
    expect(solider.Sets).toEqual([{ Requires: [39105], Script: expect.any(String) }]);
    const scripts = document.Runes.flatMap((rune) => [
      rune.Script as string,
      ...((rune.Sets ?? []) as { Script: string }[]).map((set) => set.Script),
      ...((rune.Album ?? []) as { Script: string }[]).map((entry) => entry.Script),
    ]);
    for (const script of scripts) {
      const withoutTodos = script
        .split('\n')
        .filter((line) => !line.trim().startsWith('# TODO:'))
        .join('\n');
      expect(parseScript(withoutTodos).ok).toBe(true);
    }
  });

  it('keeps the client text as a comment above each entry', () => {
    expect(yaml).toContain(
      '  # 39103 Andre Larva Rune\n  #   INT + 1\n  #   Maximum SP + 10\n' +
        '  #   (grey) [+Beholder Card (Right-Hand only), except with Bowling Bash]\n',
    );
  });

  it('counts TODO lines across scripts, sets and album', () => {
    expect(countTodos(drafts)).toBe(2);
  });
});
