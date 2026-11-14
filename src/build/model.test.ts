import { describe, expect, it } from 'vitest';
import { rAthenaDefaults } from '../engine/config';
import { testJob, testMonster, testWeapon } from '../engine/testData';
import { defaultDummy } from './dummy';
import { defaultBuild, normalizeBuild, sameBuild, type Build } from './model';
import { createGameData, resolveBuild } from './resolve';

const data = createGameData({
  jobs: [
    testJob({ id: 0, key: 'Novice', maxJobLevel: 10 }),
    testJob({ id: 1, key: 'Swordman', maxJobLevel: 50 }),
    testJob({ id: 2, key: 'Mage', maxJobLevel: 50 }),
  ],
  items: [
    testWeapon({ id: 1101, jobs: [0, 1], equipLevelMin: 2 }),
    testWeapon({ id: 1102, aegisName: 'Sword_', jobs: [1], equipLevelMin: 1, equipLevelMax: 10 }),
    {
      ...testWeapon({ id: 2301, aegisName: 'Cotton_Shirt' }),
      type: 'armor',
      weaponType: undefined,
      locations: ['Armor'],
    },
    {
      ...testWeapon({ id: 2210, aegisName: 'Hair_Band' }),
      type: 'armor',
      weaponType: undefined,
      locations: ['Head_Top'],
      refineable: false,
    },
    {
      ...testWeapon({ id: 2224, aegisName: 'Goggles' }),
      type: 'armor',
      weaponType: undefined,
      locations: ['Head_Mid', 'Head_Top'],
    },
  ],
  monsters: [testMonster()],
  statPoints: [48, 51, 54],
  tables: { sizeModifier: {}, elementModifier: [], refine: { armor: [], weapon: [] } },
  names: {
    items: {
      1101: 'Sword',
      1102: 'Sword',
      2301: 'Cotton Shirt',
      2210: 'Hair Band',
      2224: 'Goggles',
    },
    monsters: { 1002: 'Poring' },
    jobs: {},
    runes: {},
  },
});

function valid(partial: Partial<Build> = {}): Build {
  return {
    ...defaultBuild(),
    job: 1,
    baseLevel: 50,
    jobLevel: 30,
    equipment: { rightHand: { item: 1101, refine: 4 } },
    dummies: [defaultDummy(0)],
    target: { monster: 1002 },
    ...partial,
  };
}

