import { describe, expect, it } from 'vitest';
import { checkCookies, isSessionCookie } from '../../../../src/hooligans/loudmouth/cookies.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { loadMap, makeMap } from '../../../helpers/maps.js';

const ids = (findings: { id: string }[]): string[] => findings.map((finding) => finding.id);

describe('isSessionCookie', () => {
  const names: [string, boolean][] = [
    ['session', true],
    ['connect.sid', true],
    ['PHPSESSID', true],
    ['JSESSIONID', true],
    ['next-auth.session-token', true],
    ['laravel_session', true],
    ['sid', true],
    ['sb-abcd-auth-token', false],
    ['__session', false],
    ['__client_uat', false],
    ['XSRF-TOKEN', false],
    ['csrftoken', false],
    ['theme', false],
    ['NEXT_LOCALE', false],
    ['_ga', false],
    ['consid', false],
  ];

  it.each(names)('%s is a session cookie: %s', (name, expected) => {
    expect(isSessionCookie(name)).toBe(expected);
  });
});

describe('checkCookies', () => {
  const session = (flags: { httpOnly: boolean; secure: boolean }) => ({
    name: 'session',
    ...flags,
  });

  it('flags a session cookie that scripts can read', () => {
    const findings = checkCookies(loadMap('vulnerable'));

    expect(ids(findings)).toEqual(['loudmouth.cookie-readable-by-scripts']);
    expect(findings[0]?.affected).toEqual(['session (cookie)']);
    for (const finding of findings) expectWellFormed(finding);
  });

  it('is quiet about the fixed site', () => {
    expect(checkCookies(loadMap('fixed'))).toEqual([]);
  });

  it('is quiet about a Supabase cookie, which scripts are meant to read', () => {
    expect(checkCookies(loadMap('spa-with-login'))).toEqual([]);
  });

  it('checks the Secure flag only on https', () => {
    const cookies = [session({ httpOnly: true, secure: false })];

    expect(checkCookies(makeMap({ entry: 'http://localhost:3000/', cookies }))).toEqual([]);
    expect(ids(checkCookies(makeMap({ entry: 'https://localhost:3000/', cookies })))).toEqual([
      'loudmouth.cookie-not-secure',
    ]);
  });

  it('can flag both problems on one cookie', () => {
    const cookies = [session({ httpOnly: false, secure: false })];
    const findings = checkCookies(makeMap({ entry: 'https://localhost:3000/', cookies }));

    expect(ids(findings)).toEqual([
      'loudmouth.cookie-readable-by-scripts',
      'loudmouth.cookie-not-secure',
    ]);
    for (const finding of findings) expectWellFormed(finding);
  });

  it('speaks of several cookies in the plural', () => {
    const cookies = [
      { name: 'session', httpOnly: false, secure: false },
      { name: 'sid', httpOnly: false, secure: false },
    ];
    const [finding] = checkCookies(makeMap({ cookies }));

    expect(finding?.evidence).toContain('The cookies session and sid are not marked HttpOnly');
  });
});
