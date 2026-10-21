import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import { cookieNotSecure, cookieReadable } from './findings.js';

/** Cookies that are meant to be readable by scripts: a front end reads them on purpose. */
const READABLE_ON_PURPOSE = /csrf|xsrf|^sb-|^__client|^__session$|^ajs_|^_ga/i;

const SESSION_NAME = /sess|(?:^|[-_.])sid(?:$|[-_.])/i;

/** Only names that say session. A cookie with any other name is not a session cookie to us. */
export function isSessionCookie(name: string): boolean {
  return !READABLE_ON_PURPOSE.test(name) && SESSION_NAME.test(name);
}

/** The flags of the session cookies the Scout saw. Secure only matters when the app is on https. */
export function checkCookies(map: AppMap): Finding[] {
  const sessions = map.cookies.filter((cookie) => isSessionCookie(cookie.name));
  const findings: Finding[] = [];

  const readable = sessions.filter((cookie) => !cookie.httpOnly).map((cookie) => cookie.name);
  if (readable.length > 0) findings.push(cookieReadable(map, readable));

  if (new URL(map.entry).protocol === 'https:') {
    const plain = sessions.filter((cookie) => !cookie.secure).map((cookie) => cookie.name);
    if (plain.length > 0) findings.push(cookieNotSecure(map, plain));
  }

  return findings;
}
