import { describe, expect, it } from 'vitest';
import { BrowserGuard } from '../../../src/guardrails/egress/browser.js';
import { createMemoryLog } from '../../../src/guardrails/egress/request-log.js';

const scope = { origins: ['http://localhost:3000'], confirmedHosts: [] };

function guardWith(answers: Record<string, string[]>) {
  const lookups: string[] = [];
  const log = createMemoryLog();
  const guard = new BrowserGuard({
    scope,
    log,
    resolve: async (host) => {
      lookups.push(host);
      const addresses = answers[host];
      if (!addresses) throw new Error('no such host');
      return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    },
  });

  return { guard, lookups, log };
}

describe('BrowserGuard', () => {
  it('refuses another machine without looking anything up', async () => {
    const { guard, lookups } = guardWith({});

    expect((await guard.decide(new URL('http://10.0.0.5/'))).allowed).toBe(false);
    expect(lookups).toEqual([]);
  });

  it('allows the app and other ports on this machine without a lookup', async () => {
    const { guard, lookups } = guardWith({});

    expect((await guard.decide(new URL('http://localhost:3000/a'))).allowed).toBe(true);
    expect((await guard.decide(new URL('http://localhost:4000/api'))).allowed).toBe(true);
    expect((await guard.decide(new URL('http://127.0.0.1:5173/'))).allowed).toBe(true);
    expect(lookups).toEqual([]);
  });

  it('allows a name that points at the public internet', async () => {
    const { guard, lookups } = guardWith({ 'cdn.example.com': ['93.184.216.34'] });

    expect((await guard.decide(new URL('https://cdn.example.com/lib.js'))).allowed).toBe(true);
    expect(lookups).toEqual(['cdn.example.com']);
  });

  it('refuses a name that points at another machine on the network', async () => {
    const { guard } = guardWith({ 'intranet.example.com': ['10.0.0.5'] });
    const decision = await guard.decide(new URL('https://intranet.example.com/'));

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('another machine');
  });

  it('refuses a name when even one of its answers is internal', async () => {
    const { guard } = guardWith({ 'mixed.example.com': ['93.184.216.34', '192.168.1.5'] });

    expect((await guard.decide(new URL('https://mixed.example.com/'))).allowed).toBe(false);
  });

  it('looks a name up once', async () => {
    const { guard, lookups } = guardWith({ 'cdn.example.com': ['93.184.216.34'] });

    await guard.decide(new URL('https://cdn.example.com/a.js'));
    await guard.decide(new URL('https://cdn.example.com/b.js'));

    expect(lookups).toEqual(['cdn.example.com']);
  });

  it('lets a failed lookup through, so the browser reports the failure itself', async () => {
    const { guard } = guardWith({});

    expect((await guard.decide(new URL('https://gone.example.com/'))).allowed).toBe(true);
  });

  it('logs what it blocks and what it lets through', () => {
    const { guard, log } = guardWith({});

    guard.noteBlocked('GET', 'http://10.0.0.5/', 'another machine');
    guard.noteResponse('GET', 'http://localhost:3000/', 200, 120);

    expect(log.entries).toMatchObject([
      { hooligan: 'scout', decision: 'blocked', status: null },
      { hooligan: 'scout', decision: 'allowed', status: 200, bytes: 120 },
    ]);
  });
});
