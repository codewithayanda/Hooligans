import { describe, expect, it } from 'vitest';
import type { AppMap } from '../../../../src/core/app-map.js';
import type { HttpRequest } from '../../../../src/core/context.js';
import { EgressError } from '../../../../src/guardrails/egress/gate.js';
import { fatFingers } from '../../../../src/hooligans/fat-fingers/index.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp, type FakeRoute } from '../../../helpers/fake-http.js';
import { siteRoutes, type Mode } from '../../../helpers/fake-site.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap, manyForms, shopMap } from '../../../helpers/maps.js';

const MARKER = 'hooligans-test-run';

type Form = AppMap['forms'][number];

const nameForm: Form = {
  page: 'http://localhost:3000/contact.html',
  action: 'http://localhost:3000/api/contact',
  method: 'POST',
  fields: [{ name: 'name', type: 'text' }],
};

const pathOf = (request: HttpRequest) => new URL(request.url).pathname;
const nameOf = (request: HttpRequest) => new URLSearchParams(request.body ?? '').get('name') ?? '';
const isLong = (request: HttpRequest) => nameOf(request).length > 200;

async function runOn(map: AppMap, routes: Record<string, FakeRoute>) {
  const http = fakeHttp(routes);
  const result = await fatFingers.run(makeContext(map, http));
  return { ...result, http };
}

const typeOn = (mode: Mode) => runOn(shopMap(), siteRoutes(mode));

describe('Fat Fingers on the vulnerable site', () => {
  it('finds the form that crashes on a long name, and shows what it saw', async () => {
    const { findings } = await typeOn('vuln');

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'fat-fingers.stack-trace',
      severity: 'medium',
      confidence: 'high',
      category: 'resilience',
      affected: ['POST /api/contact (name)'],
      title: 'POST /api/contact shows a stack trace when "name" gets a value of 2,000 characters',
    });
    expect(findings[0]?.evidence).toContain('returned a 500 error');
    expect(findings[0]?.evidence).toContain('listed file paths from your server');
    for (const finding of findings) expectWellFormed(finding);
  });

  it('only types into what the Scout saw, and leaves the login form alone', async () => {
    const { http } = await typeOn('vuln');
    const paths = new Set(http.requests.map(pathOf));

    expect([...paths].sort()).toEqual(['/api/contact', '/search']);
  });

  it('posts the way a browser would, and never follows a redirect', async () => {
    const { http } = await typeOn('vuln');
    const post = http.requests.find((request) => request.method === 'POST');

    expect(post?.headers).toMatchObject({
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'http://localhost:3000',
      referer: 'http://localhost:3000/contact.html',
    });
    expect(http.requests.every((request) => request.redirect === 'manual')).toBe(true);
  });

  it('marks what it types with the run id, so the junk can be found and cleared', async () => {
    const { http, notLookedAt } = await typeOn('vuln');
    const posts = http.requests.filter((request) => request.method === 'POST');

    expect(posts.length).toBeGreaterThan(5);
    expect(posts.every((request) => request.body?.includes(MARKER))).toBe(true);
    expect(notLookedAt?.[0]).toContain(`leaves junk data marked with ${MARKER}`);
  });

  it('says what it left alone', async () => {
    const { notLookedAt } = await typeOn('vuln');

    expect(notLookedAt).toContain(
      'Fat Fingers did not type into a login or signup form (Brute looks at those) and a call the page makes with a JSON body, because their fields are not visible yet.',
    );
  });
});

describe('Fat Fingers on the fixed site', () => {
  it('finds nothing', async () => {
    const { findings } = await typeOn('fixed');

    expect(findings).toEqual([]);
  });
});

