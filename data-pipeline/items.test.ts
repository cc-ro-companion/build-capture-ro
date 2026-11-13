import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowsNormalClass, convertItem, generateItems, resolveItemJobs } from './items.ts';
import { SUPPORTED_JOBS } from './jobs.ts';

const allJobIds = SUPPORTED_JOBS.map((job) => job.id);
const weapon = {
  Id: 1101,
  AegisName: 'Sword',
  Name: 'Sword',
  Type: 'Weapon',
  SubType: '1hSword',
  Locations: { Right_Hand: true },
};

describe('resolveItemJobs', () => {
  it('allows every supported job when Jobs is absent', () => {
    expect(resolveItemJobs({ Id: 1 })).toEqual(allJobIds);
  });

  it('applies All first, then the other names, whatever their order', () => {
    const jobs = resolveItemJobs({ Id: 1, Jobs: { Novice: false, All: true, SuperNovice: false } });
    expect(jobs).not.toContain(0);
    expect(jobs).not.toContain(23);
    expect(jobs).toHaveLength(allJobIds.length - 2);
  });

  it('expands BardDancer and maps rAthena item job spellings', () => {
    expect(resolveItemJobs({ Id: 1, Jobs: { BardDancer: true, SoulLinker: true } })).toEqual([
      19, 20, 4049,
    ]);
  });

  it('ignores jobs rAthena knows but the planner does not support', () => {
    expect(resolveItemJobs({ Id: 1, Jobs: { Summoner: true } })).toEqual([]);
  });

  it('rejects an unknown job name', () => {
    expect(() => resolveItemJobs({ Id: 7, Jobs: { Swordsman: true } })).toThrow(
      'item 7: unknown job "Swordsman".',
    );
  });
});

describe('allowsNormalClass', () => {
  it('allows normal characters when Classes is absent or includes them', () => {
    expect(allowsNormalClass({ Id: 1 })).toBe(true);
    expect(allowsNormalClass({ Id: 1, Classes: { All: true } })).toBe(true);
    expect(allowsNormalClass({ Id: 1, Classes: { Normal: true, Upper: true } })).toBe(true);
  });

  it('excludes items limited to other classes', () => {
    expect(allowsNormalClass({ Id: 1, Classes: { Upper: true } })).toBe(false);
    expect(allowsNormalClass({ Id: 1, Classes: { All: true, Normal: false } })).toBe(false);
  });
});

describe('convertItem', () => {
  it('fills rAthena defaults for absent fields', () => {
    expect(convertItem(weapon)).toEqual({
      id: 1101,
      aegisName: 'Sword',
      type: 'weapon',
      weaponType: '1hSword',
      attack: 0,
      defense: 0,
      range: 0,
      slots: 0,
      weaponLevel: 1,
      equipLevelMin: 0,
      equipLevelMax: 0,
      refineable: false,
      locations: ['Right_Hand'],
      jobs: allJobIds,
      effects: [],
    });
  });

  it('parses the script into effects, or records why it cannot', () => {
    expect(convertItem({ ...weapon, Script: 'bonus bStr,1;\n' })?.effects).toEqual([
      { k: 'bonus', name: 'bStr', args: [{ k: 'num', v: 1 }] },
    ]);
    const unsupported = convertItem({ ...weapon, Script: 'skill "TF_DOUBLE",5;' });
    expect(unsupported?.effects).toBeNull();
    expect(unsupported?.unsupported).toBe('command "skill"');
  });

  it('records a gender restriction and leaves weapon fields off armor', () => {
    const armor = convertItem({
      ...weapon,
      Type: 'Armor',
      SubType: undefined,
      Gender: 'Female',
      Locations: { Head_Top: true },
    });
    expect(armor?.gender).toBe('female');
    expect(armor).not.toHaveProperty('weaponType');
    expect(armor).not.toHaveProperty('weaponLevel');
  });

  it('forces rAthena gender rules and drops the opposite-sex job of Bard/Dancer', () => {
    const bardDancer = { Jobs: { BardDancer: true } };
    const whip = convertItem({ ...weapon, ...bardDancer, SubType: 'Whip' });
    expect(whip).toMatchObject({ gender: 'female', jobs: [20] });
    const instrument = convertItem({ ...weapon, ...bardDancer, SubType: 'Musical' });
    expect(instrument).toMatchObject({ gender: 'male', jobs: [19] });
    const brideRing = convertItem({
      ...weapon,
      Id: 2635,
      Type: 'Armor',
      Jobs: { All: true },
      Locations: { Both_Accessory: true },
    });
    expect(brideRing?.gender).toBe('female');
    expect(brideRing?.jobs).not.toContain(19);
    expect(brideRing?.jobs).toContain(20);
  });

  it('drops pet equipment, rebirth-only items, costumes and items no supported job can use', () => {
    expect(convertItem({ ...weapon, Type: 'Petarmor' })).toBeUndefined();
    expect(convertItem({ ...weapon, Type: 'Petegg' })).toBeUndefined();
    expect(convertItem({ ...weapon, Classes: { Upper: true } })).toBeUndefined();
    expect(convertItem({ ...weapon, Locations: { Costume_Head_Top: true } })).toBeUndefined();
    expect(convertItem({ ...weapon, Jobs: { Summoner: true } })).toBeUndefined();
  });
});

describe('generateItems', () => {
  const fixtureRathena = path.join(import.meta.dirname, 'fixtures', 'rathena');
  const noOverrides = { name: 'items.yml', body: [], remove: [] };

  it('marks hidden ids and leaves the others unmarked', () => {
    const { data } = generateItems(fixtureRathena, noOverrides, new Set([2301]));
    expect(data.find((item) => item.id === 2301)?.hidden).toBe(true);
    expect(data.find((item) => item.id === 1101)).not.toHaveProperty('hidden');
  });

  it('rejects a hidden id that is not generated equipment', () => {
    expect(() => generateItems(fixtureRathena, noOverrides, new Set([1101, 9999]))).toThrow(
      'hidden-items.yml: no such equipment: 9999.',
    );
  });
});
