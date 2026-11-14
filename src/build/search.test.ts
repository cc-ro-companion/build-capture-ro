import { describe, expect, it } from 'vitest';
import type { Item } from '../data/types';
import { fitsSlot, SLOTS, type Slot } from './equipment';
import { createGameData, gameData } from './resolve';
import { MAX_RESULTS, searchEquipment, searchMonsters } from './search';

const SWORDMAN = 1;
const MAGE = 2;

describe('searchEquipment right hand (shipped data)', () => {
  it('lists every weapon the job can equip, whatever its equip level', () => {
    for (const jobId of [SWORDMAN, MAGE]) {
      const all = gameData.weapons.filter((item) => !item.hidden && item.jobs.includes(jobId));
      const result = searchEquipment('', 'rightHand', jobId, gameData);
      expect(result.total).toBe(all.length);
      for (const item of result.matches) expect(item.jobs).toContain(jobId);
    }
  });

  it('offers weapons whose equip level is above 1, such as Sword (level 2)', () => {
    const swords = searchEquipment('sword', 'rightHand', SWORDMAN, gameData).matches;
    expect(swords.map((item) => item.id)).toContain(1101);
    const all = searchEquipment('', 'rightHand', SWORDMAN, gameData);
    const filtered = gameData.weapons.filter(
      (item) => !item.hidden && item.jobs.includes(SWORDMAN) && item.equipLevelMin > 1,
    );
    expect(filtered.length).toBeGreaterThan(0);
    expect(all.total).toBeGreaterThan(filtered.length);
  });

  it('does not offer swords to a Mage', () => {
    expect(searchEquipment('1101', 'rightHand', MAGE, gameData).total).toBe(0);
  });

  it('matches name, aegis name and id, ignoring case', () => {
    expect(
      searchEquipment('SWORD', 'rightHand', SWORDMAN, gameData).matches.map((i) => i.id),
    ).toContain(1101);
    expect(searchEquipment('1101', 'rightHand', SWORDMAN, gameData).matches[0]?.id).toBe(1101);
  });

  it('returns at most 50 matches but counts all', () => {
    const result = searchEquipment('', 'rightHand', SWORDMAN, gameData);
    expect(result.matches).toHaveLength(MAX_RESULTS);
    expect(result.total).toBeGreaterThan(MAX_RESULTS);
  });
});

describe('searchEquipment hidden items', () => {
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
    searchEquipment('', 'rightHand', SWORDMAN, data, { showHidden }).matches.map((item) => item.id);

  it('leaves hidden items out unless asked for them', () => {
    expect(ids(false)).toEqual([1101]);
    expect(ids(true)).toEqual([1101, 1102]);
  });

  it('marks shipped items from hidden-items.yml as hidden', () => {
    expect(gameData.weapons.some((item) => item.hidden)).toBe(true);
  });
});

describe('searchEquipment per slot (shipped data)', () => {
  const ASSASSIN = 12;
  const ids = (query: string, slot: Slot, jobId: number) =>
    searchEquipment(query, slot, jobId, gameData).matches.map((item) => item.id);

  it('offers only items that fit the slot', () => {
    for (const slot of SLOTS) {
      for (const item of searchEquipment('', slot, SWORDMAN, gameData).matches) {
        expect(fitsSlot(item, slot)).toBe(true);
      }
    }
  });

  it('offers a two-location headgear in both of its slots', () => {
    expect(ids('2224', 'headTop', SWORDMAN)).toEqual([2224]);
    expect(ids('2224', 'headMid', SWORDMAN)).toEqual([2224]);
    expect(ids('2224', 'headLow', SWORDMAN)).toEqual([]);
  });

  it('offers a both-sides accessory in either accessory slot', () => {
    expect(ids('2601', 'accessoryLeft', SWORDMAN)).toEqual([2601]);
    expect(ids('2601', 'accessoryRight', SWORDMAN)).toEqual([2601]);
  });

  it('offers shields to every job in the left hand, daggers only to an Assassin', () => {
    expect(ids('2101', 'leftHand', SWORDMAN)).toEqual([2101]);
    expect(ids('1201', 'leftHand', SWORDMAN)).toEqual([]);
    expect(ids('1201', 'leftHand', ASSASSIN)).toEqual([1201]);
  });

  it('does not offer a two-handed weapon in the left hand', () => {
    expect(ids('1116', 'rightHand', SWORDMAN)).toEqual([1116]);
    expect(ids('1116', 'leftHand', SWORDMAN)).toEqual([]);
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
