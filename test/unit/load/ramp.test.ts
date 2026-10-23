import { describe, expect, it } from 'vitest';
import {
  isBreak,
  RampStop,
  runRamp,
  summarize,
  type RampPlan,
  type Route,
  type Sample,
  type Send,
} from '../../../src/load/ramp.js';

const home: Route = { label: 'GET /', url: 'http://localhost:3000/', weight: 1 };
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A plan with short steps, so a test does not wait for seconds. */
function plan(levels: number[], levelMs = 80): RampPlan {
  return { levels, levelMs, thinkMs: [1, 3] };
}

/** An app that can serve `capacity` requests at once and turns the rest away. */
function service(capacity: number, holdMs: number): Send {
  let busy = 0;

  return async (route) => {
    if (busy >= capacity) return { route: route.label, kind: 'error', ms: 1 };

    busy += 1;
    try {
      await wait(holdMs);
      return { route: route.label, kind: 'ok', ms: holdMs };
    } finally {
      busy -= 1;
    }
  };
}

describe('isBreak', () => {
  it('needs at least three errors and at least five in a hundred requests', () => {
    expect(isBreak({ requests: 100, errors: 2 })).toBe(false);
    expect(isBreak({ requests: 100, errors: 4 })).toBe(false);
    expect(isBreak({ requests: 100, errors: 5 })).toBe(true);
    expect(isBreak({ requests: 10, errors: 3 })).toBe(true);
    expect(isBreak({ requests: 0, errors: 0 })).toBe(false);
  });
});

describe('summarize', () => {
  it('counts what happened at one step and names the route that failed most', () => {
    const samples: Sample[] = [
      { route: 'GET /a', kind: 'ok', ms: 100 },
      { route: 'GET /a', kind: 'ok', ms: 200 },
      { route: 'GET /b', kind: 'error', ms: 5 },
      { route: 'GET /b', kind: 'timeout', ms: 8_000 },
      { route: 'GET /a', kind: 'pushback', ms: 50 },
    ];

    expect(summarize(3, samples)).toEqual({
      users: 3,
      requests: 5,
      errors: 2,
      timeouts: 1,
      pushedBack: 1,
      p50Ms: 100,
      p95Ms: 200,
      worstRoute: 'GET /b',
    });
  });

  it('has no worst route when nothing failed', () => {
    expect(summarize(1, [{ route: 'GET /', kind: 'ok', ms: 10 }]).worstRoute).toBeNull();
  });
});

describe('runRamp', () => {
  it('finds the number of users where the app gives way, and stops there', async () => {
    const result = await runRamp({
      plan: plan([1, 2, 5, 10]),
      routes: [home],
      send: service(3, 20),
      random: () => 0.5,
    });

    expect(result.stoppedBy).toBe('errors');
    expect(result.breakAt).toBe(5);
    expect(result.levels.map((level) => level.users)).toEqual([1, 2, 5]);
    expect(result.levels[0]?.errors).toBe(0);
    expect(result.levels[2]?.errors).toBeGreaterThanOrEqual(3);
    expect(result.levels[2]?.worstRoute).toBe('GET /');
  });

  it('goes to the end of the plan when nothing fails', async () => {
    const result = await runRamp({
      plan: plan([1, 2, 3], 40),
      routes: [home],
      send: service(100, 5),
      random: () => 0.5,
    });

    expect(result.stoppedBy).toBe('finished');
    expect(result.breakAt).toBeNull();
    expect(result.levels).toHaveLength(3);
    expect(result.levels.every((level) => level.errors === 0 && level.requests > 0)).toBe(true);
  });

  it('stops when the app keeps answering 429, which is a limit doing its job', async () => {
    const send: Send = async (route) => ({ route: route.label, kind: 'pushback', ms: 2 });
    const result = await runRamp({ plan: plan([1, 2, 3], 40), routes: [home], send });

    expect(result.stoppedBy).toBe('rate-limit');
    expect(result.breakAt).toBeNull();
    expect(result.levels).toHaveLength(1);
  });

  it('stops when a sender says the budget is used up, and keeps what it saw', async () => {
    let calls = 0;
    const send: Send = async (route) => {
      calls += 1;
      if (calls > 5) throw new RampStop('budget');
      return { route: route.label, kind: 'ok', ms: 2 };
    };
    const result = await runRamp({ plan: plan([1], 500), routes: [home], send });

    expect(result.stoppedBy).toBe('budget');
    expect(result.levels[0]?.requests).toBe(5);
  });

  it('stops quickly when the user stops the scan', async () => {
    const controller = new AbortController();
    const send: Send = async (route) => {
      await wait(5);
      return { route: route.label, kind: 'ok', ms: 5 };
    };
    setTimeout(() => controller.abort(), 30);

    const started = Date.now();
    const result = await runRamp({
      plan: plan([1, 2], 5_000),
      routes: [home],
      send,
      signal: controller.signal,
    });

    expect(result.stoppedBy).toBe('interrupted');
    expect(result.levels).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('counts a request that fails in an unexpected way as an error', async () => {
    const send: Send = async () => {
      throw new Error('odd');
    };
    const result = await runRamp({ plan: plan([1], 60), routes: [home], send });

    expect(result.stoppedBy).toBe('errors');
    expect(result.levels[0]?.errors).toBeGreaterThanOrEqual(3);
  });

  it('picks routes by weight', async () => {
    const seen = new Set<string>();
    const send: Send = async (route) => {
      seen.add(route.label);
      return { route: route.label, kind: 'ok', ms: 1 };
    };
    const routes: Route[] = [
      { label: 'GET /a', url: 'http://localhost:3000/a', weight: 1 },
      { label: 'GET /b', url: 'http://localhost:3000/b', weight: 3 },
    ];

    await runRamp({ plan: plan([1], 30), routes, send, random: () => 0.9 });
    expect([...seen]).toEqual(['GET /b']);

    seen.clear();
    await runRamp({ plan: plan([1], 30), routes, send, random: () => 0.1 });
    expect([...seen]).toEqual(['GET /a']);
  });

  it('needs a route to visit', async () => {
    const send: Send = async () => null;

    await expect(runRamp({ plan: plan([1]), routes: [], send })).rejects.toThrow(
      'at least one route',
    );
  });
});

describe('RampStop', () => {
  it('says why the crowd was stopped', () => {
    expect(new RampStop('budget').reason).toBe('budget');
    expect(new RampStop('interrupted').message).toContain('interrupted');
  });
});
