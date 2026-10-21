import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../../../../src/core/context.js';
import { EgressError } from '../../../../src/guardrails/egress/gate.js';
import { pickpocket } from '../../../../src/hooligans/pickpocket/index.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp, type FakeRoute } from '../../../helpers/fake-http.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { loadMap, makeMap, type FixtureName } from '../../../helpers/maps.js';

const stripe = ['sk', 'live', 'x'.repeat(24)].join('_');
const databaseUrl = ['postgres://app', 'hunter2@localhost:5432/app'].join(':');

function jwt(claims: object): string {
  const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.${'s'.repeat(30)}`;
}

const sourceMap = JSON.stringify({
  version: 3,
  sources: ['src/main.ts'],
  sourcesContent: ['export const price = 10;'],
  names: [],
  mappings: '',
});

const page: FakeRoute = {
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<!doctype html><html><body>Hello</body></html>',
};

function leakyRoutes(): Record<string, FakeRoute> {
  return {
    '/': page,
    '/assets/index-4f2a9c1b.js': {
      headers: { 'content-type': 'text/javascript' },
      body: `var config = { key: '${stripe}' };\n//# sourceMappingURL=index-4f2a9c1b.js.map\n`,
    },
    '/assets/index-4f2a9c1b.js.map': {
      headers: { 'content-type': 'application/json' },
      body: sourceMap,
    },
    '/.env': {
      headers: { 'content-type': 'text/plain' },
      body: `STRIPE_SECRET_KEY=${stripe}\nDATABASE_URL=${databaseUrl}\n`,
    },
    '/.git/config': {
      headers: { 'content-type': 'text/plain' },
      body: '[core]\n\trepositoryformatversion = 0\n',
    },
  };
}

async function scan(name: FixtureName, routes: Record<string, FakeRoute>) {
  const http = fakeHttp(routes);
  const result = await pickpocket.run(makeContext(loadMap(name), http));
  return { ...result, http };
}

describe('Pickpocket on the vulnerable site', () => {
  it('finds what it leaves lying around', async () => {
    const { findings } = await scan('vulnerable', leakyRoutes());

    expect(findings.map((finding) => finding.id).sort()).toEqual([
      'pickpocket.exposed-env',
      'pickpocket.exposed-git',
      'pickpocket.public-source-map',
      'pickpocket.secret.stripe-secret-key',
    ]);
    for (const finding of findings) expectWellFormed(finding);
  });

  it('rates each one by what a stranger could do', async () => {
    const { findings } = await scan('vulnerable', leakyRoutes());
    const severity = (id: string) => findings.find((finding) => finding.id === id)?.severity;

    expect(severity('pickpocket.secret.stripe-secret-key')).toBe('critical');
    expect(severity('pickpocket.exposed-env')).toBe('critical');
    expect(severity('pickpocket.exposed-git')).toBe('high');
    expect(severity('pickpocket.public-source-map')).toBe('medium');
  });

  it('never puts a secret or a setting value into a finding', async () => {
    const { findings } = await scan('vulnerable', leakyRoutes());
    const text = JSON.stringify(findings);

    expect(text).not.toContain(stripe);
    expect(text).not.toContain('hunter2');
  });

  it('names the settings in the .env file, but not their values', async () => {
    const { findings } = await scan('vulnerable', leakyRoutes());
    const evidence = findings.find((finding) => finding.id === 'pickpocket.exposed-env')?.evidence;

    expect(evidence).toContain('STRIPE_SECRET_KEY');
    expect(evidence).toContain('a live Stripe secret key');
    expect(evidence).toContain('a database address with its password');
  });

  it('masks the secret and says it was not used', async () => {
    const { findings } = await scan('vulnerable', leakyRoutes());
    const secret = findings.find((finding) => finding.id === 'pickpocket.secret.stripe-secret-key');

    expect(secret?.evidence).toContain('sk_live...xx');
    expect(secret?.evidence).toContain('did not use it or test it');
    expect(secret?.affected).toEqual(['/assets/index-4f2a9c1b.js']);
  });
});

describe('Pickpocket on a clean site', () => {
  it('finds nothing on the fixed site', async () => {
    const { findings } = await scan('fixed', {
      '/': page,
      '/assets/index-4f2a9c1b.js': { body: 'var price = 10;' },
    });

    expect(findings).toEqual([]);
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
    const result = await pickpocket.run(makeContext(loadMap('vulnerable'), catchAll));

    expect(result.findings).toEqual([]);
  });

  it('carries on when nothing answers', async () => {
    const silent: HttpClient = {
      request: async () => {
        throw new EgressError('network', 'No answer.');
      },
    };
    const result = await pickpocket.run(makeContext(loadMap('vulnerable'), silent));

    expect(result.findings).toEqual([]);
  });
});

describe('Pickpocket on a Supabase app', () => {
  const route = (body: string): Record<string, FakeRoute> => ({
    '/_next/static/chunks/main-abc123.js': { headers: { 'content-type': 'text/javascript' }, body },
  });

  it('leaves the public anon key alone', async () => {
    const body = `createClient("https://abcd.supabase.co", "${jwt({ role: 'anon' })}")`;
    const { findings } = await scan('spa-with-login', route(body));

    expect(findings).toEqual([]);
  });

  it('reports a service_role key as critical, masked', async () => {
    const key = jwt({ role: 'service_role' });
    const { findings } = await scan('spa-with-login', route(`createClient("x", "${key}")`));

    expect(findings.map((finding) => finding.id)).toEqual([
      'pickpocket.secret.supabase-service-role-key',
    ]);
    expect(findings[0]?.severity).toBe('critical');
    expect(JSON.stringify(findings)).not.toContain(key);
    for (const finding of findings) expectWellFormed(finding);
  });
});

describe('Pickpocket stays in bounds', () => {
  it('only reads files on the app itself', async () => {
    const map = loadMap('vulnerable');
    const withOutsider = {
      ...map,
      assets: [...map.assets, { url: 'https://cdn.example.com/lib.js', kind: 'script' as const }],
    };
    const http = fakeHttp(leakyRoutes());
    await pickpocket.run(makeContext(withOutsider, http));

    expect(http.requests.length).toBeGreaterThan(0);
    expect(http.requests.every((request) => request.url.startsWith('http://localhost:3000/'))).toBe(
      true,
    );
  });

  it('only reads, and never sends anything', async () => {
    const http = fakeHttp(leakyRoutes());
    await pickpocket.run(makeContext(loadMap('vulnerable'), http));

    expect(http.requests.every((request) => request.method === 'GET')).toBe(true);
    expect(http.requests.every((request) => request.body === undefined)).toBe(true);
  });

  it('reads at most 25 scripts, and says how many it left', async () => {
    const assets = Array.from({ length: 30 }, (_, index) => ({
      url: `http://localhost:3000/assets/chunk-${index}.js`,
      kind: 'script' as const,
    }));
    const http = fakeHttp();
    const result = await pickpocket.run(makeContext(makeMap({ assets }), http));
    const scripts = http.requests.filter((request) =>
      /\/assets\/chunk-\d+\.js$/.test(new URL(request.url).pathname),
    );

    expect(scripts).toHaveLength(25);
    expect(result.notLookedAt).toContain('Pickpocket read 25 scripts and left 5 unread.');
  });

  it('says what it does not look at', async () => {
    const { notLookedAt } = await scan('fixed', {});

    expect(notLookedAt?.[0]).toContain('does not guess other file names');
  });
});
