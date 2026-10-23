import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../../../src/core/context.js';
import { EgressError, type EgressErrorKind } from '../../../src/guardrails/egress/gate.js';
import {
  attempt,
  benignValue,
  buildRequest,
  describeLeft,
  findTargets,
  FuzzBudget,
  isFuzzable,
  kindOf,
  type FuzzTarget,
} from '../../../src/hooligans/_shared/fuzz.js';
import { fakeHttp } from '../../helpers/fake-http.js';
import { makeMap, shopMap } from '../../helpers/maps.js';

const MARKER = 'hooligans-test-run';

const contact: FuzzTarget = {
  method: 'POST',
  url: 'http://localhost:3000/api/contact',
  path: '/api/contact',
  page: 'http://localhost:3000/contact.html',
  fields: [
    { name: 'name', type: 'text' },
    { name: 'email', type: 'email' },
  ],
};

const search: FuzzTarget = {
  method: 'GET',
  url: 'http://localhost:3000/search',
  path: '/search',
  page: 'http://localhost:3000/',
  fields: [{ name: 'q', type: 'search' }],
};

function form(action: string, fields: { name: string; type: string }[], method = 'POST') {
  return {
    page: 'http://localhost:3000/',
    action: `http://localhost:3000${action}`,
    method,
    fields,
  };
}

describe('findTargets', () => {
  it('picks the contact form and the search form, and leaves the login form alone', () => {
    const { targets, left } = findTargets(shopMap(), false);

    expect(targets.map((target) => `${target.method} ${target.path}`)).toEqual([
      'POST /api/contact',
      'GET /search',
    ]);
    expect(left).toEqual({ logins: 1, risky: 0, calls: 1 });
  });

  it('only types into fields that take text or a number', () => {
    const contactForm = findTargets(shopMap(), false).targets[0];

    expect(contactForm?.fields.map((field) => field.name)).toEqual(['name', 'message']);
  });

  it('finds search fields in the query strings of pages and calls', () => {
    const map = makeMap({
      pages: [{ url: 'http://localhost:3000/shop?sort=price&page=2', status: 200, headers: {} }],
      calls: [
        { method: 'GET', url: 'http://localhost:3000/api/items?q=a', status: 200, sentAuth: false },
      ],
    });
    const { targets } = findTargets(map, false);

    expect(targets.map((target) => [target.path, target.fields.map((f) => f.name)])).toEqual([
      ['/shop', ['sort', 'page']],
      ['/api/items', ['q']],
    ]);
  });

  it('prefers the form over a query string for the same address', () => {
    const map = shopMap({
      pages: [{ url: 'http://localhost:3000/search?q=shoes', status: 200, headers: {} }],
    });

    expect(
      findTargets(map, false).targets.filter((target) => target.path === '/search'),
    ).toHaveLength(1);
  });

  it('leaves out other sites, uploads, and the APIs of Supabase and Next.js', () => {
    const map = makeMap({
      forms: [
        { ...form('/x', [{ name: 'a', type: 'text' }]), action: 'https://other.example/post' },
        form('/upload', [{ name: 'file', type: 'file' }]),
        form('/rest/v1/orders', [{ name: 'a', type: 'text' }]),
      ],
      calls: [
        {
          method: 'GET',
          url: 'http://localhost:3000/_next/data/x.json?a=1',
          status: 200,
          sentAuth: false,
        },
      ],
    });

    expect(findTargets(map, false).targets).toEqual([]);
  });

  it('leaves out routes that look risky, unless they were asked for', () => {
    const map = makeMap({ forms: [form('/api/checkout', [{ name: 'note', type: 'text' }])] });

    expect(findTargets(map, false)).toMatchObject({ targets: [], left: { risky: 1 } });
    expect(findTargets(map, true).targets).toHaveLength(1);
  });

  it('leaves out routes that look destructive, even when risky ones are asked for', () => {
    const map = makeMap({ forms: [form('/delete-account', [{ name: 'note', type: 'text' }])] });

    expect(findTargets(map, true)).toMatchObject({ targets: [], left: { risky: 1 } });
  });

  it('leaves out query values that look like credentials', () => {
    const map = makeMap({
      pages: [{ url: 'http://localhost:3000/shop?token=abc&id=5', status: 200, headers: {} }],
    });

    expect(findTargets(map, false).targets[0]?.fields.map((field) => field.name)).toEqual(['id']);
  });

  it('takes at most 8 targets and 3 fields from each', () => {
    const pages = Array.from({ length: 12 }, (_, index) => ({
      url: `http://localhost:3000/p${index}?a=1&b=2&c=3&d=4&e=5`,
      status: 200,
      headers: {},
    }));
    const { targets } = findTargets(makeMap({ pages }), false);

    expect(targets).toHaveLength(8);
    expect(targets.every((target) => target.fields.length === 3)).toBe(true);
  });

  it('counts the calls it cannot type into, once for each route', () => {
    const map = makeMap({
      calls: [
        { method: 'POST', url: 'http://localhost:3000/api/a', status: 200, sentAuth: false },
        { method: 'PUT', url: 'http://localhost:3000/api/a', status: 200, sentAuth: false },
        { method: 'PATCH', url: 'http://localhost:3000/api/b', status: 200, sentAuth: false },
        { method: 'DELETE', url: 'http://localhost:3000/api/c', status: 200, sentAuth: false },
      ],
    });

    expect(findTargets(map, false).left.calls).toBe(2);
  });
});

