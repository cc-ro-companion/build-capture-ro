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

  it('reports an unsupported script as one effect: Ice Falchion (1131)', () => {
    const notes = notesFor({ rightHand: { item: 1131, refine: 0 } });
    expect(notes.rightHand).toEqual({ unsupported: 'command "skill"', labels: [] });
    expect(noteText(notes.rightHand!)).toBe(
      'Script not read (command "skill"); none of its effects are applied.',
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
    expect(notModelledCount(notes)).toBe(2);
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
