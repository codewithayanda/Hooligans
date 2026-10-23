import { describe, expect, it } from 'vitest';
import type {
  CaptureValues,
  HttpRequest,
  Submission,
  SubmitCapture,
} from '../../../../src/core/context.js';
import { EgressError } from '../../../../src/guardrails/egress/gate.js';
import { brute as defaultBrute, createBrute } from '../../../../src/hooligans/brute/index.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp, type FakeReply } from '../../../helpers/fake-http.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap } from '../../../helpers/maps.js';

type Field = { name: string; type: string };

const brute = createBrute({ password: () => 'Pw-fixed' });

const email: Field = { name: 'email', type: 'email' };
const password: Field = { name: 'password', type: 'password' };

function form(action: string, fields: Field[], page: string) {
  return {
    page: `http://localhost:3000${page}`,
    action: `http://localhost:3000${action}`,
    method: 'POST',
    fields,
  };
}

/** The forms of a small shop: login, signup and a password reset. */
function accounts() {
  return makeMap({
    forms: [
      form('/api/login', [email, password], '/login.html'),
      form('/api/signup', [email, password], '/signup.html'),
      form('/api/forgot', [email], '/forgot.html'),
    ],
  });
}

/** An app that answers every wrong attempt the same way, for ever. */
function openSite() {
  return fakeHttp({
    '/api/login': { status: 401, body: '{"error":"Wrong email or password"}' },
    '/api/signup': { status: 201, body: '{"ok":true}' },
    '/api/forgot': { status: 202, body: '{"ok":true}' },
    '/api/session': { status: 401, body: '{"error":"Wrong email or password"}' },
  });
}

/** An app that says 429 after `limit` attempts on a route. */
function limitedSite(limit = 5) {
  const counts = new Map<string, number>();
  const answer =
    (status: number) =>
    (request: HttpRequest): FakeReply => {
      const path = new URL(request.url).pathname;
      const count = (counts.get(path) ?? 0) + 1;
      counts.set(path, count);

      return count > limit
        ? { status: 429, headers: { 'retry-after': '60' }, body: '{"error":"Too many attempts"}' }
        : { status, body: '{}' };
    };

  return fakeHttp({
    '/api/login': answer(401),
    '/api/signup': answer(201),
    '/api/forgot': answer(202),
  });
}

const submission = (body: Partial<Submission> = {}): Submission => ({
  method: 'POST',
  url: 'http://localhost:3000/api/session',
  contentType: 'application/json',
  body: '{}',
  status: 401,
  ...body,
});

const loginPage = makeMap({
  pages: [{ url: 'http://localhost:3000/app-login.html', status: 200, headers: {} }],
});

describe('Brute on a site with no limits', () => {
  it('finds the login, the signup and the reset that take every attempt', async () => {
    const http = openSite();
    const result = await brute.run(makeContext(accounts(), http));

    expect(result.findings.map((finding) => finding.id)).toEqual([
      'brute.no-rate-limit',
      'brute.signup-no-limit',
      'brute.reset-no-limit',
    ]);
    expect(http.requests).toHaveLength(30 + 10 + 10);
    for (const finding of result.findings) expectWellFormed(finding);
  });

  it('rates the login as serious and the other two as worth a look', async () => {
    const result = await brute.run(makeContext(accounts(), openSite()));
    const [login, signup, reset] = result.findings;

    expect(login).toMatchObject({
      severity: 'high',
      confidence: 'medium',
      affected: ['POST /api/login'],
      title: 'POST /api/login accepted 30 wrong logins without slowing down',
    });
    expect(login?.evidence).toContain(
      '30 wrong logins in 1 second on POST /api/login, using made-up users and random passwords. Every answer was a 401.',
    );
    expect(signup).toMatchObject({ severity: 'low', confidence: 'low' });
    expect(reset).toMatchObject({ severity: 'low', confidence: 'low' });
    expect(signup?.evidence).toContain('hooligans-test-run');
  });

  it('only posts made-up values, and a different person for each route', async () => {
    const http = openSite();
    await brute.run(makeContext(accounts(), http));

    const emailOf = (index: number) => new URLSearchParams(http.requests[index]?.body).get('email');

    expect(http.requests.every((request) => request.method === 'POST')).toBe(true);
    expect(emailOf(0)).toBe('hooligans-test-run-1@hooligans.invalid');
    expect(emailOf(30)).toBe('hooligans-test-run-1001@hooligans.invalid');
    expect(emailOf(40)).toBe('hooligans-test-run-2001@hooligans.invalid');
  });
});

describe('Brute on a site that pushes back', () => {
  it('stops at the first 429 on each route, and finds nothing', async () => {
    const http = limitedSite();
    const result = await brute.run(makeContext(accounts(), http));

    expect(result.findings).toEqual([]);
    expect(http.requests).toHaveLength(6 + 6 + 6);
  });
});

