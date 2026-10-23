import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../../../../src/core/context.js';
import {
  checkDebugPages,
  checkOpenRoutes,
  describeData,
  routeCandidates,
} from '../../../../src/hooligans/door-rattler/open-routes.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp } from '../../../helpers/fake-http.js';
import { json, siteRoutes } from '../../../helpers/fake-site.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap, shopMap } from '../../../helpers/maps.js';

type Data = { items: number | null; fields: string[] } | null;

const call = (url: string, method = 'GET') => ({ method, url, status: 200, sentAuth: false });
const lead = (url: string, why: string) => ({ url, why });

describe('describeData', () => {
  it.each<[string, unknown, Data]>([
    ['an empty list', [], null],
    ['a list of records', [{ id: 1, email: 'a' }], { items: 1, fields: ['id', 'email'] }],
    ['an error', { error: 'Unauthorized' }, null],
    [
      'a list inside a wrapper',
      { message: 'ok', users: [{ id: 1 }] },
      { items: 1, fields: ['id'] },
    ],
    ['an empty wrapper', { data: [] }, null],
    ['nobody logged in', { user: null }, null],
    ['a lone number', { count: 5 }, null],
    ['a lone string', { email: 'a@b.c' }, { items: null, fields: ['email'] }],
    ['two fields', { id: 1, role: 'admin' }, { items: null, fields: ['id', 'role'] }],
    ['plain text', 'text', null],
    ['nothing', null, null],
  ])('reads %s', (_name, answer, expected) => {
    expect(describeData(answer)).toEqual(expected);
  });
});

describe('routeCandidates', () => {
  it('takes the private sounding GET routes the page calls or the API docs list', () => {
    const map = makeMap({
      calls: [
        call('http://localhost:3000/api/users'),
        call('http://localhost:3000/api/products'),
        call('http://localhost:3000/api/admin/stats?x=1'),
        call('http://localhost:3000/rest/v1/orders?select=*'),
        call('http://localhost:3000/files/users.pdf'),
        call('http://localhost:3000/api/payments', 'POST'),
        call('https://other.example/api/users'),
      ],
      leads: [
        lead('http://localhost:3000/api/customers', 'OpenAPI lists it: GET'),
        lead('http://localhost:3000/api/invoices/{id}', 'OpenAPI lists it: GET'),
        lead('http://localhost:3000/api/messages', 'OpenAPI lists it: POST'),
        lead('http://localhost:3000/admin/', 'robots.txt asks crawlers to keep out'),
      ],
    });

    expect(routeCandidates(makeContext(map, fakeHttp()))).toEqual([
      '/api/users',
      '/api/admin/stats',
      '/api/customers',
    ]);
  });

  it('leaves out routes that look risky, unless they were asked for', () => {
    const map = makeMap({ calls: [call('http://localhost:3000/api/send-messages')] });

    expect(routeCandidates(makeContext(map, fakeHttp()))).toEqual([]);
    expect(routeCandidates(makeContext(map, fakeHttp(), { includeRisky: true }))).toEqual([
      '/api/send-messages',
    ]);
  });

  it('never takes a route that looks destructive', () => {
    const map = makeMap({ calls: [call('http://localhost:3000/api/users/delete')] });

    expect(routeCandidates(makeContext(map, fakeHttp(), { includeRisky: true }))).toEqual([]);
  });

  it('takes at most 12', () => {
    const calls = Array.from({ length: 20 }, (_, index) =>
      call(`http://localhost:3000/api/users/${index}x`),
    );

    expect(routeCandidates(makeContext(makeMap({ calls }), fakeHttp()))).toHaveLength(12);
  });
});

describe('checkOpenRoutes', () => {
  it('reports a private sounding route that answers with data and no login', async () => {
    const http = fakeHttp(siteRoutes('vuln'));
    const findings = await checkOpenRoutes(makeContext(shopMap(), http));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'door-rattler.open-route',
      severity: 'high',
      confidence: 'medium',
      affected: ['/api/users'],
    });
    expect(findings[0]?.evidence).toBe(
      'GET /api/users with no login returned 1 item with the fields id and email. Its name suggests private data.',
    );
    for (const finding of findings) expectWellFormed(finding);
  });

  it('is quiet when the route asks for a login', async () => {
    const findings = await checkOpenRoutes(makeContext(shopMap(), fakeHttp(siteRoutes('fixed'))));

    expect(findings).toEqual([]);
  });

  it('is quiet about an answer that is an error, a page or not JSON', async () => {
    const routes = {
      '/api/users': json(200, { error: 'Please log in' }),
    };
    const page = {
      '/api/users': { headers: { 'content-type': 'text/html' }, body: '<html></html>' },
    };

    expect(await checkOpenRoutes(makeContext(shopMap(), fakeHttp(routes)))).toEqual([]);
    expect(await checkOpenRoutes(makeContext(shopMap(), fakeHttp(page)))).toEqual([]);
  });

  it('only reads, with nothing that says who is asking, and only the routes that sound private', async () => {
    const http = fakeHttp(siteRoutes('vuln'));
    await checkOpenRoutes(makeContext(shopMap(), http));

    expect(http.requests.map((request) => request.url)).toEqual([
      'http://localhost:3000/api/users',
    ]);
    expect(http.requests.every((request) => request.method === 'GET')).toBe(true);
    expect(http.requests.every((request) => request.headers === undefined)).toBe(true);
  });
});

describe('checkDebugPages', () => {
  it('reports a page that shows its settings, judged by what the page says', async () => {
    const http = fakeHttp(siteRoutes('vuln'));
    const findings = await checkDebugPages(makeContext(shopMap(), http));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'door-rattler.debug-page',
      severity: 'high',
      confidence: 'high',
      title: 'Your Spring Boot settings page is public',
      affected: ['/actuator/env'],
    });
    expect(findings[0]?.evidence).toBe(
      'GET /actuator/env answered with the settings and environment of the application to a request with no login.',
    );
    for (const finding of findings) expectWellFormed(finding);
  });

  it.each([
    [
      '/phpinfo.php',
      '<html><head><title>phpinfo()</title></head></html>',
      'A phpinfo page is public',
    ],
    [
      '/server-status',
      '<h1>Apache Server Status for localhost</h1>',
      'Your Apache status page is public',
    ],
    [
      '/console',
      '<title>Console // Werkzeug Debugger</title>',
      'The Flask debugger console is reachable',
    ],
  ])('recognises %s', async (path, body, title) => {
    const http = fakeHttp({ [path]: { headers: { 'content-type': 'text/html' }, body } });
    const findings = await checkDebugPages(makeContext(shopMap(), http));

    expect(findings.map((finding) => finding.title)).toEqual([title]);
  });

  it('is not fooled by a site that answers every path with its home page', async () => {
    const catchAll: HttpClient = {
      request: async (request) => ({
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: '<!doctype html><html><body>App</body></html>',
        durationMs: 1,
        truncated: false,
        url: request.url,
      }),
    };

    expect(await checkDebugPages(makeContext(shopMap(), catchAll))).toEqual([]);
  });

  it('wants the page to say so, not just to answer', async () => {
    const http = fakeHttp({ '/actuator/env': { body: '{"nothing":"here"}' } });

    expect(await checkDebugPages(makeContext(shopMap(), http))).toEqual([]);
  });
});
