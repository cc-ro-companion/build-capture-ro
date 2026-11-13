import { describe, expect, it } from 'vitest';
import { jobsData } from '../data';
import {
  statPointBudget,
  statPointCost,
  statPointsForValue,
  statPointsSpent,
  totalStats,
} from './stats';
import { character, stats, testJob } from './testData';

describe('stat point cost (pc.cpp PC_STATUS_POINT_COST, pre-renewal)', () => {
  it('costs 2 per point from 1 to 10, 3 from 11 to 20, ... 11 at 91..98', () => {
    expect(statPointCost(1)).toBe(2);
    expect(statPointCost(10)).toBe(2);
    expect(statPointCost(11)).toBe(3);
    expect(statPointCost(98)).toBe(11);
  });

  it('sums the cost of each step from 1', () => {
    expect(statPointsForValue(1)).toBe(0);
    expect(statPointsForValue(2)).toBe(2);
    // 1→11: 10 steps × 2 = 20; 11→12 costs 3 → 23
    expect(statPointsForValue(12)).toBe(23);
    // Known pre-renewal total to raise a stat to 99
    expect(statPointsForValue(99)).toBe(628);
  });

  it('spends nothing when every stat is 1', () => {
    expect(statPointsSpent(stats())).toBe(0);
  });

  it('adds up all six stats', () => {
    expect(statPointsSpent(stats({ str: 2, luk: 12 }))).toBe(2 + 23);
  });
});

describe('stat point budget (statpoint.yml)', () => {
  it('is 48 at base level 1', () => {
    expect(statPointBudget(jobsData.statPoints, 1)).toBe(48);
  });

  it('clamps the level to the table', () => {
    const table = [48, 51, 54];
    expect(statPointBudget(table, 0)).toBe(48);
    expect(statPointBudget(table, 3)).toBe(54);
    expect(statPointBudget(table, 200)).toBe(54);
  });
});

describe('total stats (status_calc_pc_sub job bonus)', () => {
  it('adds the job bonus row of the job level', () => {
    const bonusStats = Array.from({ length: 50 }, (_, index) => ({
      str: index >= 1 ? 1 : 0,
      agi: 0,
      vit: 0,
      int: 0,
      dex: index >= 4 ? 2 : 0,
      luk: 0,
    }));
    const input = character({
      job: testJob({ bonusStats }),
      jobLevel: 5,
      baseStats: stats({ str: 50, dex: 30 }),
    });
    expect(totalStats(input)).toEqual(stats({ str: 51, dex: 32 }));
  });
});
