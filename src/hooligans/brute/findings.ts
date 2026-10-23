import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import { finish, joinWords, safeToken } from '../_shared/finding.js';
import type { Target } from './targets.js';

const HOOLIGAN = 'brute';

export type Open = {
  target: Target;
  attempts: number;
  seconds: number;
  statuses: readonly number[];
  /** What everything Brute typed starts with. */
  marker: string;
};

function answers(statuses: readonly number[]): string {
  const [only] = statuses;

  return statuses.length === 1 && only !== undefined
    ? `Every answer was a ${only}.`
    : `The answers were ${joinWords(statuses.map(String))}.`;
}

/** A route that took every attempt without slowing down, blocking or asking for a wait. */
export function noLimit(map: AppMap, open: Open): Finding {
  const { target, attempts, marker } = open;
  const at = `POST ${safeToken(target.path, 100)}`;
  const said = answers(open.statuses);
  const seconds = open.seconds === 1 ? '1 second' : `${open.seconds} seconds`;

  if (target.kind === 'signup') {
    return finish(
      {
        id: 'brute.signup-no-limit',
        hooligan: HOOLIGAN,
        title: `${at} accepted ${attempts} signups in a row without slowing down`,
        severity: 'low',
        category: 'security',
        confidence: 'low',
        rootCause: `brute:${at}:signup-no-limit`,
        affected: [at],
        evidence: `${attempts} signups in ${seconds} on ${at}, each with a made-up address that ends in .invalid and starts with ${marker}. ${said} Nothing slowed down or asked for a wait. Each one may have left a junk account behind.`,
        fix: 'Limit signups per IP address, and add a captcha or an email check before an account counts.',
        problem: `${at} accepted ${attempts} signups in ${seconds} without slowing down.`,
        change: `Add rate limiting to ${at}: a few signups an hour per IP address, then answer with 429 and a Retry-After header. Consider a captcha, or a confirmed email before an account counts.`,
        keep: 'Normal signups must keep working.',
      },
      map,
    );
  }

  if (target.kind === 'reset') {
    return finish(
      {
        id: 'brute.reset-no-limit',
        hooligan: HOOLIGAN,
        title: `${at} accepted ${attempts} password reset requests in a row without slowing down`,
        severity: 'low',
        category: 'security',
        confidence: 'low',
        rootCause: `brute:${at}:reset-no-limit`,
        affected: [at],
        evidence: `${attempts} password reset requests in ${seconds} on ${at}, each for a made-up address that ends in .invalid. ${said} Nothing slowed down or asked for a wait. If your app sends an email for each request, someone could use it to flood an inbox.`,
        fix: 'Limit password reset requests per IP address and per email address, and send at most one email in a few minutes.',
        problem: `${at} accepted ${attempts} password reset requests in ${seconds} without slowing down.`,
        change: `Add rate limiting to ${at}: a few requests an hour per IP address and per email address, then answer with 429 and a Retry-After header. Send at most one reset email in a few minutes.`,
        keep: 'A real password reset must keep working.',
      },
      map,
    );
  }

  return finish(
    {
      id: 'brute.no-rate-limit',
      hooligan: HOOLIGAN,
      title: `${at} accepted ${attempts} wrong logins without slowing down`,
      severity: 'high',
      category: 'security',
      confidence: 'medium',
      rootCause: `brute:${at}:no-rate-limit`,
      affected: [at],
      evidence: `${attempts} wrong logins in ${seconds} on ${at}, using made-up users and random passwords. ${said} None of them slowed down or asked for a wait. No 429 and no lockout.`,
      fix: 'Limit login attempts per IP address and per account, and answer with 429 and a Retry-After header after a few wrong tries.',
      problem: `${at} accepted ${attempts} wrong logins in ${seconds} without slowing down or blocking.`,
      change: `Add rate limiting to ${at}: at most 5 failed attempts a minute per IP address and per account, then answer with 429 and a Retry-After header. Check the signup and password reset routes in the same way.`,
      keep: 'Normal logins must keep working.',
    },
    map,
  );
}