describe('Fat Fingers when the app misbehaves', () => {
  const only = makeMap({ forms: [nameForm] });

  it('reports a request that never gets an answer', async () => {
    const { findings } = await runOn(only, {
      '/api/contact': (request) => (isLong(request) ? new EgressError('timeout', 'Too slow.') : {}),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'fat-fingers.hang',
      severity: 'medium',
      confidence: 'medium',
      title: 'POST /api/contact hangs when "name" gets a value of 2,000 characters',
    });
    for (const finding of findings) expectWellFormed(finding);
  });

  it('reports an app that stops answering, and stops typing', async () => {
    let down = false;
    const { findings, http } = await runOn(shopMap(), {
      '/api/contact': (request) => {
        if (isLong(request)) down = true;
        return down ? new EgressError('network', 'No answer.') : {};
      },
    });

    expect(findings.map((finding) => finding.id)).toEqual(['fat-fingers.app-down']);
    expect(findings[0]).toMatchObject({ severity: 'high', confidence: 'medium' });
    expect(http.requests.some((request) => pathOf(request) === '/search')).toBe(false);
    for (const finding of findings) expectWellFormed(finding);
  });

  it('does not blame the app for one request that failed and then worked', async () => {
    let blips = 1;
    const { findings } = await runOn(only, {
      '/api/contact': (request) => {
        if (!isLong(request) || blips === 0) return {};

        blips -= 1;
        return new EgressError('network', 'A blip.');
      },
    });

    expect(findings).toEqual([]);
  });

  it('does not hold a failure it cannot explain against the app', async () => {
    const { findings } = await runOn(only, {
      '/api/contact': (request) => (isLong(request) ? new EgressError('blocked', 'No.') : {}),
    });

    expect(findings).toEqual([]);
  });

  it('leaves a form alone when an ordinary request to it already fails', async () => {
    const { findings, notLookedAt, http } = await runOn(only, {
      '/api/contact': { status: 500, body: 'Internal Server Error' },
    });

    expect(findings).toEqual([]);
    expect(http.requests).toHaveLength(1);
    expect(notLookedAt).toContain(
      'Fat Fingers left POST /api/contact alone, because it did not answer an ordinary request properly.',
    );
  });

  it('stops early when the app keeps failing', async () => {
    const map = manyForms(8, 1);
    const routes = Object.fromEntries(
      map.forms.map((form) => [new URL(form.action).pathname, { status: 500 }]),
    );
    const { findings, notLookedAt, http } = await runOn(map, routes);

    expect(findings).toEqual([]);
    expect(http.requests).toHaveLength(5);
    expect(notLookedAt).toContain('Fat Fingers stopped early, because the app kept failing.');
  });
});

describe('Fat Fingers limits', () => {
  it('stops after 60 requests, however many forms there are', async () => {
    const { notLookedAt, http } = await runOn(manyForms(8, 3), {});

    expect(http.requests).toHaveLength(60);
    expect(notLookedAt).toContain('Fat Fingers stopped after 60 requests.');
  });

  it('says so when there is nothing to type into', async () => {
    const { findings, notLookedAt, http } = await runOn(makeMap(), {});

    expect(findings).toEqual([]);
    expect(http.requests).toEqual([]);
    expect(notLookedAt).toContain('Fat Fingers found no form or search field it could type into.');
  });

  it('leaves out routes that look risky, unless they were asked for', async () => {
    const map = makeMap({
      forms: [{ ...nameForm, action: 'http://localhost:3000/api/send-invite' }],
    });
    const left = await runOn(map, {});

    expect(left.http.requests).toEqual([]);
    expect(left.notLookedAt).toContain(
      'Fat Fingers did not type into a route whose name suggests side effects (use --include-risky to include them).',
    );

    const asked = fakeHttp({});
    await fatFingers.run(makeContext(map, asked, { includeRisky: true }));

    expect(asked.requests.length).toBeGreaterThan(0);
  });

  it('passes on a spent budget, so the whole scan can stop', async () => {
    const http = fakeHttp({ '/api/contact': () => new EgressError('budget', 'Out of requests.') });

    await expect(fatFingers.run(makeContext(shopMap(), http))).rejects.toMatchObject({
      kind: 'budget',
    });
  });

  it('asks for at most 2 requests a second and needs no login', () => {
    expect(fatFingers.requestsPerSecond).toBe(2);
    expect(fatFingers.sessions).toBe(0);
  });
});
