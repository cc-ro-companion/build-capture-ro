import { describe, expect, it } from 'vitest';
import type { Item } from '../data/types';
import { createGameData, gameData } from './resolve';
import { MAX_RESULTS, searchMonsters, searchWeapons } from './search';

const SWORDMAN = 1;
const MAGE = 2;

describe('searchWeapons (shipped data)', () => {
  it('lists every weapon the job can equip, whatever its equip level', () => {
    for (const jobId of [SWORDMAN, MAGE]) {
      const all = gameData.weapons.filter((item) => !item.hidden && item.jobs.includes(jobId));
      const result = searchWeapons('', jobId, gameData);
      expect(result.total).toBe(all.length);
      for (const item of result.matches) expect(item.jobs).toContain(jobId);
    }
  });

  it('offers weapons whose equip level is above 1, such as Sword (level 2)', () => {
    const swords = searchWeapons('sword', SWORDMAN, gameData).matches;
    expect(swords.map((item) => item.id)).toContain(1101);
    const all = searchWeapons('', SWORDMAN, gameData);
    const filtered = gameData.weapons.filter(
      (item) => !item.hidden && item.jobs.includes(SWORDMAN) && item.equipLevelMin > 1,
    );
    expect(filtered.length).toBeGreaterThan(0);
    expect(all.total).toBeGreaterThan(filtered.length);
  });

  it('does not offer swords to a Mage', () => {
    expect(searchWeapons('1101', MAGE, gameData).total).toBe(0);
  });

  it('matches name, aegis name and id, ignoring case', () => {
    expect(searchWeapons('SWORD', SWORDMAN, gameData).matches.map((i) => i.id)).toContain(1101);
    expect(searchWeapons('1101', SWORDMAN, gameData).matches[0]?.id).toBe(1101);
  });

  it('returns at most 50 matches but counts all', () => {
    const result = searchWeapons('', SWORDMAN, gameData);
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
    searchWeapons('', SWORDMAN, data, { showHidden }).matches.map((item) => item.id);

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