function normalize(raw: unknown) {
  const result = normalizeBuild(raw, data, rAthenaDefaults);
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('normalizeBuild', () => {
  it('keeps a valid build unchanged and without warnings', () => {
    const result = normalize(valid());
    expect(result.build).toEqual(valid());
    expect(result.warnings).toEqual([]);
  });

  it('rejects data that is not a build', () => {
    expect(normalizeBuild('x', data, rAthenaDefaults)).toHaveProperty('error');
    expect(normalizeBuild({ job: 1 }, data, rAthenaDefaults)).toHaveProperty('error');
    expect(normalizeBuild({ ...valid(), v: 3 }, data, rAthenaDefaults)).toEqual({
      error: expect.stringMatching(/newer version/),
    });
  });

  it('drops an unknown item id with a warning', () => {
    const result = normalize(valid({ equipment: { rightHand: { item: 99999, refine: 0 } } }));
    expect(result.build.equipment).toEqual({});
    expect(result.warnings).toEqual(['Unknown item 99999 in rightHand removed.']);
  });

  it('migrates a v1 build: the weapon goes to the right hand at +0, without a warning', () => {
    const v1: Record<string, unknown> = { ...valid(), v: 1, weapon: 1101 };
    delete v1.equipment;
    const result = normalize(v1);
    expect(result.build).toEqual(valid({ equipment: { rightHand: { item: 1101, refine: 0 } } }));
    expect(result.warnings).toEqual([]);
    expect(normalize({ ...v1, weapon: null }).build.equipment).toEqual({});
  });

  it('ignores an equipment field in a v1 build', () => {
    expect(normalize({ ...valid(), v: 1, weapon: null }).build.equipment).toEqual({});
  });

  it('drops items that do not fit their slot, and unknown slots', () => {
    const result = normalize({
      ...valid(),
      equipment: {
        headTop: { item: 1101, refine: 0 },
        armor: { item: 2301, refine: 0 },
        cape: { item: 2301, refine: 0 },
      },
    });
    expect(result.build.equipment).toEqual({ armor: { item: 2301, refine: 0 } });
    expect(result.warnings).toEqual([
      'Unknown equipment slot cape; its item was removed.',
      'Sword (1101) does not fit headTop; removed.',
    ]);
  });

  it('drops armor in a weapon slot', () => {
    const result = normalize(valid({ equipment: { rightHand: { item: 2301, refine: 0 } } }));
    expect(result.build.equipment).toEqual({});
    expect(result.warnings).toEqual(['Cotton Shirt (2301) does not fit rightHand; removed.']);
  });

  it('stores a multi-location headgear under its first slot and drops what it overlaps', () => {
    const moved = normalize(valid({ equipment: { headMid: { item: 2224, refine: 0 } } }));
    expect(moved.build.equipment).toEqual({ headTop: { item: 2224, refine: 0 } });
    const result = normalize(
      valid({
        equipment: { headTop: { item: 2210, refine: 0 }, headMid: { item: 2224, refine: 0 } },
      }),
    );
    expect(result.build.equipment).toEqual({ headTop: { item: 2210, refine: 0 } });
    expect(result.warnings).toEqual([
      'Goggles (2224) overlaps an item in an earlier slot; removed.',
    ]);
  });

  it('clamps refine to 0..10 and forces 0 on items that cannot be refined', () => {
    const result = normalize(
      valid({
        equipment: {
          headTop: { item: 2210, refine: 3 },
          armor: { item: 2301, refine: 12 },
          rightHand: { item: 1101, refine: -1 },
        },
      }),
    );
    expect(result.build.equipment).toEqual({
      headTop: { item: 2210, refine: 0 },
      armor: { item: 2301, refine: 10 },
      rightHand: { item: 1101, refine: 0 },
    });
    expect(result.warnings).toEqual([
      'Hair Band (2210) cannot be refined; refine set to 0.',
      'Refine 12 of Cotton Shirt (2301) is outside 0–10; set to 10.',
      'Refine -1 of Sword (1101) is outside 0–10; set to 0.',
    ]);
  });

  it('drops an unknown monster id with a warning', () => {
    const result = normalize(valid({ target: { monster: 99999 } }));
    expect(result.build.target).toBeNull();
    expect(result.warnings).toEqual(['Unknown monster 99999 removed.']);
  });

  it('keeps a dummy target and clears one that does not exist, with a warning', () => {
    expect(normalize(valid({ target: { dummy: 0 } })).build.target).toEqual({ dummy: 0 });
    const result = normalize(valid({ target: { dummy: 1 } }));
    expect(result.build.target).toBeNull();
    expect(result.warnings).toEqual(['The target dummy 1 does not exist; target cleared.']);
  });

  it('clears a target that is neither a monster nor a dummy', () => {
    const result = normalize({ ...valid(), target: { boss: 1 } });
    expect(result.build.target).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it('reads a build without dummies or target as having none', () => {
    const rest: Record<string, unknown> = { ...valid() };
    delete rest.dummies;
    delete rest.target;
    expect(normalize(rest).build).toMatchObject({ dummies: [], target: null });
  });

  it('keeps gear the job or level cannot wear, without a warning', () => {
    const mage = normalize(valid({ job: 2 }));
    expect(mage.build.equipment).toEqual(valid().equipment);
    expect(mage.warnings).toEqual([]);
    expect(normalize(valid({ baseLevel: 1 })).build.equipment).toEqual(valid().equipment);
  });

  it('clamps levels to the job maximums with a warning', () => {
    const result = normalize(valid({ baseLevel: 150, jobLevel: 0 }));
    expect(result.build.baseLevel).toBe(99);
    expect(result.build.jobLevel).toBe(1);
    expect(result.warnings).toEqual([
      'Base level 150 is outside 1–99; set to 99.',
      'Job level 0 is outside 1–50; set to 1.',
    ]);
  });

  it('clamps stats to 1..maxStat with a warning', () => {
    const stats = { str: 120, agi: 0, vit: 1, int: 1, dex: 1, luk: 1 };
    const result = normalize(valid({ stats }));
    expect(result.build.stats).toMatchObject({ str: 99, agi: 1 });
    expect(result.warnings).toEqual([
      'STR 120 is outside 1–99; set to 99.',
      'AGI 0 is outside 1–99; set to 1.',
    ]);
  });

  it('replaces missing or non-numeric values with defaults', () => {
    const result = normalize({ v: 1, job: 1, stats: { str: 'x' } });
    expect(result.build).toMatchObject({ baseLevel: 1, jobLevel: 1, equipment: {} });
    expect(result.build.stats.str).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('falls back to the default job for an unknown job id', () => {
    const result = normalize(valid({ job: 777, jobLevel: 5, equipment: {} }));
    expect(result.build.job).toBe(0);
    expect(result.warnings[0]).toMatch(/Unknown job 777/);
  });
});

describe('sameBuild', () => {
  it('compares every field', () => {
    expect(sameBuild(valid(), valid())).toBe(true);
    expect(sameBuild(valid(), valid({ equipment: {} }))).toBe(false);
    const refined = valid({ equipment: { rightHand: { item: 1101, refine: 5 } } });
    expect(sameBuild(valid(), refined)).toBe(false);
    expect(sameBuild(valid(), valid({ stats: { ...valid().stats, luk: 2 } }))).toBe(false);
    expect(sameBuild(valid(), valid({ target: { dummy: 0 } }))).toBe(false);
    expect(sameBuild(valid(), valid({ target: null }))).toBe(false);
    expect(sameBuild(valid(), valid({ dummies: [] }))).toBe(false);
    expect(sameBuild(valid(), valid({ dummies: [{ ...defaultDummy(0), vit: 2 }] }))).toBe(false);
    expect(sameBuild(valid(), valid({ dummies: [{ ...defaultDummy(0), name: 'x' }] }))).toBe(false);
  });
});

describe('resolveBuild', () => {
  it('looks up job, weapon and monster records', () => {
    const resolved = resolveBuild(valid(), data);
    expect(resolved.character.job.key).toBe('Swordman');
    expect(resolved.character.weapon?.id).toBe(1101);
    expect(resolved.monster?.aegisName).toBe('PORING');
  });

  it('resolves bare hands and no target to null', () => {
    const resolved = resolveBuild(valid({ equipment: {}, target: null }), data);
    expect(resolved.character.weapon).toBeNull();
    expect(resolved.monster).toBeNull();
    expect(resolved.dummy).toBeNull();
  });

  it('resolves a dummy target into a monster record with its settings', () => {
    const dummy = { ...defaultDummy(0), name: 'Tank', def: 80, vit: 120, element: 'Ghost' };
    const resolved = resolveBuild(valid({ dummies: [dummy], target: { dummy: 0 } }), data);
    expect(resolved.dummy).toEqual(dummy);
    expect(resolved.monster).toMatchObject({
      defense: 80,
      vit: 120,
      element: 'Ghost',
      class: 'normal',
      modes: [],
      raceGroups: [],
    });
  });
});
