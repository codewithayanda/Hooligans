import { describe, expect, it } from 'vitest';
import {
  CLASSIFIED_SHAPES,
  describeSourceMap,
  envNames,
  findSecrets,
  looksLikeGitConfig,
  looksLikeGitHead,
} from '../../../../src/hooligans/pickpocket/patterns.js';
import { SECRET_SHAPES } from '../../../../src/util/redact.js';

const stripeLive = ['sk', 'live', 'x'.repeat(24)].join('_');
const stripeTest = ['sk', 'test', 'x'.repeat(24)].join('_');
const aws = 'AKIA' + 'X'.repeat(16);
const github = 'ghp_' + 'a'.repeat(36);
const slack = ['xoxb', '1'.repeat(12)].join('-');
const google = 'AIza' + 'a'.repeat(35);
const aiKey = ['sk', 'a1'.repeat(20)].join('-');
const dashes = '-'.repeat(5);
const privateKey = `${dashes}BEGIN RSA PRIVATE KEY${dashes}`;
const awsExample = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
const databaseUrl = ['postgres://app', 'hunter2@localhost:5432/app'].join(':');

function jwt(claims: object): string {
  const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.${'s'.repeat(30)}`;
}

describe('findSecrets', () => {
  it('has a plain classification for every shape of secret', () => {
    const shapes = SECRET_SHAPES.map((shape) => shape.name).sort();

    expect([...CLASSIFIED_SHAPES].sort()).toEqual(shapes);
  });

  const cases: [string, string, string, string][] = [
    ['a live Stripe key', stripeLive, 'critical', 'stripe-secret-key'],
    ['a Stripe test key', stripeTest, 'medium', 'stripe-test-key'],
    ['an AWS key', aws, 'high', 'aws-access-key'],
    ['a GitHub token', github, 'high', 'github-token'],
    ['a Slack token', slack, 'high', 'slack-token'],
    ['a Google key', google, 'low', 'google-api-key'],
    ['an AI service key', aiKey, 'high', 'ai-api-key'],
    ['a private key', privateKey, 'critical', 'private-key'],
    ['a database address', databaseUrl, 'critical', 'database-url'],
    ['a service_role key', jwt({ role: 'service_role' }), 'critical', 'supabase-service-role-key'],
    ['any other signed token', jwt({ role: 'authenticated' }), 'low', 'signed-token'],
  ];

  it.each(cases)('recognises %s', (_name, secret, severity, id) => {
    const hits = findSecrets(`before ${secret} after`);

    expect(hits.map((hit) => hit.kind.id)).toEqual([id]);
    expect(hits[0]?.kind.severity).toBe(severity);
    expect(hits[0]?.value).toBe(secret);
  });

  it('leaves a Supabase anon key alone, because it is public by design', () => {
    expect(findSecrets(jwt({ role: 'anon' }))).toEqual([]);
  });

  it('leaves text that only looks like a secret alone', () => {
    expect(findSecrets(awsExample)).toEqual([]);
    expect(findSecrets('sk-circle-fade-animation-delay')).toEqual([]);
    expect(findSecrets(['postgres://user', 'password@localhost:5432/db'].join(':'))).toEqual([]);
    expect(findSecrets('Login accepts unlimited attempts.')).toEqual([]);
  });

  it('reports a secret once, however often it appears', () => {
    expect(findSecrets(`${stripeLive} and again ${stripeLive}`)).toHaveLength(1);
  });
});

describe('envNames', () => {
  it('lists the settings in a .env file', () => {
    const body = '# keys\nexport API_URL=https://x.test\nSTRIPE_SECRET_KEY=abc\n\nDEBUG = 1\n';

    expect(envNames(body)).toEqual(['API_URL', 'STRIPE_SECRET_KEY', 'DEBUG']);
  });

  it('does not take a web page, a plain answer or JSON for a .env file', () => {
    expect(envNames('<!doctype html><html></html>')).toEqual([]);
    expect(envNames('Not found')).toEqual([]);
    expect(envNames('{"error":"not found"}')).toEqual([]);
  });

  it('needs most of the file to be settings', () => {
    expect(envNames('A=1\nthis is prose\nmore prose\neven more prose\n')).toEqual([]);
  });
});

describe('the git folder', () => {
  it('recognises a git config', () => {
    expect(looksLikeGitConfig('[core]\n\trepositoryformatversion = 0\n')).toBe(true);
    expect(looksLikeGitConfig('<html>[core]</html>')).toBe(false);
    expect(looksLikeGitConfig('Not found')).toBe(false);
  });

  it('recognises a git HEAD', () => {
    expect(looksLikeGitHead('ref: refs/heads/main\n')).toBe(true);
    expect(looksLikeGitHead('a'.repeat(40))).toBe(true);
    expect(looksLikeGitHead('hello')).toBe(false);
  });
});

describe('describeSourceMap', () => {
  it('says whether the map carries the original code', () => {
    const withCode = JSON.stringify({ version: 3, sources: ['a.ts'], sourcesContent: ['let a;'] });
    const withoutCode = JSON.stringify({ version: 3, sources: ['a.ts'], mappings: '' });
    const emptyCode = JSON.stringify({ version: 3, sources: ['a.ts'], sourcesContent: [''] });

    expect(describeSourceMap(withCode)).toEqual({ hasCode: true });
    expect(describeSourceMap(withoutCode)).toEqual({ hasCode: false });
    expect(describeSourceMap(emptyCode)).toEqual({ hasCode: false });
  });

  it('does not take anything else for a source map', () => {
    expect(describeSourceMap('<!doctype html><html></html>')).toBeNull();
    expect(describeSourceMap('{"version":2,"sources":[]}')).toBeNull();
    expect(describeSourceMap('Not found')).toBeNull();
  });

  it('does not know when a big map was cut short', () => {
    const cut = '{"version":3,"sources":["a.ts"],"sourcesContent":["export const a = ';

    expect(describeSourceMap(cut)).toEqual({ hasCode: null });
  });
});
