import { describe, expect, it } from 'vitest';
import { rAthenaDefaults } from '../engine/config';
import { testJob, testMonster, testWeapon } from '../engine/testData';
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
    },
  ],
  monsters: [testMonster()],
  statPoints: [48, 51, 54],
  tables: { sizeModifier: {}, elementModifier: [] },
  names: { items: { 1101: 'Sword', 1102: 'Sword' }, monsters: { 1002: 'Poring' }, jobs: {} },
});

function valid(partial: Partial<Build> = {}): Build {
  return {
    ...defaultBuild(),
    job: 1,
    baseLevel: 50,
    jobLevel: 30,
    weapon: 1101,
    monster: 1002,
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
    expect(normalizeBuild({ ...valid(), v: 2 }, data, rAthenaDefaults)).toEqual({
      error: expect.stringMatching(/newer version/),
    });
  });

  it('drops an unknown weapon id with a warning', () => {
    const result = normalize(valid({ weapon: 99999 }));
    expect(result.build.weapon).toBeNull();
    expect(result.warnings).toEqual(['Unknown weapon 99999 removed.']);
  });

  it('drops an unknown monster id with a warning', () => {
    const result = normalize(valid({ monster: 99999 }));
    expect(result.build.monster).toBeNull();
    expect(result.warnings).toEqual(['Unknown monster 99999 removed.']);
  });

  it('drops a weapon the job cannot equip', () => {
    const result = normalize(valid({ job: 2 }));
    expect(result.build.weapon).toBeNull();
    expect(result.warnings).toEqual([
      'Sword (1101) cannot be equipped by Mage at base level 50; removed.',
    ]);
  });

  it('drops a weapon outside its equip level range', () => {
    expect(normalize(valid({ baseLevel: 1 })).build.weapon).toBeNull();
    expect(normalize(valid({ weapon: 1102, baseLevel: 11 })).build.weapon).toBeNull();
    expect(normalize(valid({ weapon: 1102, baseLevel: 10 })).build.weapon).toBe(1102);
  });

  it('drops an item that is not a weapon', () => {
    const result = normalize(valid({ weapon: 2301 }));
    expect(result.build.weapon).toBeNull();
    expect(result.warnings[0]).toMatch(/not a weapon/);
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
    expect(result.build).toMatchObject({ baseLevel: 1, jobLevel: 1, weapon: null });
    expect(result.build.stats.str).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('falls back to the default job for an unknown job id', () => {
    const result = normalize(valid({ job: 777, jobLevel: 5, weapon: null }));
    expect(result.build.job).toBe(0);
    expect(result.warnings[0]).toMatch(/Unknown job 777/);
  });
});

describe('sameBuild', () => {
  it('compares every field', () => {
    expect(sameBuild(valid(), valid())).toBe(true);
    expect(sameBuild(valid(), valid({ weapon: null }))).toBe(false);
    expect(sameBuild(valid(), valid({ stats: { ...valid().stats, luk: 2 } }))).toBe(false);
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
    const resolved = resolveBuild(valid({ weapon: null, monster: null }), data);
    expect(resolved.character.weapon).toBeNull();
    expect(resolved.monster).toBeNull();
  });
});
