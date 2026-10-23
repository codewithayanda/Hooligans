import { describe, expect, it } from 'vitest';
import { percentile } from '../../../src/load/stats.js';

describe('percentile', () => {
  const numbers = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it('takes the number that the fraction of the list does not pass', () => {
    expect(percentile(numbers, 0.5)).toBe(50);
    expect(percentile(numbers, 0.95)).toBe(100);
    expect(percentile(numbers, 0.1)).toBe(10);
  });

  it('is zero for no numbers', () => {
    expect(percentile([], 0.95)).toBe(0);
  });

  it('stays inside the list', () => {
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile(numbers, 0)).toBe(10);
    expect(percentile(numbers, 5)).toBe(100);
  });
});
