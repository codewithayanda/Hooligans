import { describe, expect, it } from 'vitest';
import {
  checkSupabase,
  findPublicKeys,
  keyHeaders,
  supabaseApis,
  type SupabaseApi,
} from '../../../../src/hooligans/door-rattler/supabase.js';
import { maskSecret } from '../../../../src/util/redact.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp, type FakeRoute } from '../../../helpers/fake-http.js';
import { anonKey, json, makeJwt } from '../../../helpers/fake-site.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap } from '../../../helpers/maps.js';

const publishable = ['sb', 'publishable', 'a'.repeat(24)].join('_');
const local: SupabaseApi = { base: 'http://localhost:3000', host: 'localhost', tables: ['orders'] };
const hosted: SupabaseApi = {
  base: 'https://abcd.supabase.co',
  host: 'abcd.supabase.co',
  tables: ['orders'],
};

const file = (body: string) => ({ url: 'http://localhost:3000/app.js', path: '/app.js', body });

async function check(
  api: SupabaseApi,
  routes: Record<string, FakeRoute>,
  keys: string[] = [anonKey()],
  confirmed: string[] = [],
) {
  const http = fakeHttp(routes);
  const notes: string[] = [];
  const context = makeContext(makeMap(), http, { confirmedHosts: confirmed });
  const findings = await checkSupabase(context, [api], keys, notes);

  return { findings, notes, http };
}

describe('supabaseApis', () => {
  it('finds the tables the page asks for, and leaves functions and other services out', () => {
    const call = (method: string, url: string) => ({ method, url, status: 200, sentAuth: true });
    const map = makeMap({
      calls: [
        call('GET', 'https://abcd.supabase.co/rest/v1/orders?select=*'),
        call('POST', 'https://abcd.supabase.co/rest/v1/orders'),
        call('GET', 'https://abcd.supabase.co/rest/v1/profiles'),
        call('POST', 'https://abcd.supabase.co/rest/v1/rpc/do_it'),
        call('GET', 'https://abcd.supabase.co/auth/v1/user'),
        call('GET', 'http://localhost:3000/api/users'),
      ],
    });

    expect(supabaseApis(map)).toEqual([
      {
        base: 'https://abcd.supabase.co',
        host: 'abcd.supabase.co',
        tables: ['orders', 'profiles'],
      },
    ]);
  });
});

describe('findPublicKeys', () => {
  it('takes an anon key and a publishable key, and never a secret one', () => {
    const body = `a ${anonKey()} b ${makeJwt({ role: 'service_role' })} c ${publishable} d ${anonKey()}`;

    expect(findPublicKeys([file(body)])).toEqual([anonKey(), publishable]);
  });

  it('keeps at most three', () => {
    const body = [1, 2, 3, 4, 5]
      .map((index) => makeJwt({ role: 'anon', ref: `p${index}` }))
      .join(' ');

    expect(findPublicKeys([file(body)])).toHaveLength(3);
  });
});

describe('keyHeaders', () => {
  it('sends a token in both headers and a publishable key in one', () => {
    expect(keyHeaders(anonKey())).toEqual({
      apikey: anonKey(),
      authorization: `Bearer ${anonKey()}`,
    });
    expect(keyHeaders(publishable)).toEqual({ apikey: publishable });
  });
});

describe('checkSupabase', () => {
  const row = { id: 1, user_id: 'u-1', total: 12, email: 'jane@example.com' };

  it('reports a private table that can be read, as critical, with only its column names', async () => {
    const { findings, notes } = await check(local, { '/rest/v1/orders': json(200, [row]) });
    const [finding] = findings;

    expect(findings).toHaveLength(1);
    expect(finding).toMatchObject({
      id: 'door-rattler.open-table',
      severity: 'critical',
      confidence: 'high',
      affected: ['orders (Supabase table)'],
    });
    expect(finding?.evidence).toContain('GET http://localhost:3000/rest/v1/orders?limit=1');
    expect(finding?.evidence).toContain(
      'returned 1 row with the columns id, user_id, total and email',
    );
    expect(JSON.stringify(findings)).not.toContain('jane@example.com');
    expect(notes).toEqual([]);
  });

  it('masks the key and never repeats it', async () => {
    const { findings } = await check(local, { '/rest/v1/orders': json(200, [row]) });
    const text = JSON.stringify(findings);

    expect(text).toContain(maskSecret(anonKey()));
    expect(text).not.toContain(anonKey());
    for (const finding of findings) expectWellFormed(finding);
  });

  it('only worries a little about a table that sounds public', async () => {
    const api = { ...local, tables: ['products'] };
    const { findings } = await check(api, {
      '/rest/v1/products': json(200, [{ id: 1, name: 'Widget' }]),
    });

    expect(findings[0]).toMatchObject({ severity: 'medium', confidence: 'low' });
    expect(findings[0]?.title).toBe('Your products table can be read without a login');
  });

  it('says nothing about a table that answers with no rows, but notes why', async () => {
    const { findings, notes } = await check(local, { '/rest/v1/orders': json(200, []) });

    expect(findings).toEqual([]);
    expect(notes).toEqual([
      'A Supabase table that answered with no rows looks the same as a protected one, so it is not reported.',
    ]);
  });

  it('says nothing about a table it is not allowed to read', async () => {
    const forbidden = json(403, { message: 'permission denied for table orders' });
    const { findings } = await check(local, { '/rest/v1/orders': forbidden });

    expect(findings).toEqual([]);
  });

  it('tries the next key when the first is not accepted', async () => {
    const other = makeJwt({ role: 'anon', ref: 'other' });
    const { findings, http } = await check(
      local,
      {
        '/rest/v1/orders': (request) =>
          request.headers?.apikey === anonKey() ? json(401, {}) : json(200, [row]),
      },
      [anonKey(), other],
    );

    expect(findings).toHaveLength(1);
    expect(http.requests).toHaveLength(2);
  });

  it('only reads, with the key in the headers', async () => {
    const { http } = await check(local, { '/rest/v1/orders': json(200, [row]) });

    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      url: 'http://localhost:3000/rest/v1/orders?select=*&limit=1',
    });
    expect(http.requests[0]?.headers?.apikey).toBe(anonKey());
    expect(http.requests[0]?.headers?.authorization).toBe(`Bearer ${anonKey()}`);
  });

  it('does not read a project that was not confirmed, and says so', async () => {
    const { findings, notes, http } = await check(hosted, { '/rest/v1/orders': json(200, [row]) });

    expect(findings).toEqual([]);
    expect(http.requests).toEqual([]);
    expect(notes).toEqual([
      'Door Rattler did not read abcd.supabase.co, because you did not confirm it is your project.',
    ]);
  });

  it('reads a project that was confirmed', async () => {
    const { findings, http } = await check(
      hosted,
      { '/rest/v1/orders': json(200, [row]) },
      [anonKey()],
      ['abcd.supabase.co'],
    );

    expect(findings).toHaveLength(1);
    expect(http.requests[0]?.url).toBe('https://abcd.supabase.co/rest/v1/orders?select=*&limit=1');
  });

  it('says so when it cannot find the public key, and reads nothing', async () => {
    const { findings, notes, http } = await check(
      local,
      { '/rest/v1/orders': json(200, [row]) },
      [],
    );

    expect(findings).toEqual([]);
    expect(http.requests).toEqual([]);
    expect(notes[0]).toContain('could not find the public Supabase key');
  });
});
