import { describe, expect, it } from 'vitest';
import { levelsFor, planFor } from '../../../src/load/plan.js';

const timing = { minLevelMs: 1_000, thinkMs: [200, 600] } as const;

describe('levelsFor', () => {
  it('climbs a ladder up to the peak', () => {
    expect(levelsFor(25)).toEqual([1, 2, 5, 10, 15, 25]);
  });

  it('ends on the peak even when it is not on the ladder', () => {
    expect(levelsFor(30)).toEqual([1, 2, 5, 10, 15, 25, 30]);
    expect(levelsFor(200)).toEqual([1, 2, 5, 10, 15, 25, 40, 60, 100, 150, 200]);
  });

  it('is one step for one user', () => {
    expect(levelsFor(1)).toEqual([1]);
    expect(levelsFor(0)).toEqual([1]);
  });
});

describe('planFor', () => {
  it('shares the seconds between the steps', () => {
    expect(planFor({ maxUsers: 25, seconds: 30 }, timing)).toEqual({
      levels: [1, 2, 5, 10, 15, 25],
      levelMs: 5_000,
      thinkMs: [200, 600],
    });
  });

  it('never spends less than the shortest step', () => {
    expect(planFor({ maxUsers: 25, seconds: 5 }, timing).levelMs).toBe(1_000);
  });
});
