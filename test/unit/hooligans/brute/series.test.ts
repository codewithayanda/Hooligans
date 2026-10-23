import { describe, expect, it } from 'vitest';
import { runSeries } from '../../../../src/hooligans/brute/series.js';
import type { Target } from '../../../../src/hooligans/brute/targets.js';
import { valuesFor } from '../../../../src/hooligans/brute/values.js';
import { EgressError } from '../../../../src/guardrails/egress/gate.js';
import { fakeHttp } from '../../../helpers/fake-http.js';

const make = valuesFor('test-run', () => 'Pw-fixed');

const login: Target = {
  kind: 'login',
  url: 'http://localhost:3000/api/login',
  path: '/api/login',
  page: 'http://localhost:3000/login.html',
  body: {
    kind: 'form',
    fields: [
      { name: 'email', fill: 'email' },
      { name: 'password', fill: 'password' },
    ],
  },
  browserStatus: null,
};

const wrong = {
  status: 401,
  headers: { 'content-type': 'application/json' },
  body: '{"error":"Wrong"}',
};

describe('runSeries', () => {
  it('takes every attempt when nothing pushes back, with a different made-up person each time', async () => {
    const http = fakeHttp({ '/api/login': wrong });
    const result = await runSeries({ http, target: login, count: 10, values: make });

    expect(result).toMatchObject({ kind: 'open', attempts: 10, statuses: [401] });
    expect(http.requests).toHaveLength(10);

    const first = new URLSearchParams(http.requests[0]?.body);
    const last = new URLSearchParams(http.requests[9]?.body);

    expect(first.get('email')).toBe('hooligans-test-run-1@hooligans.invalid');
    expect(first.get('password')).toBe('Pw-fixed');
    expect(last.get('email')).toBe('hooligans-test-run-10@hooligans.invalid');
  });

  it('posts the way a browser would, and never follows a redirect', async () => {
    const http = fakeHttp({ '/api/login': wrong });
    await runSeries({ http, target: login, count: 1, values: make });

    expect(http.requests[0]).toMatchObject({
      method: 'POST',
      url: 'http://localhost:3000/api/login',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3000',
        referer: 'http://localhost:3000/login.html',
      },
    });
  });

  it('builds a JSON body when the login sends one', async () => {
    const json: Target = {
      ...login,
      body: {
        kind: 'json',
        text: '{"email":"HOOLIGANSIDENTIFIER","password":"HOOLIGANSPASSWORD"}',
      },
    };
    const http = fakeHttp({ '/api/login': wrong });
    await runSeries({ http, target: json, count: 1, values: make });

    expect(http.requests[0]?.body).toBe(
      '{"email":"hooligans-test-run-1@hooligans.invalid","password":"Pw-fixed"}',
    );
    expect(http.requests[0]?.headers?.['content-type']).toBe('application/json');
  });

  it('stops at the first 429', async () => {
    let calls = 0;
    const http = fakeHttp({
      '/api/login': () => {
        calls += 1;
        return calls > 5 ? { status: 429, headers: { 'retry-after': '60' }, body: '' } : wrong;
      },
    });
    const result = await runSeries({ http, target: login, count: 30, values: make });

    expect(result).toMatchObject({ kind: 'pushed-back', at: 6 });
    expect(http.requests).toHaveLength(6);
  });

  it('stops when the answer changes to a refusal', async () => {
    let calls = 0;
    const http = fakeHttp({
      '/api/login': () => {
        calls += 1;
        return calls > 3 ? { status: 403, body: 'blocked' } : wrong;
      },
    });
    const result = await runSeries({ http, target: login, count: 30, values: make });

    expect(result).toMatchObject({ kind: 'pushed-back', at: 4 });
  });

  it.each<[number, string, string]>([
    [403, 'Forbidden', 'needs a token only a browser has'],
    [419, 'Page expired', 'needs a token only a browser has'],
    [404, 'Not found', 'does not look like a working login route'],
    [405, '', 'does not look like a working login route'],
    [500, 'Oops', 'answered 500 to the first request'],
    [400, 'CSRF token missing', 'a security token that only a browser has'],
    [422, 'The csrf token is invalid', 'a security token that only a browser has'],
  ])(
    'does not test a route whose first answer is %i, because that says nothing about limits',
    async (status, body, why) => {
      const http = fakeHttp({ '/api/login': { status, body } });
      const result = await runSeries({ http, target: login, count: 10, values: make });

      expect(result.kind).toBe('untestable');
      expect(result.kind === 'untestable' ? result.why : '').toContain(why);
      expect(http.requests).toHaveLength(1);
    },
  );

  it('goes on when a 400 is only a message about the input', async () => {
    const http = fakeHttp({ '/api/login': { status: 400, body: 'Invalid input' } });
    const result = await runSeries({ http, target: login, count: 4, values: make });

    expect(result).toMatchObject({ kind: 'open', attempts: 4, statuses: [400] });
  });

  it('checks that a plain request gets the answer a browser got', async () => {
    const http = fakeHttp({ '/api/login': { status: 400, body: 'Bad request' } });
    const learned: Target = { ...login, browserStatus: 401 };
    const result = await runSeries({ http, target: learned, count: 10, values: make });

    expect(result.kind).toBe('untestable');
    expect(result.kind === 'untestable' ? result.why : '').toContain('where a browser got 401');

    const same = fakeHttp({ '/api/login': wrong });
    expect(await runSeries({ http: same, target: learned, count: 3, values: make })).toMatchObject({
      kind: 'open',
    });
  });

  it('gives up after three failures in a row', async () => {
    const http = fakeHttp({ '/api/login': 'network-error' });
    const result = await runSeries({ http, target: login, count: 10, values: make });

    expect(result).toEqual({ kind: 'failing', why: 'the app stopped answering' });
    expect(http.requests).toHaveLength(3);
  });

  it('does not count a failure against a series that carries on', async () => {
    let calls = 0;
    const http = fakeHttp({
      '/api/login': () => {
        calls += 1;
        return calls % 2 === 1 ? new EgressError('network', 'No answer.') : wrong;
      },
    });
    const result = await runSeries({ http, target: login, count: 6, values: make });

    expect(result).toMatchObject({ kind: 'open', attempts: 3 });
    expect(http.requests).toHaveLength(6);
  });

  it('passes on a spent budget, so the whole scan can stop', async () => {
    const http = fakeHttp({ '/api/login': () => new EgressError('budget', 'Used up.') });

    await expect(runSeries({ http, target: login, count: 5, values: make })).rejects.toMatchObject({
      kind: 'budget',
    });
  });

  it('counts the seconds with the clock it is given', async () => {
    let time = 0;
    const now = () => (time += 1_000);
    const http = fakeHttp({ '/api/login': wrong });
    const result = await runSeries({ http, target: login, count: 3, values: make, now });

    expect(result.kind === 'open' ? result.seconds : 0).toBeGreaterThan(1);
  });

  it('only ever posts made-up values', async () => {
    const http = fakeHttp({ '/api/login': wrong });
    await runSeries({ http, target: login, count: 5, values: make });

    for (const request of http.requests) {
      const body = new URLSearchParams(request.body);

      expect(request.method).toBe('POST');
      expect(body.get('email')).toMatch(/^hooligans-test-run-\d+@hooligans\.invalid$/);
      expect(body.get('password')).toBe('Pw-fixed');
    }
  });
});
