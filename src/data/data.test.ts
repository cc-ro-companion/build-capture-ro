import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashData, hashOverrides, META_FILE } from '../../data-pipeline/hash.ts';
import { dataMeta, items, jobsData, monsters, namesEn as names, tables } from './index';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const generatedDir = path.join(import.meta.dirname, 'generated');

describe('data version', () => {
  it('matches data-overrides/ (fails if an override was edited without regenerating)', () => {
    const current = hashOverrides(path.join(repoRoot, 'data-overrides'));
    expect(
      current,
      'data-overrides/ changed since src/data/generated/ was written. ' +
        'Run `pnpm data` and commit the regenerated files.',
    ).toBe(dataMeta.overridesHash);
  });

  it('matches the generated files (fails if one was edited by hand)', () => {
    const files = readdirSync(generatedDir).filter(
      (name) => name.endsWith('.json') && name !== META_FILE,
    );
    const texts = Object.fromEntries(
      files.map((name) => [name, readFileSync(path.join(generatedDir, name), 'utf8')]),
    );
    expect(
      hashData(texts),
      'src/data/generated/ differs from its recorded hash. Run `pnpm data` instead of editing it.',
    ).toBe(dataMeta.hash);
  });

  it('records a label and the rAthena commit', () => {
    expect(dataMeta.label).not.toBe('');
    expect(dataMeta.rathenaCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});

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

describe('generated tables', () => {
  it('gives Knuckle 50 % against large monsters', () => {
    expect(tables.sizeModifier.Knuckle?.large).toBe(50);
  });

  it('takes the base size table from db/size_fix.yml with the pre-renewal changes on top', () => {
    expect(tables.sizeModifier.Dagger).toEqual({ small: 100, medium: 75, large: 50 });
    expect(tables.sizeModifier.Whip).toEqual({ small: 75, medium: 100, large: 50 });
  });

  it('gives water attacking fire at element level 1 150 %', () => {
    expect(tables.elementModifier[0]?.Water?.Fire).toBe(150);
  });

  it('has a size modifier for every weapon type that jobs and items use', () => {
    const used = new Set([
      ...jobsData.jobs.flatMap((job) => Object.keys(job.baseAspd)),
      ...items.flatMap((item) => (item.weaponType === undefined ? [] : [item.weaponType])),
    ]);
    for (const weaponType of used)
      expect(tables.sizeModifier, weaponType).toHaveProperty(weaponType);
  });

  it('has an element modifier row for every monster element', () => {
    for (const element of new Set(monsters.map((monster) => monster.element))) {
      expect(tables.elementModifier[0], element).toHaveProperty(element);
    }
  });
});
