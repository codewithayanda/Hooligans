import { describe, expect, it } from 'vitest';
import {
  CircuitBreaker,
  ScanBudget,
  createRateLimiter,
  defaultCaps,
  resolveSeconds,
  resolveUsers,
} from '../../../src/guardrails/caps.js';

describe('defaultCaps', () => {
  it('matches the safety decision', () => {
    expect(defaultCaps()).toEqual({
      maxRequestsPerSecond: 2,
      maxUsers: 25,
      maxAttemptsPerMinute: 30,
      loadSeconds: 30,
    });
  });
});

describe('resolveUsers', () => {
  it('defaults to 25 and never goes past the ceiling of 200', () => {
    expect(resolveUsers(undefined)).toBe(25);
    expect(resolveUsers(Number.NaN)).toBe(25);
    expect(resolveUsers(500)).toBe(200);
  });

  it('keeps at least one user and rounds to a whole number', () => {
    expect(resolveUsers(0)).toBe(1);
    expect(resolveUsers(3.7)).toBe(4);
  });
});

describe('resolveSeconds', () => {
  it('defaults to 30 and stays between 5 and 120', () => {
    expect(resolveSeconds(undefined)).toBe(30);
    expect(resolveSeconds(1)).toBe(5);
    expect(resolveSeconds(9999)).toBe(120);
  });
});

describe('CircuitBreaker', () => {
  it('opens after five failures in a row', () => {
    const breaker = new CircuitBreaker();

    for (let attempt = 0; attempt < 4; attempt += 1) breaker.record(false);
    expect(breaker.isOpen).toBe(false);

    breaker.record(false);
    expect(breaker.isOpen).toBe(true);
  });

  it('starts counting again after a success', () => {
    const breaker = new CircuitBreaker();

    for (let attempt = 0; attempt < 4; attempt += 1) breaker.record(false);
    breaker.record(true);
    for (let attempt = 0; attempt < 4; attempt += 1) breaker.record(false);

    expect(breaker.isOpen).toBe(false);
  });

  it('stays open once it has opened', () => {
    const breaker = new CircuitBreaker(2);

    breaker.record(false);
    breaker.record(false);
    breaker.record(true);

    expect(breaker.isOpen).toBe(true);
  });
});

describe('ScanBudget', () => {
  it('says nothing while there is time and requests left', () => {
    let now = 0;
    const budget = new ScanBudget({ maxSeconds: 10, maxRequests: 100, now: () => now });

    now = 5_000;
    expect(budget.exceeded(50)).toBeNull();
  });

  it('stops the scan when the time is up', () => {
    let now = 0;
    const budget = new ScanBudget({ maxSeconds: 10, maxRequests: 100, now: () => now });

    now = 10_000;
    expect(budget.exceeded(0)).toContain('time budget');
  });

  it('stops the scan when the requests are used up', () => {
    const budget = new ScanBudget({ maxSeconds: 10, maxRequests: 100, now: () => 0 });

    expect(budget.exceeded(100)).toContain('request budget');
  });
});

describe('createRateLimiter', () => {
  it('spaces calls evenly', async () => {
    let time = 0;
    const waits: number[] = [];
    const limiter = createRateLimiter(
      2,
      () => time,
      async (ms) => {
        waits.push(ms);
        time += ms;
      },
    );

    await limiter.take();
    await limiter.take();
    await limiter.take();

    expect(waits).toEqual([500, 500]);
  });

  it('turns half a call a second into 30 a minute', async () => {
    let time = 0;
    const waits: number[] = [];
    const limiter = createRateLimiter(
      0.5,
      () => time,
      async (ms) => {
        waits.push(ms);
        time += ms;
      },
    );

    await limiter.take();
    await limiter.take();

    expect(waits).toEqual([2000]);
  });

  it('refuses a rate of zero', () => {
    expect(() => createRateLimiter(0)).toThrow(/above zero/);
  });
});
