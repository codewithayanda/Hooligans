import type { HooliganContext, Submission } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import type { Hooligan, HooliganResult } from '../../core/hooligan.js';
import { LIMITS } from '../../guardrails/caps.js';
import { looksDestructive } from '../../scout/crawl.js';
import { isRiskyRoute } from '../../scout/extract.js';
import { cleanupMarker } from '../../util/workspace.js';
import { pathOf, parse } from '../_shared/files.js';
import { joinWords } from '../_shared/finding.js';
import { identity } from '../_shared/identity.js';
import { noLimit } from './findings.js';
import { runSeries } from './series.js';
import { findTargets, MAX_TARGETS, type Kind, type Target } from './targets.js';
import { deriveBody, type Typed } from './template.js';
import { valuesFor, type Maker } from './values.js';

export type BruteOptions = {
  /** Makes the random password of each attempt. Tests replace it. */
  password?: () => string;
};

const ATTEMPTS: Readonly<Record<Kind, number>> = { login: 30, signup: 10, reset: 10 };

const HOSTED: Readonly<Record<string, string>> = { supabase: 'Supabase', firebase: 'Firebase' };

/** Opens a login page in a browser once, to see what the form sends. Null when that fails. */
async function learnLogin(
  context: HooliganContext,
  pages: readonly string[],
  make: Maker,
  notes: string[],
): Promise<Target | null> {
  const [first] = pages;
  if (!first) return null;

  const capture = context.capture;
  if (!capture) {
    notes.push(
      `Brute found a page that looks like a login (${pathOf(first)}), but this scan has no browser to try it with.`,
    );
    return null;
  }

  const person = make(0);
  const typed: Typed = { identifier: person.email, password: person.password };
  const origin = new URL(context.map.entry).origin;

  for (const page of pages) {
    let submission: Submission | null;
    try {
      submission = await capture(page, typed);
    } catch {
      submission = null;
    }
    if (!submission) continue;

    const url = parse(submission.url);
    if (!url) continue;

    if (url.origin !== origin) {
      notes.push(
        `The login on ${pathOf(page)} sends its request to ${url.origin}, not to the address Hooligans was given, so Brute left it alone.`,
      );
      return null;
    }
    if (looksDestructive(url, '') || (isRiskyRoute(url.pathname) && !context.includeRisky)) {
      notes.push(`Brute left the login on ${pathOf(page)} alone, because its route looks risky.`);
      return null;
    }

    const body = deriveBody(submission, typed);
    if (!body) {
      notes.push(
        `Brute opened the login on ${pathOf(page)}, but could not repeat the request it sent.`,
      );
      return null;
    }

    return {
      kind: 'login',
      url: `${origin}${url.pathname}${url.search}`,
      path: url.pathname,
      page,
      body,
      browserStatus: submission.status,
    };
  }

  notes.push(
    `Brute tried the page that looks like a login (${pathOf(first)}), but could not fill in and submit its form.`,
  );
  return null;
}

async function run(context: HooliganContext, options: BruteOptions): Promise<HooliganResult> {
  const { map } = context;
  const marker = cleanupMarker(context.runId);
  const make = valuesFor(context.runId, options.password);
  const found = findTargets(map, context.includeRisky);
  const notes: string[] = [];
  const findings: Finding[] = [];

  const targets = [...found.targets];
  const learned = await learnLogin(context, found.pages, make, notes);
  if (
    learned &&
    !targets.some((target) => target.kind === 'login' && target.path === learned.path)
  ) {
    targets.unshift(learned);
  }

  if (found.risky > 0) {
    const forms = found.risky === 1 ? 'a form' : `${found.risky} forms`;
    notes.push(
      `Brute left ${forms} alone, because the route looks like it has side effects (use --include-risky to include them).`,
    );
  }

  if (targets.length === 0) {
    notes.push('Brute found no login, signup or password reset form it could try.');

    const hosted = map.stack.backends.map((name) => HOSTED[name] ?? name);
    if (hosted.length > 0) {
      notes.push(
        `Your app uses ${joinWords(hosted)}, which handles its own logins. Hooligans does not hammer another site.`,
      );
    }
  }

  for (const [index, target] of targets.slice(0, MAX_TARGETS).entries()) {
    const at = `POST ${target.path}`;
    const result = await runSeries({
      http: context.http,
      target,
      count: ATTEMPTS[target.kind],
      values: (n) => make(index * 1000 + n),
    });

    if (result.kind === 'open') {
      findings.push(
        noLimit(map, {
          target,
          attempts: result.attempts,
          seconds: result.seconds,
          statuses: result.statuses,
          marker,
        }),
      );
    } else if (result.kind === 'untestable') {
      notes.push(`Brute could not test ${at}: it ${result.why}.`);
    } else if (result.kind === 'failing') {
      notes.push(`Brute stopped on ${at}, because ${result.why}.`);
    }
  }

  const base = `Brute tries made-up accounts and random passwords, at most ${LIMITS.brute.attemptsPerMinute} attempts a minute, and stops at the first sign of a limit. Everything it types contains ${marker}. It cannot see a lockout that only applies to real accounts, and it leaves alone logins that another site handles, such as Supabase Auth, Clerk or Firebase.`;

  return { findings, notLookedAt: [base, ...notes] };
}

export function createBrute(options: BruteOptions = {}): Hooligan {
  return {
    ...identity('brute'),
    sessions: 0,
    requestsPerSecond: LIMITS.brute.attemptsPerMinute / 60,
    run: (context) => run(context, options),
  };
}

export const brute = createBrute();
