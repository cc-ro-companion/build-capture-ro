import { describe, expect, it } from 'vitest';
import jobsData from './generated/jobs.json';
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
