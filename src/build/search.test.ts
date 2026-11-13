import { describe, expect, it } from 'vitest';
import type { Item } from '../data/types';
import { canEquip, createGameData, gameData } from './resolve';
import { MAX_RESULTS, searchMonsters, searchWeapons } from './search';

const SWORDMAN = 1;
const MAGE = 2;

describe('searchWeapons (shipped data)', () => {
  it('only lists weapons the job can equip at the base level', () => {
    for (const [jobId, baseLevel] of [
      [SWORDMAN, 1],
      [SWORDMAN, 99],
      [MAGE, 50],
    ] as const) {
      const all = gameData.weapons.filter(
        (item) => !item.hidden && canEquip(item, jobId, baseLevel),
      );
      const result = searchWeapons('', jobId, baseLevel, gameData);
      expect(result.total).toBe(all.length);
      for (const item of result.matches) {
        expect(item.jobs).toContain(jobId);
        expect(item.equipLevelMin).toBeLessThanOrEqual(baseLevel);
      }
    }
  });

  it('hides Sword (equip level 2) at base level 1 and shows it at 2', () => {
    const ids = (baseLevel: number) =>
      searchWeapons('sword', SWORDMAN, baseLevel, gameData).matches.map((item) => item.id);
    expect(ids(1)).not.toContain(1101);
    expect(ids(2)).toContain(1101);
  });

  it('does not offer swords to a Mage', () => {
    expect(searchWeapons('1101', MAGE, 50, gameData).total).toBe(0);
  });

  it('matches name, aegis name and id, ignoring case', () => {
    expect(searchWeapons('SWORD', SWORDMAN, 50, gameData).matches.map((i) => i.id)).toContain(1101);
    expect(searchWeapons('1101', SWORDMAN, 50, gameData).matches[0]?.id).toBe(1101);
  });

  it('returns at most 50 matches but counts all', () => {
    const result = searchWeapons('', SWORDMAN, 99, gameData);
    expect(result.matches).toHaveLength(MAX_RESULTS);
    expect(result.total).toBeGreaterThan(MAX_RESULTS);
  });
});

describe('searchWeapons hidden items', () => {
  const visible = gameData.items.get(1101) as Item;
  const data = createGameData({
    jobs: [...gameData.jobs.values()],
    items: [visible, { ...visible, id: 1102, aegisName: 'Hidden_Sword', hidden: true }],
    monsters: [],
    statPoints: gameData.statPoints,
    tables: gameData.tables,
    names: { items: {}, monsters: {}, jobs: {} },
  });
  const ids = (showHidden: boolean) =>
    searchWeapons('', SWORDMAN, 99, data, { showHidden }).matches.map((item) => item.id);

  it('leaves hidden items out unless asked for them', () => {
    expect(ids(false)).toEqual([1101]);
    expect(ids(true)).toEqual([1101, 1102]);
  });

  it('marks shipped items from hidden-items.yml as hidden', () => {
    expect(gameData.weapons.some((item) => item.hidden)).toBe(true);
  });
});

describe('searchMonsters (shipped data)', () => {
  it('finds Poring by name, aegis name and id', () => {
    for (const query of ['poring', 'PORING', '1002']) {
      expect(searchMonsters(query, gameData).matches.map((m) => m.id)).toContain(1002);
    }
  });

  it('caps the list at 50', () => {
    const result = searchMonsters('', gameData);
    expect(result.matches).toHaveLength(MAX_RESULTS);
    expect(result.total).toBe(gameData.monsterList.length);
  });
});
