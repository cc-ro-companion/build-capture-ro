import { describe, expect, it } from 'vitest';
import type { Item, ScriptStmt } from '../data/types';
import { defaultBuild, type Build } from './model';
import { groupNotes, noteCount, noteText, notModelledCount, notModelledNotes } from './notModelled';
import { createGameData, gameData, resolveBuild, type GameData } from './resolve';

const SWORDMAN = 1;

function notesFor(equipment: Build['equipment'], data: GameData = gameData) {
  return notModelledNotes(resolveBuild({ ...defaultBuild(), job: SWORDMAN, equipment }, data));
}

describe('notModelledNotes (shipped data)', () => {
  it('names a parsed bonus the engine does not compute: Sunglasses (2201) bResEff', () => {
    const notes = notesFor({ headMid: { item: 2201, refine: 0 } });
    expect(notes.headMid).toEqual({ labels: ['status resistance'] });
    expect(noteText(notes.headMid!)).toBe('Not modelled: status resistance.');
  });

  it('lists a granted skill: Ice Falchion (1131), whose weapon element now applies', () => {
    const notes = notesFor({ rightHand: { item: 1131, refine: 0 } });
    expect(notes.rightHand?.labels).toEqual([
      'status chance on attack',
      'status chance on self when attacking',
      'autocast on attack',
      'grants skill MG_COLDBOLT Lv 3',
    ]);
    const resolved = resolveBuild(
      { ...defaultBuild(), job: SWORDMAN, equipment: { rightHand: { item: 1131, refine: 0 } } },
      gameData,
    );
    expect(resolved.character.bonuses.last('bAtkEle')).toBeDefined();
  });

  it('lists an autobonus: Nemesis (1541)', () => {
    const notes = notesFor({ rightHand: { item: 1541, refine: 0 } });
    expect(notes.rightHand?.labels).toContain('temporary bonus on attack');
  });

  it('applies AGI from Fricco’s Shoes (2417) and notes its potion healing', () => {
    const equipment = { shoes: { item: 2417, refine: 0 } };
    expect(notesFor(equipment).shoes).toEqual({ labels: ['item group healing %'] });
    const resolved = resolveBuild({ ...defaultBuild(), job: SWORDMAN, equipment }, gameData);
    expect(resolved.character.equipmentStats.agi).toBe(2);
  });

  it('reports an unsupported script as one effect', () => {
    const shirt = gameData.items.get(2301) as Item;
    const data = createGameData({
      jobs: [...gameData.jobs.values()],
      items: [{ ...shirt, effects: null, unsupported: 'command "callfunc"' }],
      monsters: [],
      statPoints: gameData.statPoints,
      tables: gameData.tables,
      names: { items: {}, monsters: {}, jobs: {}, runes: {} },
    });
    const notes = notesFor({ armor: { item: 2301, refine: 0 } }, data);
    expect(notes.armor).toEqual({ unsupported: 'command "callfunc"', labels: [] });
    expect(noteText(notes.armor!)).toBe(
      'Script not read (command "callfunc"); none of its effects are applied.',
    );
    expect(notModelledCount(notes)).toBe(1);
  });

  it('has no note for items whose bonuses are all computed: Ring (2601) bStr', () => {
    expect(notesFor({ accessoryLeft: { item: 2601, refine: 0 } })).toEqual({});
  });

  it('counts every note across slots', () => {
    const notes = notesFor({
      headMid: { item: 2201, refine: 0 },
      rightHand: { item: 1131, refine: 0 },
      accessoryLeft: { item: 2601, refine: 0 },
    });
    expect(Object.keys(notes).sort()).toEqual(['headMid', 'rightHand']);
    // Sunglasses: 1, Ice Falchion: 4.
    expect(notModelledCount(notes)).toBe(5);
  });
});

