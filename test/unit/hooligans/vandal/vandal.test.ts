import { describe, expect, it } from 'vitest';
import type { AppMap } from '../../../../src/core/app-map.js';
import type { HttpRequest } from '../../../../src/core/context.js';
import { EgressError } from '../../../../src/guardrails/egress/gate.js';
import { vandal } from '../../../../src/hooligans/vandal/index.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp, type FakeRoute } from '../../../helpers/fake-http.js';
import { siteRoutes, type Mode } from '../../../helpers/fake-site.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap, manyForms, shopMap } from '../../../helpers/maps.js';

const MARKER = 'hooligans-test-run';

type Form = AppMap['forms'][number];

const searchForm: Form = {
  page: 'http://localhost:3000/',
  action: 'http://localhost:3000/search',
  method: 'GET',
  fields: [{ name: 'q', type: 'search' }],
};

const only = makeMap({ forms: [searchForm] });

const typedQuery = (request: HttpRequest) => new URL(request.url).searchParams.get('q') ?? '';

function typedValues(request: HttpRequest): string[] {
  const params =
    request.method === 'GET'
      ? new URL(request.url).searchParams
      : new URLSearchParams(request.body ?? '');

  return [...params.values()];
}

async function runOn(map: AppMap, routes: Record<string, FakeRoute>) {
  const http = fakeHttp(routes);
  const result = await vandal.run(makeContext(map, http));
  return { ...result, http };
}

const vandalise = (mode: Mode) => runOn(shopMap(), siteRoutes(mode));

describe('Vandal on the vulnerable site', () => {
  it('finds the search that shows what is typed into it and the one that leaks a database error', async () => {
    const { findings } = await vandalise('vuln');

    expect(findings.map((finding) => finding.id)).toEqual([
      'vandal.reflected-input',
      'vandal.sql-error',
    ]);
    for (const finding of findings) expectWellFormed(finding);
  });

  it('says where and what, in plain words', async () => {
    const { findings } = await vandalise('vuln');
    const [reflected, sql] = findings;

    expect(reflected).toMatchObject({
      severity: 'high',
      confidence: 'high',
      category: 'security',
      affected: ['GET /search (q)'],
      title: 'GET /search shows what you type in "q" without cleaning it',
    });
    expect(sql).toMatchObject({
      severity: 'high',
      confidence: 'high',
      affected: ['GET /search (q)'],
      title: 'A stray quote in "q" makes GET /search show a database error',
    });
    expect(sql?.evidence).toContain(
      'made the app show a MySQL error message: "You have an error in your SQL syntax".',
    );
  });

  it('only types markup that names an element that does not exist', async () => {
    const { http } = await vandalise('vuln');
    const markup = http.requests.flatMap(typedValues).filter((value) => value.includes('<'));

    expect(markup.length).toBeGreaterThan(0);
    for (const value of markup) expect(value).toMatch(/^(?:["']>)?<hg-hooligans-test-run>$/);
  });

  it('marks what it types with the run id, and says what it does not check', async () => {
    const { http, notLookedAt } = await vandalise('vuln');
    const posts = http.requests.filter((request) => request.method === 'POST');

    expect(posts.length).toBeGreaterThan(5);
    expect(posts.every((request) => request.body?.includes(MARKER))).toBe(true);
    expect(notLookedAt?.[0]).toContain(`leaves junk data marked with ${MARKER}`);
    expect(notLookedAt?.[0]).toContain(
      'does not check input that is stored and shown on a later page',
    );
  });

  it('never follows a redirect, and leaves the login form alone', async () => {
    const { http } = await vandalise('vuln');
    const paths = http.requests.map((request) => new URL(request.url).pathname);

    expect(http.requests.every((request) => request.redirect === 'manual')).toBe(true);
    expect(paths).not.toContain('/api/login');
  });
});

describe('Vandal on the fixed site', () => {
  it('finds nothing', async () => {
    const { findings } = await vandalise('fixed');

    expect(findings).toEqual([]);
  });
});

describe('Vandal reading the answer carefully', () => {
  it('ignores a JSON answer that repeats what was typed', async () => {
    const echo: FakeRoute = (request) => ({
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: typedQuery(request) }),
    });
    const { findings } = await runOn(only, { '/search': echo });

    expect(findings).toEqual([]);
  });

  it('does not blame a page that already talks about a database error', async () => {
    const docs = {
      headers: { 'content-type': 'text/html' },
      body: '<p>See SQLSTATE[42000] in the manual</p>',
    };
    const { findings, http } = await runOn(only, { '/search': docs });

    expect(findings).toEqual([]);
    expect(http.requests).toHaveLength(4);
    expect(http.requests.map(typedQuery)).not.toContain("'");
  });

  it('leaves a form alone when an ordinary request to it already fails', async () => {
    const broken = { status: 500, body: 'Internal Server Error' };
    const { findings, notLookedAt, http } = await runOn(only, { '/search': broken });

    expect(findings).toEqual([]);
    expect(http.requests).toHaveLength(1);
    expect(notLookedAt).toContain(
      'Vandal left GET /search alone, because it did not answer an ordinary request properly.',
    );
  });

  it('leaves a form alone when the app does not answer at all', async () => {
    const { findings, notLookedAt, http } = await runOn(only, { '/search': 'network-error' });

    expect(findings).toEqual([]);
    expect(http.requests).toHaveLength(1);
    expect(notLookedAt?.join(' ')).toContain('Vandal left GET /search alone');
  });
});

describe('Vandal limits', () => {
  it('stops after 60 requests, however many forms there are', async () => {
    const { notLookedAt, http } = await runOn(manyForms(8, 3), {});

    expect(http.requests).toHaveLength(60);
    expect(notLookedAt).toContain('Vandal stopped after 60 requests.');
  });

  it('says so when there is nothing to type into', async () => {
    const { findings, notLookedAt, http } = await runOn(makeMap(), {});

    expect(findings).toEqual([]);
    expect(http.requests).toEqual([]);
    expect(notLookedAt).toContain('Vandal found no form or search field it could type into.');
  });

  it('passes on a spent budget, so the whole scan can stop', async () => {
    const http = fakeHttp({ '/api/contact': () => new EgressError('budget', 'Out of requests.') });

    await expect(vandal.run(makeContext(shopMap(), http))).rejects.toMatchObject({
      kind: 'budget',
    });
  });

  it('asks for at most 2 requests a second and needs no login', () => {
    expect(vandal.requestsPerSecond).toBe(2);
    expect(vandal.sessions).toBe(0);
  });
});
