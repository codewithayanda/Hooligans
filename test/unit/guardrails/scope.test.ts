import { describe, expect, it } from 'vitest';
import { checkTarget, scopeFor } from '../../../src/guardrails/scope.js';

const accepted: [string, string][] = [
  ['http://localhost:3000', 'http://localhost:3000'],
  ['http://localhost', 'http://localhost'],
  ['HTTP://LOCALHOST:3000/path?x=1#frag', 'http://localhost:3000'],
  ['http://localhost.:3000', 'http://localhost:3000'],
  ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
  ['http://127.0.0.2:8080', 'http://127.0.0.2:8080'],
  ['http://[::1]:3000', 'http://[::1]:3000'],
  ['http://127.1:3000', 'http://127.0.0.1:3000'],
  ['http://0x7f.0.0.1:3000', 'http://127.0.0.1:3000'],
  ['http://2130706433:3000', 'http://127.0.0.1:3000'],
  ['https://localhost:3443', 'https://localhost:3443'],
  ['  http://localhost:3000  ', 'http://localhost:3000'],
];

const refused = [
  '',
  '   ',
  'localhost',
  'localhost:3000',
  'http://',
  'http://[::1',
  'http://localhost:99999',
  'http://evil.com',
  'http://example.com',
  'http://localhost.evil.com',
  'http://127.0.0.1.evil.com',
  'http://evil.com#@localhost',
  'http://localhost@evil.com',
  'http://evil.com@localhost',
  'http://user:pass@localhost:3000',
  'http://evil.com\\@localhost',
  'http://0.0.0.0:3000',
  'http://10.0.0.5',
  'http://192.168.1.10:3000',
  'http://172.16.0.1',
  'http://172.31.255.255',
  'http://172.32.0.1',
  'http://169.254.169.254/latest/meta-data/',
  'http://100.64.0.1',
  'http://[::ffff:10.0.0.1]',
  'http://[::ffff:a00:1]',
  'http://[fe80::1]',
  'http://[fd00::1]',
  'http://[::]',
  'http://8.8.8.8',
  'ftp://localhost',
  'file:///etc/passwd',
  'javascript:alert(1)',
  'data:text/html,hi',
  'mailto://localhost',
  `http://localhost:3000/${'a'.repeat(3000)}`,
];

describe('checkTarget', () => {
  it.each(accepted)('accepts %s', (input, origin) => {
    const decision = checkTarget(input);

    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.origin).toBe(origin);
  });

  it.each(refused.map((input): [string, string] => [input.slice(0, 60), input]))(
    'refuses %s',
    (_label, input) => {
      expect(checkTarget(input).allowed).toBe(false);
    },
  );

  it('explains that version 0.1 only tests your own machine', () => {
    const decision = checkTarget('http://example.com');

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('own machine');
  });

  it('asks for the scheme when it is missing', () => {
    const decision = checkTarget('localhost:3000');

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('scheme');
  });

  it('asks for the username and password to be removed', () => {
    const decision = checkTarget('http://user:pass@localhost:3000');

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('username');
  });
});

describe('scopeFor', () => {
  it('holds the app origin and the confirmed hosts in one spelling', () => {
    expect(scopeFor('http://localhost:3000', ['XYZ.supabase.co.'])).toEqual({
      origins: ['http://localhost:3000'],
      confirmedHosts: ['xyz.supabase.co'],
    });
  });
});