describe('fields', () => {
  it('knows which are worth typing into', () => {
    expect(isFuzzable({ name: 'a', type: 'text' })).toBe(true);
    expect(isFuzzable({ name: 'a', type: 'number' })).toBe(true);
    expect(isFuzzable({ name: 'a', type: 'select-one' })).toBe(false);
    expect(isFuzzable({ name: 'a', type: 'hidden' })).toBe(false);
    expect(isFuzzable({ name: 'a', type: 'checkbox' })).toBe(false);
  });

  it('knows a number from text', () => {
    expect(kindOf({ name: 'a', type: 'number' })).toBe('number');
    expect(kindOf({ name: 'a', type: 'range' })).toBe('number');
    expect(kindOf({ name: 'a', type: 'email' })).toBe('text');
  });

  it('fills an ordinary value that carries the marker', () => {
    expect(benignValue({ name: 'a', type: 'text' }, MARKER)).toBe(MARKER);
    expect(benignValue({ name: 'a', type: 'email' }, MARKER)).toBe(`${MARKER}@hooligans.invalid`);
    expect(benignValue({ name: 'a', type: 'number' }, MARKER)).toBe('1');
    expect(benignValue({ name: 'a', type: 'url' }, MARKER)).toBe(
      `https://hooligans.invalid/${MARKER}`,
    );
  });
});

describe('describeLeft', () => {
  it('says nothing when nothing was left out', () => {
    expect(describeLeft('Vandal', { logins: 0, risky: 0, calls: 0 })).toBeNull();
  });

  it('says what was left out, in one sentence', () => {
    expect(describeLeft('Fat Fingers', { logins: 1, risky: 2, calls: 3 })).toBe(
      'Fat Fingers did not type into a login or signup form (Brute looks at those), 2 routes whose name suggests side effects (use --include-risky to include them) and 3 calls the page makes with a JSON body, because their fields are not visible yet.',
    );
  });
});

describe('buildRequest', () => {
  it('posts a form the way a browser would, with the marker in every field', () => {
    const request = buildRequest(contact, MARKER);

    expect(request).toMatchObject({
      method: 'POST',
      url: 'http://localhost:3000/api/contact',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3000',
        referer: 'http://localhost:3000/contact.html',
      },
    });

    const body = new URLSearchParams(request.body);
    expect(body.get('name')).toBe(MARKER);
    expect(body.get('email')).toBe(`${MARKER}@hooligans.invalid`);
  });

  it('puts the fields of a GET in the query', () => {
    expect(buildRequest(search, MARKER).url).toBe(`http://localhost:3000/search?q=${MARKER}`);
    expect(buildRequest(search, MARKER).method).toBe('GET');
  });

  it('replaces one field and leaves the others ordinary', () => {
    const request = buildRequest(contact, MARKER, { name: 'name', value: 'x y&z' });
    const body = new URLSearchParams(request.body);

    expect(body.get('name')).toBe('x y&z');
    expect(body.get('email')).toBe(`${MARKER}@hooligans.invalid`);
  });

  it('encodes what it puts in the query', () => {
    const request = buildRequest(search, MARKER, { name: 'q', value: `"><b>'` });

    expect(new URL(request.url).searchParams.get('q')).toBe(`"><b>'`);
    expect(request.url).not.toContain('<');
  });
});

describe('attempt', () => {
  const failing = (error: unknown): HttpClient => ({
    request: async () => {
      throw error;
    },
  });

  it('wraps an answer', async () => {
    const result = await attempt(fakeHttp({ '/a': { body: 'hi' } }), {
      method: 'GET',
      url: 'http://localhost:3000/a',
    });

    expect(result).toMatchObject({ kind: 'answer', response: { body: 'hi' } });
  });

  it.each<[EgressErrorKind, string]>([
    ['timeout', 'hang'],
    ['network', 'down'],
    ['blocked', 'failed'],
  ])('turns a %s error into %s', async (kind, expected) => {
    const result = await attempt(failing(new EgressError(kind, 'x')), {
      method: 'GET',
      url: 'http://localhost:3000/a',
    });

    expect(result.kind).toBe(expected);
  });

  it('turns an unexpected error into failed', async () => {
    const result = await attempt(failing(new TypeError('odd')), {
      method: 'GET',
      url: 'http://localhost:3000/a',
    });

    expect(result.kind).toBe('failed');
  });

  it.each<EgressErrorKind>(['budget', 'aborted'])('passes on a %s error', async (kind) => {
    await expect(
      attempt(failing(new EgressError(kind, 'stop')), {
        method: 'GET',
        url: 'http://localhost:3000/a',
      }),
    ).rejects.toMatchObject({ kind });
  });
});

describe('FuzzBudget', () => {
  it('allows the number of requests it was given, and no more', () => {
    const budget = new FuzzBudget(3);

    expect([budget.take(), budget.take(), budget.take(), budget.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(budget.exhausted).toBe(true);
    expect(budget.stopped).toBe(true);
  });

  it('stops after five failures in a row', () => {
    const budget = new FuzzBudget(100);

    for (let index = 0; index < 4; index += 1) budget.record(false);
    expect(budget.broken).toBe(false);

    budget.record(false);
    expect(budget.broken).toBe(true);
    expect(budget.take()).toBe(false);
  });

  it('starts counting again after a success', () => {
    const budget = new FuzzBudget(100);

    for (let index = 0; index < 4; index += 1) budget.record(false);
    budget.record(true);
    for (let index = 0; index < 4; index += 1) budget.record(false);

    expect(budget.broken).toBe(false);
  });
});
