import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EgressGate, type GateOptions } from '../../src/guardrails/egress/gate.js';
import { createRequestLog, type LogEntry } from '../../src/guardrails/egress/request-log.js';
import { startServer, type TestServer } from '../helpers/server.js';

const fakeKey = ['sk', 'live', 'x'.repeat(24)].join('_');

let directory = '';
let gate: EgressGate | undefined;
const servers: TestServer[] = [];

afterEach(async () => {
  gate?.close();
  gate = undefined;
  await Promise.all(servers.splice(0).map((server) => server.close()));
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = '';
});

async function app(handler: Parameters<typeof startServer>[0]): Promise<TestServer> {
  const server = await startServer(handler);
  servers.push(server);
  return server;
}

function logPath(): string {
  directory ||= mkdtempSync(join(tmpdir(), 'hooligans-'));
  return join(directory, 'requests.jsonl');
}

function openGate(
  origins: string[],
  extra: Partial<Omit<GateOptions, 'scope' | 'log'>> = {},
): EgressGate {
  gate = new EgressGate({
    scope: { origins, confirmedHosts: [] },
    log: createRequestLog(logPath()),
    ...extra,
  });
  return gate;
}

function logLines(): LogEntry[] {
  const text = readFileSync(logPath(), 'utf8').trim();
  return text === '' ? [] : text.split('\n').map((line) => JSON.parse(line) as LogEntry);
}

