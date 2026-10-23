import { describe, expect, it } from 'vitest';
import type { AppMap } from '../../../../src/core/app-map.js';
import type { HttpClient, HttpRequest } from '../../../../src/core/context.js';
import { defaultCaps } from '../../../../src/guardrails/caps.js';
import { EgressError } from '../../../../src/guardrails/egress/gate.js';
import { createMob, theMob } from '../../../../src/hooligans/the-mob/index.js';
import { makeContext } from '../../../helpers/context.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap } from '../../../helpers/maps.js';

type Answer = (request: HttpRequest, nth: number) => Promise<number> | number;
type Service = HttpClient & { requests: HttpRequest[] };

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The same hooligan with short steps, so a test does not wait for seconds. */
const fast = createMob({
  minLevelMs: 60,
  thinkMs: [1, 3],
  recoverAfterMs: 5,
  requestTimeoutMs: 1_000,
});

/** An app that answers with whatever status `answer` gives. `nth` counts the asks for one address. */
function service(answer: Answer): Service {
  const requests: HttpRequest[] = [];
  const seen = new Map<string, number>();

  return {
    requests,
    request: async (request) => {
      requests.push(request);

      const nth = seen.get(request.url) ?? 0;
      seen.set(request.url, nth + 1);

      const status = await answer(request, nth);
      return { status, headers: {}, body: '', durationMs: 1, truncated: false, url: request.url };
    },
  };
}

/** One route that serves `slots` requests at once and turns the rest away with a 503. */
function pooled(path: string, slots: number, holdMs: number): Answer {
  let busy = 0;

  return async (request) => {
    if (new URL(request.url).pathname !== path) return 200;
    if (busy >= slots) return 503;

    busy += 1;
    try {
      await wait(holdMs);
      return 200;
    } finally {
      busy -= 1;
    }
  };
}

const get = (path: string) => ({
  method: 'GET',
  url: `http://localhost:3000${path}`,
  status: 200,
  sentAuth: false,
});

function appMap(overrides: Partial<AppMap> = {}): AppMap {
  return makeMap({ calls: [get('/api/stats')], ...overrides });
}

/** A scan that asks for `users` users over a tenth of a second. */
function crowd(map: AppMap, http: HttpClient, users = 10) {
  return makeContext(map, http, { caps: { ...defaultCaps(), maxUsers: users, loadSeconds: 0.1 } });
}

describe('The Mob on an app that gives way', () => {
  it('finds the weak spot and says which route it was', async () => {
    const http = service(pooled('/api/stats', 1, 40));
    const result = await fast.run(crowd(appMap(), http));
    const finding = result.findings.find((item) => item.id === 'the-mob.errors-under-load');

    expect(finding).toMatchObject({
      confidence: 'high',
      category: 'resilience',
      affected: ['GET /api/stats'],
    });
    expect(result.load).toMatchObject({
      stoppedBy: 'errors',
      weakSpot: 'GET /api/stats',
      recovered: true,
    });
    expect(result.load?.breakAt).toBeLessThanOrEqual(10);
    expect(result.notLookedAt?.[0]).toContain('only sends GET requests');
    if (finding) expectWellFormed(finding);
  });

  it('does not charge a dev server', async () => {
    const http = service(pooled('/api/stats', 1, 40));
    const result = await fast.run(crowd(appMap({ mode: 'dev' }), http));
    const finding = result.findings.find((item) => item.id === 'the-mob.errors-under-load');

    expect(finding?.confidence).toBe('low');
    expect(finding?.evidence).toContain('This was a dev server');
  });
});

describe('The Mob on an app that holds up', () => {
  it('goes to the top of the ladder, finds nothing and only reads', async () => {
    const http = service(() => 200);
    const result = await fast.run(crowd(appMap(), http));

    expect(result.findings).toEqual([]);
    expect(result.load).toMatchObject({
      peakUsers: 10,
      stoppedBy: 'finished',
      breakAt: null,
      weakSpot: null,
      recovered: null,
      routes: ['GET /', 'GET /api/stats'],
    });
    expect(result.load?.levels.map((level) => level.users)).toEqual([1, 2, 5, 10]);
    expect(http.requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('stops when the app answers 429, and says it could not go higher', async () => {
    const http = service((_request, nth) => (nth < 1 ? 200 : 429));
    const result = await fast.run(crowd(appMap(), http));

    expect(result.load?.stoppedBy).toBe('rate-limit');
    expect(result.findings).toEqual([]);
    expect(result.notLookedAt?.join(' ')).toContain('answered 429');
  });
});

describe('The Mob before the crowd arrives', () => {
  it('leaves out a route that fails for a single visitor, and says so', async () => {
    const map = appMap({ calls: [get('/api/stats'), get('/api/broken')] });
    const http = service((request) => (request.url.endsWith('/api/broken') ? 500 : 200));
    const result = await fast.run(crowd(map, http));

    expect(result.load?.routes).toEqual(['GET /', 'GET /api/stats']);
    expect(result.notLookedAt).toContain(
      'The Mob left GET /api/broken out, because it answered 500 to a single visitor.',
    );
  });

  it('sends no crowd when no route works for a single visitor', async () => {
    const http = service(() => 500);
    const result = await fast.run(crowd(appMap(), http));

    expect(result.load).toBeUndefined();
    expect(result.findings).toEqual([]);
    expect(result.notLookedAt).toContain(
      'The Mob could not load any route with a single visitor, so it sent no crowd.',
    );
    expect(http.requests).toHaveLength(2);
  });

  it('sends nothing when there is no page or call to load', async () => {
    const http = service(() => 200);
    const map = makeMap({ entry: 'http://localhost:3000/checkout' });
    const result = await fast.run(crowd(map, http));

    expect(http.requests).toEqual([]);
    expect(result.notLookedAt).toContain('The Mob found no page or call to load.');
  });
});

describe('The Mob when the scan has to stop', () => {
  it('keeps what it saw when the request budget runs out', async () => {
    const http = service((_request, nth) => {
      if (nth >= 4) throw new EgressError('budget', 'Used up.');
      return 200;
    });
    const result = await fast.run(crowd(appMap(), http, 1));

    expect(result.load?.stoppedBy).toBe('budget');
    expect(result.load?.levels).toHaveLength(1);
    expect(result.notLookedAt?.join(' ')).toContain('request budget');
  });

  it('stops with the scan when the user presses Ctrl+C', async () => {
    const http = service((_request, nth) => {
      if (nth >= 2) throw new EgressError('aborted', 'Stopped.');
      return 200;
    });

    await expect(fast.run(crowd(appMap(), http, 1))).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('passes on a spent budget before the crowd has started', async () => {
    const http = service(() => {
      throw new EgressError('budget', 'Used up.');
    });

    await expect(fast.run(crowd(appMap(), http))).rejects.toMatchObject({ kind: 'budget' });
  });
});

describe('The Mob', () => {
  it('logs its requests as counts and sets no pace of its own', () => {
    expect(theMob.aggregateLog).toBe(true);
    expect(theMob.requestsPerSecond).toBeUndefined();
    expect(theMob.stage).toBe(4);
    expect(theMob.sessions).toBe(0);
  });
});
