import { describe, expect, it } from 'vitest';
import { checkJobIds, convertJob, expandJobGroups, parseJobEnum } from './jobs.ts';

describe('parseJobEnum', () => {
  it('counts implicit values and honours explicit ones', () => {
    const source = `
      enum e_job {
        JOB_NOVICE,
        JOB_SWORDMAN,
        JOB_MAX_BASIC,

        JOB_NOVICE_HIGH = 4001,
        JOB_SWORDMAN_HIGH,
      };`;
    expect([...parseJobEnum(source)]).toEqual([
      ['JOB_NOVICE', 0],
      ['JOB_SWORDMAN', 1],
      ['JOB_MAX_BASIC', 2],
      ['JOB_NOVICE_HIGH', 4001],
      ['JOB_SWORDMAN_HIGH', 4002],
    ]);
  });

  it('ignores comments and fails on a member it cannot read', () => {
    const commented = `enum e_job {
      JOB_NOVICE, // first
      //JOB_REMOVED,
      /* JOB_ALSO_REMOVED, */
      JOB_SWORDMAN
    };`;
    expect([...parseJobEnum(commented)]).toEqual([
      ['JOB_NOVICE', 0],
      ['JOB_SWORDMAN', 1],
    ]);
    expect(() => parseJobEnum('enum e_job { JOB_A = JOB_B, };')).toThrow(/cannot parse/);
  });

  it('rejects a supported job whose id differs from rAthena', () => {
    expect(() => checkJobIds(new Map([['JOB_NOVICE', 1]]))).toThrow(/Job Novice: id 0/);
  });
});

describe('expandJobGroups', () => {
  const records = expandJobGroups([
    { Jobs: { Novice: true, Super_Novice: true, Novice_High: true }, BaseASPD: { Fist: 500 } },
    { Jobs: { Supernovice: true }, MaxJobLevel: 99 },
    { Jobs: { Swordman: true, Baby_Swordman: true }, MaxJobLevel: 50 },
    { Jobs: { Swordman: false }, MaxJobLevel: 1 },
  ]);

  it('gives every supported job one record and maps spelling variants to one key', () => {
    const superNovice = records.find((record) => record.Job === 'Super_Novice');
    expect(superNovice).toEqual({ Job: 'Super_Novice', BaseASPD: { Fist: 500 }, MaxJobLevel: 99 });
  });

  it('merges map fields key by key when a job is in several groups', () => {
    const [novice] = expandJobGroups([
      { Jobs: { Novice: true, Baby: true }, BaseASPD: { Fist: 500, Dagger: 650 } },
      { Jobs: { Novice: true }, BaseASPD: { Dagger: 600 } },
    ]);
    expect(novice?.BaseASPD).toEqual({ Fist: 500, Dagger: 600 });
  });

  it('ignores unsupported jobs and disabled entries', () => {
    expect(records.some((record) => record.Job === 'Novice_High')).toBe(false);
    expect(records.find((record) => record.Job === 'Swordman')?.MaxJobLevel).toBe(50);
  });
});

describe('convertJob', () => {
  it('accumulates classic bonus stats per job level and ignores trait stats', () => {
    const job = convertJob({
      Job: 'Novice',
      MaxBaseLevel: 99,
      MaxJobLevel: 4,
      BaseASPD: { Fist: 500 },
      BonusStats: [
        { Level: 2, Luk: 1, Pow: 1 },
        { Level: 4, Luk: 1, Dex: 2 },
      ],
    });
    expect(job.bonusStats.map((row) => [row.dex, row.luk])).toEqual([
      [0, 0],
      [0, 1],
      [0, 1],
      [2, 2],
    ]);
  });

  it('fails when a field the engine needs is missing', () => {
    expect(() => convertJob({ Job: 'Novice', MaxBaseLevel: 99, BaseASPD: { Fist: 1 } })).toThrow(
      'Job Novice: missing MaxJobLevel.',
    );
  });
});
