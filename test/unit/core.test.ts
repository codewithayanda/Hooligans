import { describe, expect, it } from 'vitest';
import { STAGE_NUMBERS, STAGES } from '../../src/core/stage.js';

describe('stages', () => {
  it('has four stages in order', () => {
    expect(STAGE_NUMBERS).toEqual([1, 2, 3, 4]);
  });

  it('lets only stage 1 run without a test database', () => {
    const writing = STAGE_NUMBERS.filter((stage) => STAGES[stage].writesData);
    expect(writing).toEqual([2, 3, 4]);
  });
});