describe('the egress gate', () => {
  it('fetches from the app and logs the request', async () => {
    const server = await app((_request, response) => {
      response.setHeader('content-type', 'text/plain');
      response.end('hello');
    });
    const client = openGate([server.origin]).client('loudmouth');

    const response = await client.request({ method: 'GET', url: `${server.origin}/page?q=1` });

    expect(response.status).toBe(200);
    expect(response.body).toBe('hello');
    expect(logLines()).toMatchObject([
      { hooligan: 'loudmouth', method: 'GET', status: 200, decision: 'allowed', hop: 0 },
    ]);
  });

  it('refuses an origin outside the scope without connecting to it', async () => {
    const inside = await app((_request, response) => response.end('inside'));
    const outside = await app((_request, response) => response.end('outside'));
    const client = openGate([inside.origin]).client('vandal');

    await expect(client.request({ method: 'GET', url: outside.origin })).rejects.toMatchObject({
      kind: 'blocked',
    });

    expect(outside.hits()).toBe(0);
    expect(logLines()[0]).toMatchObject({ decision: 'blocked', status: null });
    expect(logLines()[0]?.reason).toContain('outside');
  });

  it.each([
    'http://10.0.0.5/secret',
    'http://169.254.169.254/latest/meta-data/',
    'http://[fd00::1]/',
  ])('blocks a redirect to %s and logs it', async (location) => {
    const server = await app((_request, response) => {
      response.statusCode = 302;
      response.setHeader('location', location);
      response.end();
    });
    const client = openGate([server.origin]).client('loudmouth');

    await expect(client.request({ method: 'GET', url: server.origin })).rejects.toMatchObject({
      kind: 'blocked',
    });

    const lines = logLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ status: 302, decision: 'allowed', hop: 0 });
    expect(lines[1]).toMatchObject({ decision: 'blocked', hop: 1 });
    expect(lines[1]?.reason).toMatch(/redirect/i);
  });

  it('follows a redirect that stays inside the scope', async () => {
    const server = await app((request, response) => {
      if (request.url === '/old') {
        response.statusCode = 302;
        response.setHeader('location', '/new');
        response.end();
      } else {
        response.end('arrived');
      }
    });
    const client = openGate([server.origin]).client('loudmouth');

    const response = await client.request({ method: 'GET', url: `${server.origin}/old` });

    expect(response.body).toBe('arrived');
    expect(response.url).toBe(`${server.origin}/new`);
    expect(logLines().map((line) => line.hop)).toEqual([0, 1]);
  });

  it('hands back a redirect as it is when asked not to follow', async () => {
    const server = await app((_request, response) => {
      response.statusCode = 302;
      response.setHeader('location', '/elsewhere');
      response.end();
    });
    const client = openGate([server.origin]).client('loudmouth');

    const response = await client.request({ method: 'GET', url: server.origin, redirect: 'manual' });

    expect(response.status).toBe(302);
    expect(response.headers['location']).toBe('/elsewhere');
    expect(server.hits()).toBe(1);
  });

  it('refuses a name that resolves to somewhere that is not this machine', async () => {
    const server = await app((_request, response) => response.end('never reached'));
    const origin = `http://app.test:${server.port}`;
    const client = openGate([origin], {
      resolve: async () => [{ address: '10.0.0.5', family: 4 }],
    }).client('loudmouth');

    await expect(client.request({ method: 'GET', url: origin })).rejects.toMatchObject({
      kind: 'blocked',
    });

    expect(server.hits()).toBe(0);
  });

  it('connects only to the addresses the policy approved', async () => {
    const server = await app((_request, response) => response.end('pinned'));
    const origin = `http://app.test:${server.port}`;
    const client = openGate([origin], {
      resolve: async () => [
        { address: '10.0.0.5', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    }).client('loudmouth');

    const response = await client.request({ method: 'GET', url: origin });

    expect(response.body).toBe('pinned');
    expect(server.hits()).toBe(1);
  });

  it('stops when the request budget is used up', async () => {
    const server = await app((_request, response) => response.end('ok'));
    const client = openGate([server.origin], { maxTotalRequests: 2 }).client('brute');

    await client.request({ method: 'GET', url: server.origin });
    await client.request({ method: 'GET', url: server.origin });

    await expect(client.request({ method: 'GET', url: server.origin })).rejects.toMatchObject({
      kind: 'budget',
    });
    expect(server.hits()).toBe(2);
  });

  it('keeps secrets out of the log', async () => {
    const server = await app((_request, response) => response.end('ok'));
    const client = openGate([server.origin]).client('door-rattler');

    await client.request({
      method: 'POST',
      url: `${server.origin}/x?token=${fakeKey}&q=ok`,
      headers: { authorization: `Bearer ${fakeKey}` },
      body: JSON.stringify({ password: fakeKey }),
    });

    const text = readFileSync(logPath(), 'utf8');
    expect(text).not.toContain(fakeKey);
    expect(text).not.toContain('authorization');
    expect(text).not.toContain('Bearer');
    expect(text).toContain('q=ok');
  });

  it('cuts off a body that is too large', async () => {
    const server = await app((_request, response) => response.end('x'.repeat(10_000)));
    const client = openGate([server.origin]).client('pickpocket');

    const response = await client.request({ method: 'GET', url: server.origin, maxBodyBytes: 1000 });

    expect(response.truncated).toBe(true);
    expect(response.body.length).toBeLessThanOrEqual(1000);
  });

  it('gives up on a server that never answers', async () => {
    const server = await app(() => undefined);
    const client = openGate([server.origin]).client('brute');

    await expect(
      client.request({ method: 'GET', url: server.origin, timeoutMs: 150 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('cancels requests in flight when it closes', async () => {
    const server = await app(() => undefined);
    const open = openGate([server.origin]);
    const pending = open
      .client('brute')
      .request({ method: 'GET', url: server.origin, timeoutMs: 5000 });

    setTimeout(() => open.close(), 50);

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('counts what it sent, what it blocked and what it wrote', async () => {
    const server = await app((_request, response) => response.end('ok'));
    const open = openGate([server.origin]);
    const client = open.client('vandal');

    await client.request({ method: 'GET', url: server.origin });
    await client.request({ method: 'POST', url: server.origin, body: 'a=1' });
    await expect(client.request({ method: 'GET', url: 'http://10.0.0.5/' })).rejects.toMatchObject({
      kind: 'blocked',
    });

    expect(open.stats()).toEqual({ sent: 2, blocked: 1, writes: 1 });
  });

  it('logs load traffic as counts instead of one line per request', async () => {
    const server = await app((_request, response) => response.end('ok'));
    const open = openGate([server.origin]);
    const client = open.client('the-mob', { aggregateLog: true });

    for (let index = 0; index < 5; index += 1) {
      await client.request({ method: 'GET', url: server.origin });
    }
    open.close();

    const lines = logLines();
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.reduce((sum, line) => sum + (line.count ?? 1), 0)).toBe(5);
  });
});