describe('Brute on a login that needs a browser', () => {
  it('learns the request from a browser, then repeats it with made-up people', async () => {
    const asked: { page: string; values: CaptureValues }[] = [];
    const capture: SubmitCapture = async (page, values) => {
      asked.push({ page, values });
      return submission({
        body: JSON.stringify({ email: values.identifier, password: values.password }),
      });
    };
    const http = openSite();
    const result = await brute.run(makeContext(loginPage, http, { capture }));

    expect(asked).toHaveLength(1);
    expect(asked[0]?.page).toBe('http://localhost:3000/app-login.html');
    expect(asked[0]?.values.identifier).toBe('hooligans-test-run-0@hooligans.invalid');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      id: 'brute.no-rate-limit',
      affected: ['POST /api/session'],
    });
    expect(http.requests).toHaveLength(30);
    expect(http.requests[0]?.body).toBe(
      '{"email":"hooligans-test-run-1@hooligans.invalid","password":"Pw-fixed"}',
    );
    expect(http.requests[0]?.headers?.['content-type']).toBe('application/json');
  });

  it('leaves a login alone when the browser sent it to another address', async () => {
    const capture: SubmitCapture = async (_page, values) =>
      submission({
        url: 'http://localhost:4000/api/login',
        body: JSON.stringify({ email: values.identifier, password: values.password }),
      });
    const http = openSite();
    const result = await brute.run(makeContext(loginPage, http, { capture }));

    expect(http.requests).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.notLookedAt?.join(' ')).toContain('not to the address Hooligans was given');
  });

  it('says so when the scan has no browser', async () => {
    const result = await brute.run(makeContext(loginPage, openSite()));

    expect(result.notLookedAt?.join(' ')).toContain(
      'Brute found a page that looks like a login (/app-login.html), but this scan has no browser to try it with.',
    );
  });

  it('says so when it cannot repeat what the browser sent', async () => {
    const capture: SubmitCapture = async () =>
      submission({ contentType: 'multipart/form-data; boundary=x', body: 'x' });
    const result = await brute.run(makeContext(loginPage, openSite(), { capture }));

    expect(result.notLookedAt?.join(' ')).toContain('could not repeat the request it sent');
  });

  it('says so when the browser could not submit the form, or broke', async () => {
    const nothing: SubmitCapture = async () => null;
    const broken: SubmitCapture = async () => {
      throw new Error('The browser crashed.');
    };

    for (const capture of [nothing, broken]) {
      const result = await brute.run(makeContext(loginPage, openSite(), { capture }));

      expect(result.findings).toEqual([]);
      expect(result.notLookedAt?.join(' ')).toContain('could not fill in and submit its form');
    }
  });
});

describe('Brute when it cannot tell', () => {
  it('does not test a login whose first answer says it needs a token', async () => {
    const http = fakeHttp({ '/api/login': { status: 403, body: 'Forbidden' } });
    const map = makeMap({ forms: [form('/api/login', [email, password], '/login.html')] });
    const result = await brute.run(makeContext(map, http));

    expect(result.findings).toEqual([]);
    expect(result.notLookedAt).toContain(
      'Brute could not test POST /api/login: it answered 403 to the first request, which usually means it needs a token only a browser has.',
    );
    expect(http.requests).toHaveLength(1);
  });

  it('stops on an app that stops answering', async () => {
    const http = fakeHttp({ '/api/login': 'network-error' });
    const map = makeMap({ forms: [form('/api/login', [email, password], '/login.html')] });
    const result = await brute.run(makeContext(map, http));

    expect(result.notLookedAt).toContain(
      'Brute stopped on POST /api/login, because the app stopped answering.',
    );
  });

  it('says so when there is nothing to try', async () => {
    const http = openSite();
    const result = await brute.run(makeContext(makeMap(), http));

    expect(http.requests).toEqual([]);
    expect(result.notLookedAt).toContain(
      'Brute found no login, signup or password reset form it could try.',
    );
  });

  it('says which backend handles the login when the app uses one', async () => {
    const map = makeMap({ stack: { backends: ['supabase'] } });
    const result = await brute.run(makeContext(map, openSite()));

    expect(result.notLookedAt).toContain(
      'Your app uses Supabase, which handles its own logins. Hooligans does not hammer another site.',
    );
  });

  it('leaves out routes that look risky, unless they were asked for', async () => {
    const map = makeMap({ forms: [form('/api/send-login', [email, password], '/login.html')] });
    const http = fakeHttp({ '/api/send-login': { status: 401, body: 'nope' } });

    const left = await brute.run(makeContext(map, http));
    expect(left.notLookedAt).toContain(
      'Brute left a form alone, because the route looks like it has side effects (use --include-risky to include them).',
    );
    expect(http.requests).toEqual([]);

    const asked = await brute.run(makeContext(map, http, { includeRisky: true }));
    expect(asked.findings).toHaveLength(1);
  });
});

describe('Brute', () => {
  it('passes on a spent budget, so the whole scan can stop', async () => {
    const http = fakeHttp({ '/api/login': () => new EgressError('budget', 'Used up.') });
    const map = makeMap({ forms: [form('/api/login', [email, password], '/login.html')] });

    await expect(brute.run(makeContext(map, http))).rejects.toMatchObject({ kind: 'budget' });
  });

  it('says what it does and what it cannot see', async () => {
    const result = await brute.run(makeContext(makeMap(), openSite()));

    expect(result.notLookedAt?.[0]).toContain('at most 30 attempts a minute');
    expect(result.notLookedAt?.[0]).toContain('hooligans-test-run');
    expect(result.notLookedAt?.[0]).toContain('only applies to real accounts');
  });

  it('keeps to 30 attempts a minute, and needs no saved login', () => {
    expect(defaultBrute.requestsPerSecond).toBe(0.5);
    expect(defaultBrute.stage).toBe(3);
    expect(defaultBrute.sessions).toBe(0);
  });
});
