import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import type { LoadLevel, LoadSummary } from '../../core/report.js';
import { finish, joinWords, safeToken } from '../_shared/finding.js';

const HOOLIGAN = 'the-mob';

/** Errors at this many users or fewer cost points, on a production build. */
export const COUNTED_USERS = 10;

const SLOW_MS = 1_500;
const SLOW_FACTOR = 5;

function people(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

function users(count: number): string {
  return count === 1 ? '1 user' : `${count} users`;
}

/** Whether errors under load cost points. Only clear failures do, and never on a dev server. */
export function countsAgainstScore(map: AppMap, users: number): boolean {
  return map.mode === 'prod' && users <= COUNTED_USERS;
}

function caveat(map: AppMap, users: number): string {
  if (map.mode === 'dev') {
    return ' This was a dev server, so the numbers are relative and cost no points.';
  }
  if (map.mode === 'unknown') {
    return ' Hooligans could not tell whether this is a production build, so this costs no points.';
  }
  if (users > COUNTED_USERS) {
    return ` It happened above ${COUNTED_USERS} users, so it is shown for information and costs no points.`;
  }
  return '';
}

function recovery(recovered: boolean | null): string {
  if (recovered === true) return ' It answered normally again a few seconds after the crowd left.';
  if (recovered === false) {
    return ' It was still not answering normally a few seconds after the crowd left.';
  }
  return '';
}

/** The step where the first requests failed. It says what failed and how far the app got. */
export function errorsUnderLoad(
  map: AppMap,
  load: LoadSummary,
  level: LoadLevel,
  before: LoadLevel | null,
): Finding {
  const counted = countsAgainstScore(map, level.users);
  const where = load.weakSpot ? `GET ${safeToken(load.weakSpot.replace(/^GET /, ''), 100)}` : null;
  const crowd = people(level.users);
  const failed = level.errors - level.timeouts;

  const kinds = joinWords([
    ...(failed > 0 ? [`${failed} with a server error or a dropped connection`] : []),
    ...(level.timeouts > 0 ? [`${level.timeouts} timed out`] : []),
  ]);
  const held = before ? `It held up to ${people(before.users)}.` : 'It failed from the first step.';

  return finish(
    {
      id: 'the-mob.errors-under-load',
      hooligan: HOOLIGAN,
      title: where
        ? `${where} returned errors when ${crowd} used the app at once`
        : `Your app returned errors when ${crowd} used it at once`,
      severity: counted && level.users <= 5 ? 'high' : 'medium',
      category: 'resilience',
      confidence: counted ? 'high' : 'low',
      rootCause: `the-mob:${where ?? 'app'}:errors`,
      affected: [where ?? `GET ${new URL(map.entry).pathname}`],
      evidence: `${level.errors} of ${level.requests} requests failed at ${users(level.users)} (${kinds}). ${held}${recovery(load.recovered)}${caveat(map, level.users)}`,
      fix: 'Find out why the app fails with so few people on it. Read the server log from that moment: a database connection pool that is too small, a slow query or an error that is not caught are the usual causes. Answer with a clear error status instead of crashing.',
      problem: `${where ?? 'The app'} returned errors when ${crowd} used it at once: ${level.errors} of ${level.requests} requests failed.`,
      change: `Find out why ${where ?? 'the app'} fails when ${crowd} use it at once. Read the server log from that moment. Check the size of the database connection pool, slow queries without an index and errors that are not caught. Fix the cause, and make the route answer with a clear error status instead of crashing.`,
      keep: 'The route must return the same data for a single user.',
    },
    map,
  );
}

/** Where the answers got much slower: the step before it and the step where it showed. */
export function findSlowdown(
  levels: readonly LoadLevel[],
): { from: LoadLevel; to: LoadLevel } | null {
  const base = levels[0];
  if (!base) return null;

  const limit = Math.max(SLOW_MS, base.p95Ms * SLOW_FACTOR);

  for (let index = 1; index < levels.length; index += 1) {
    const level = levels[index];
    const before = levels[index - 1];
    if (level && before && level.p95Ms >= limit) return { from: before, to: level };
  }

  return null;
}

/** Always low confidence: speed on one machine is relative, so it is listed and costs nothing. */
export function slowsDown(map: AppMap, load: LoadSummary, from: LoadLevel, to: LoadLevel): Finding {
  const machine =
    map.mode === 'dev'
      ? 'This was a dev server, so treat the numbers as relative.'
      : 'The crowd and the app share one machine, so treat the numbers as relative.';

  return finish(
    {
      id: 'the-mob.slows-down',
      hooligan: HOOLIGAN,
      title: `Your app slows down after about ${users(from.users)}`,
      severity: 'medium',
      category: 'performance',
      confidence: 'low',
      rootCause: 'the-mob:app:slow',
      affected: load.routes.length > 0 ? load.routes : ['the pages and calls The Mob visited'],
      evidence: `The 95th percentile went from ${from.p95Ms} ms at ${users(from.users)} to ${to.p95Ms} ms at ${users(to.users)}. ${machine}`,
      fix: 'Find the slowest route when many people use the app at once and look at what it does. An index, a smaller response or caching usually helps.',
      problem: `The app gets much slower once about ${users(to.users)} are on it at the same time.`,
      change:
        'Find the slowest route when many people use the app at once. Look at its database queries, add an index for the columns it filters on, return only the fields the page needs and cache what does not change.',
      keep: 'The pages must show the same data.',
    },
    map,
  );
}