describe('notModelledNotes with conditional bonuses', () => {
  const shirt = gameData.items.get(2301) as Item;
  const refineGated: ScriptStmt[] = [
    {
      k: 'if',
      cond: {
        k: 'op',
        op: '>=',
        args: [
          { k: 'call', fn: 'getrefine', args: [] },
          { k: 'num', v: 7 },
        ],
      },
      then: [
        {
          k: 'bonus',
          name: 'bSPDrainRate',
          args: [
            { k: 'num', v: 1 },
            { k: 'num', v: 5 },
          ],
        },
        { k: 'bonus', name: 'bMdef', args: [{ k: 'num', v: 1 }] },
      ],
      else: [],
    },
  ];
  const data = createGameData({
    jobs: [...gameData.jobs.values()],
    items: [{ ...shirt, effects: refineGated }],
    monsters: [],
    statPoints: gameData.statPoints,
    tables: gameData.tables,
    names: { items: {}, monsters: {}, jobs: {}, runes: {} },
  });

  it('shows a bonus only once its condition holds for the build', () => {
    expect(notesFor({ armor: { item: 2301, refine: 6 } }, data)).toEqual({});
    expect(notesFor({ armor: { item: 2301, refine: 7 } }, data)).toEqual({
      armor: { labels: ['SP drain'] },
    });
  });

  it('notes each slot by its own evaluation when one item fills two slots', () => {
    const ASSASSIN = 12;
    const knife = gameData.items.get(1201) as Item;
    const knifeData = createGameData({
      jobs: [...gameData.jobs.values()],
      items: [{ ...knife, effects: refineGated }],
      monsters: [],
      statPoints: gameData.statPoints,
      tables: gameData.tables,
      names: { items: {}, monsters: {}, jobs: {}, runes: {} },
    });
    const equipment = { rightHand: { item: 1201, refine: 0 }, leftHand: { item: 1201, refine: 7 } };
    const notes = notModelledNotes(
      resolveBuild({ ...defaultBuild(), job: ASSASSIN, equipment }, knifeData),
    );
    expect(notes).toEqual({ leftHand: { labels: ['SP drain'] } });
  });

  function shirtWith(effects: ScriptStmt[]): GameData {
    return createGameData({
      jobs: [...gameData.jobs.values()],
      items: [{ ...shirt, effects }],
      monsters: [],
      statPoints: gameData.statPoints,
      tables: gameData.tables,
      names: { items: {}, monsters: {}, jobs: {}, runes: {} },
    });
  }

  it('notes a script that reads a skill level, which is 0 until skills exist', () => {
    // if (getskilllv("SM_SWORD") == 10) bonus bMdef,1;
    const skillGated: ScriptStmt[] = [
      {
        k: 'if',
        cond: {
          k: 'op',
          op: '==',
          args: [
            { k: 'call', fn: 'getskilllv', args: [{ k: 'str', v: 'SM_SWORD' }] },
            { k: 'num', v: 10 },
          ],
        },
        then: [{ k: 'bonus', name: 'bMdef', args: [{ k: 'num', v: 1 }] }],
        else: [],
      },
    ];
    expect(notesFor({ armor: { item: 2301, refine: 0 } }, shirtWith(skillGated))).toEqual({
      armor: { labels: ['effects that depend on skill levels'] },
    });
  });

  it('notes a script that stops early at a runtime error', () => {
    // bonus bMdef,1; bonus bMdef,1/0;
    const stopsEarly: ScriptStmt[] = [
      { k: 'bonus', name: 'bMdef', args: [{ k: 'num', v: 1 }] },
      {
        k: 'bonus',
        name: 'bMdef',
        args: [
          {
            k: 'op',
            op: '/',
            args: [
              { k: 'num', v: 1 },
              { k: 'num', v: 0 },
            ],
          },
        ],
      },
    ];
    const notes = notesFor({ armor: { item: 2301, refine: 0 } }, shirtWith(stopsEarly));
    expect(notes.armor?.labels).toHaveLength(1);
    expect(notes.armor?.labels[0]).toMatch(/^effects after a script error \(.+\)$/);
  });
});

