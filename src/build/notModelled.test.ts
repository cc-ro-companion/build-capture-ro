import { describe, expect, it } from 'vitest';
import type { Item, ScriptStmt } from '../data/types';
import { defaultBuild, type Build } from './model';
import { noteText, notModelledCount, notModelledNotes } from './notModelled';
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
      names: { items: {}, monsters: {}, jobs: {} },
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
    names: { items: {}, monsters: {}, jobs: {} },
  });

  it('shows a bonus only once its condition holds for the build', () => {
    expect(notesFor({ armor: { item: 2301, refine: 6 } }, data)).toEqual({});
    expect(notesFor({ armor: { item: 2301, refine: 7 } }, data)).toEqual({
      armor: { labels: ['SP drain'] },
    });
  });
});
