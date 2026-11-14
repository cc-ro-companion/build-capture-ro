// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultBuild } from '../build/model';
import { createGameData, gameData } from '../build/resolve';
import { dataMeta } from '../data';
import { rAthenaDefaults } from '../engine/config';
import { BuildState } from './build.svelte';
import EquipmentPanel from './EquipmentPanel.svelte';

afterEach(cleanup);

const ANDRE_LARVA = 39103;

/** The shipped data with one rune turned back into an unreviewed draft. */
const draftData = createGameData({
  jobs: [...gameData.jobs.values()],
  items: gameData.itemList,
  monsters: gameData.monsterList,
  runes: gameData.runeList.map((rune) =>
    rune.id === ANDRE_LARVA ? { ...rune, reviewed: false } : rune,
  ),
  combos: gameData.combos,
  statPoints: gameData.statPoints,
  tables: gameData.tables,
  names: gameData.names,
});

describe('EquipmentPanel', () => {
  it('marks an unreviewed rune with a draft badge, and only that one', () => {
    const planner = new BuildState({
      data: draftData,
      config: rAthenaDefaults,
      version: { hash: dataMeta.hash, label: dataMeta.label },
      storage: null,
      sharedCode: null,
      confirmReplace: () => true,
    });
    planner.build = {
      ...defaultBuild(),
      job: 12,
      baseLevel: 99,
      equipment: { rightHand: { item: 1201, refine: 0, runes: [ANDRE_LARVA, 39101] } },
    };
    render(EquipmentPanel, { props: { planner } });
    const runes = screen.getByTestId('runes-rightHand');
    expect(within(runes).getAllByText('draft')).toHaveLength(1);
    expect(runes.textContent).toMatch(/Andre Larva Rune\s*draft/);
  });
});
