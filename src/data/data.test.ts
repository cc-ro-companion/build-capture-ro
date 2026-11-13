import { describe, expect, it } from 'vitest';
import items from './generated/items.json';
import jobsData from './generated/jobs.json';
import monsters from './generated/monsters.json';
import names from './generated/names.en.json';

describe('generated jobs', () => {
  const byKey = (key: string) => jobsData.jobs.find((job) => job.key === key);

  it('gives Swordman a bare-hand base delay of 400', () => {
    expect(byKey('Swordman')?.baseAspd.Fist).toBe(400);
  });

  it('gives 48 stat points at base level 1', () => {
    expect(jobsData.statPoints[0]).toBe(48);
  });

  it('has a stat point total for every base level a job can reach', () => {
    const maxBaseLevel = Math.max(...jobsData.jobs.map((job) => job.maxBaseLevel));
    expect(jobsData.statPoints).toHaveLength(maxBaseLevel);
  });

  it('contains no baby, rebirth or mounted job', () => {
    const ids = jobsData.jobs.map((job) => job.id);
    expect(ids.filter((id) => id >= 4001 && id <= 4045)).toEqual([]);
    // Knight2, Crusader2, Star_Gladiator2.
    expect(ids).not.toContain(13);
    expect(ids).not.toContain(21);
    expect(ids).not.toContain(4048);
  });

  it('has one bonus stat row per job level and a name for every job', () => {
    for (const job of jobsData.jobs) {
      expect(job.bonusStats).toHaveLength(job.maxJobLevel);
      expect(names.jobs[String(job.id) as keyof typeof names.jobs]).toBeTruthy();
    }
  });
});

describe('generated equipment', () => {
  const byId = (id: number) => items.find((item) => item.id === id);

  it('gives Sword (1101) attack 25, weapon level 1 and 3 slots', () => {
    expect(byId(1101)).toMatchObject({ attack: 25, weaponLevel: 1, slots: 3 });
  });

  it('contains no pet eggs or pet armor', () => {
    expect(byId(9001)).toBeUndefined(); // Poring Egg
    expect(byId(10001)).toBeUndefined(); // Skull Helm (pet armor)
    expect(new Set(items.map((item) => item.type))).toEqual(new Set(['weapon', 'armor']));
  });

  it('lets every supported job equip at least one weapon', () => {
    for (const job of jobsData.jobs) {
      const usable = items.some((item) => item.type === 'weapon' && item.jobs.includes(job.id));
      expect(usable, job.key).toBe(true);
    }
  });

  it('lists only supported job ids on items', () => {
    const supported = new Set(jobsData.jobs.map((job) => job.id));
    for (const item of items) {
      expect(
        item.jobs.every((id) => supported.has(id)),
        `item ${item.id}`,
      ).toBe(true);
    }
  });

  it('is sorted by id and has a name for every item', () => {
    const ids = items.map((item) => item.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) {
      expect(names.items[String(id) as keyof typeof names.items], `item ${id}`).toBeTruthy();
    }
  });
});

describe('generated monsters', () => {
  it('gives Poring (1002) 50 HP and water element level 1', () => {
    expect(monsters.find((monster) => monster.id === 1002)).toMatchObject({
      hp: 50,
      element: 'Water',
      elementLevel: 1,
    });
  });

  it('includes every rAthena monster, sorted by id, each with a name', () => {
    expect(monsters.length).toBeGreaterThan(900);
    const ids = monsters.map((monster) => monster.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) {
      expect(
        names.monsters[String(id) as keyof typeof names.monsters],
        `monster ${id}`,
      ).toBeTruthy();
    }
  });
});
