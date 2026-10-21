import { describe, expect, it } from 'vitest';
import {
  classifyAddress,
  decideAddress,
  decideBrowserRequest,
  decideRequest,
  normalizeHostname,
  type AddressClass,
} from '../../../src/guardrails/egress/policy.js';

const scope = {
  origins: ['http://localhost:3000'],
  confirmedHosts: ['xyz.supabase.co'],
};

const addresses: [string, AddressClass][] = [
  ['127.0.0.1', 'loopback'],
  ['127.255.255.254', 'loopback'],
  ['::1', 'loopback'],
  ['::ffff:127.0.0.1', 'loopback'],
  ['::ffff:7f00:1', 'loopback'],
  ['10.1.2.3', 'internal'],
  ['172.16.0.1', 'internal'],
  ['172.31.255.255', 'internal'],
  ['172.32.0.1', 'public'],
  ['192.168.0.1', 'internal'],
  ['169.254.169.254', 'internal'],
  ['100.64.0.1', 'internal'],
  ['0.0.0.0', 'internal'],
  ['224.0.0.1', 'internal'],
  ['255.255.255.255', 'internal'],
  ['8.8.8.8', 'public'],
  ['1.1.1.1', 'public'],
  ['fe80::1', 'internal'],
  ['fe80::1%eth0', 'internal'],
  ['fd12:3456::1', 'internal'],
  ['ff02::1', 'internal'],
  ['::', 'internal'],
  ['::ffff:10.0.0.1', 'internal'],
  ['2606:4700:4700::1111', 'public'],
  ['not an ip', 'invalid'],
  ['', 'invalid'],
];

describe('classifyAddress', () => {
  it.each(addresses)('puts %s in the class %s', (address, expected) => {
    expect(classifyAddress(address)).toBe(expected);
  });
});

describe('normalizeHostname', () => {
  it('lowers the case, drops the brackets and drops one trailing dot', () => {
    expect(normalizeHostname('LOCALHOST.')).toBe('localhost');
    expect(normalizeHostname('[::1]')).toBe('::1');
    expect(normalizeHostname('Example.COM')).toBe('example.com');
  });
});

describe('decideRequest', () => {
  it('allows any method to the app itself', () => {
    expect(decideRequest(new URL('http://localhost:3000/a'), 'GET', scope).allowed).toBe(true);
    expect(decideRequest(new URL('http://localhost:3000/a'), 'POST', scope).allowed).toBe(true);
  });

  it('refuses another port on the same machine', () => {
    const decision = decideRequest(new URL('http://localhost:3001/'), 'GET', scope);

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('outside');
  });

  it('lets a confirmed host be read but never written to', () => {
    const url = new URL('https://xyz.supabase.co/rest/v1/orders');

    expect(decideRequest(url, 'GET', scope).allowed).toBe(true);
    expect(decideRequest(url, 'HEAD', scope).allowed).toBe(true);

    const post = decideRequest(url, 'POST', scope);
    expect(post.allowed).toBe(false);
    if (!post.allowed) expect(post.reason).toContain('reading only');
  });

  it('refuses a username or password, another scheme and an odd method', () => {
    expect(decideRequest(new URL('http://user:pw@localhost:3000/'), 'GET', scope).allowed).toBe(false);
    expect(decideRequest(new URL('ftp://localhost:3000/'), 'GET', scope).allowed).toBe(false);
    expect(decideRequest(new URL('http://localhost:3000/'), 'TRACE', scope).allowed).toBe(false);
  });
});

describe('decideAddress', () => {
  it('lets the app host resolve to this machine only', () => {
    expect(decideAddress('localhost', '127.0.0.1', scope).allowed).toBe(true);
    expect(decideAddress('localhost', '::1', scope).allowed).toBe(true);

    const decision = decideAddress('localhost', '10.0.0.5', scope);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('not at this machine');
  });

  it('lets a confirmed host resolve to the public internet only', () => {
    expect(decideAddress('xyz.supabase.co', '8.8.8.8', scope).allowed).toBe(true);

    const decision = decideAddress('xyz.supabase.co', '127.0.0.1', scope);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('not at the public internet');
  });

  it('refuses a host that is not in the scope at all', () => {
    expect(decideAddress('evil.example', '8.8.8.8', scope).allowed).toBe(false);
  });
});

describe('decideBrowserRequest', () => {
  const allowed = [
    'http://localhost:3000/app.js',
    'http://localhost:4000/api',
    'http://127.0.0.1:5173/',
    'http://foo.localhost:3000/',
    'https://cdn.jsdelivr.net/npm/x.js',
    'https://8.8.8.8/',
  ];

  const refused = [
    'http://10.0.0.5/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.1/',
    'http://[fd00::1]/',
    'http://printer/',
    'http://intranet.corp/',
    'http://files.internal/',
    'ftp://example.com/',
    'file:///etc/passwd',
  ];

  it.each(allowed)('allows %s', (url) => {
    expect(decideBrowserRequest(new URL(url), scope).allowed).toBe(true);
  });

  it.each(refused)('refuses %s', (url) => {
    expect(decideBrowserRequest(new URL(url), scope).allowed).toBe(false);
  });
});