describe('notes for runes, rune sets and combos (shipped data)', () => {
  const resolve = (job: number, equipment: Build['equipment']) =>
    resolveBuild({ ...defaultBuild(), job, equipment }, gameData);

  const runeNamed = (name: string) =>
    gameData.runeList.find((rune) => gameData.names.runes[rune.id] === name)!.id;
  // Blind an enemy when you attack (Success Chance 5%): bAddEff, not computed.
  const familiar = runeNamed('Familiar Rune');

  it('notes a rune’s not-modelled bonus at the item it sits in', () => {
    const resolved = resolve(SWORDMAN, { rightHand: { item: 1101, refine: 0, runes: [familiar] } });
    expect(notModelledNotes(resolved).rightHand?.labels).toContain('status chance on attack');
  });

  it('keeps the notes of a rune whose host item’s script is unread', () => {
    const sword = gameData.items.get(1101) as Item;
    const data = createGameData({
      jobs: [...gameData.jobs.values()],
      items: [{ ...sword, effects: null, unsupported: 'command "callfunc"' }],
      runes: [...gameData.runes.values()],
      monsters: [],
      statPoints: gameData.statPoints,
      tables: gameData.tables,
      names: gameData.names,
    });
    const resolved = resolveBuild(
      {
        ...defaultBuild(),
        job: SWORDMAN,
        equipment: { rightHand: { item: 1101, refine: 0, runes: [familiar] } },
      },
      data,
    );
    const note = notModelledNotes(resolved).rightHand!;
    expect(note).toEqual({
      unsupported: 'command "callfunc"',
      labels: ['status chance on attack'],
    });
    expect(noteCount(note)).toBe(2);
    expect(noteText(note)).toBe(
      'Script not read (command "callfunc"); none of its effects are applied. ' +
        'Not modelled: status chance on attack.',
    );
  });

  it('lists an unread combo apart and counts it once', () => {
    // Soul Staff (1472) + Spiritual Ring (2677): getequiprefinerycnt is outside the subset.
    const resolved = resolve(2, {
      rightHand: { item: 1472, refine: 0 },
      accessoryLeft: { item: 2677, refine: 0 },
    });
    const groups = groupNotes(resolved, gameData);
    expect(groups).toEqual([
      {
        kind: 'combo',
        name: 'Soul Staff + Spiritual Ring',
        unsupported: 'function "getequiprefinerycnt"',
        labels: [],
      },
    ]);
    expect(notModelledCount({}, groups)).toBe(1);
  });

  it('names an active rune set and keeps its notes out of the host slot', () => {
    const owner = gameData.runeList.find(
      (rune) => rune.sets.length > 0 && rune.location === 'Weapon',
    )!;
    const required = owner.sets[0]!.requires.map((id) => gameData.runes.get(id)!);
    const equipment: Build['equipment'] = {
      rightHand: { item: 1201, refine: 0, runes: [owner.id] },
    };
    // Every required rune goes into a fitting slot of a fresh item, else the set cannot be shown.
    const hosts: Partial<Record<string, { slot: keyof Build['equipment']; item: number }>> = {
      Weapon: { slot: 'leftHand', item: 1204 },
      Footgear: { slot: 'shoes', item: 2403 },
      Armor: { slot: 'armor', item: 2303 },
      Garment: { slot: 'garment', item: 2503 },
      Accessory: { slot: 'accessoryLeft', item: 2601 },
      Headgear: { slot: 'headTop', item: 2224 },
    };
    for (const rune of required) {
      const host = hosts[rune.location]!;
      const entry = equipment[host.slot] ?? { item: host.item, refine: 0, runes: [] };
      equipment[host.slot] = { ...entry, runes: [...(entry.runes ?? []), rune.id] };
    }
    const resolved = resolve(12, equipment);
    const groups = groupNotes(resolved, gameData);
    expect(groups.map((group) => group.kind)).toEqual(['runeSet']);
    expect(groups[0]!.name).toBe(
      `${gameData.names.runes[owner.id]} with ${required.map((rune) => gameData.names.runes[rune.id]).join(', ')}`,
    );
  });
});
