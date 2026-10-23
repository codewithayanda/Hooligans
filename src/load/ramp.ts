import type { LoadLevel } from '../core/report.js';
import { percentile } from './stats.js';

export type Route = {
  /** For people, for example "GET /api/stats". */
  label: string;
  url: string;
  /** How often a user picks this route, compared with the others. */
  weight: number;
};

export type Sample = { route: string; kind: 'ok' | 'error' | 'timeout' | 'pushback'; ms: number };

export type StopReason = 'budget' | 'interrupted';

/** Thrown by a sender when the whole run has to stop, for a reason other than the app failing. */
export class RampStop extends Error {
  readonly reason: StopReason;

  constructor(reason: StopReason) {
    super(`The crowd was stopped: ${reason}.`);
    this.name = 'RampStop';
    this.reason = reason;
  }
}

/** One request. Null means it was cut off because the run stopped, so it counts for nothing. */
export type Send = (route: Route, signal: AbortSignal) => Promise<Sample | null>;

export type RampPlan = {
  /** How many users are on the app at each step, smallest first. */
  levels: readonly number[];
  levelMs: number;
  /** How long a user waits between two requests, somewhere between these two numbers. */
  thinkMs: readonly [number, number];
};

export type LevelStats = LoadLevel & { worstRoute: string | null };

export type RampResult = {
  levels: LevelStats[];
  stoppedBy: 'finished' | 'errors' | 'rate-limit' | StopReason;
  breakAt: number | null;
};

export type RampOptions = {
  plan: RampPlan;
  routes: readonly Route[];
  send: Send;
  /** Aborted when the user stops the scan. */
  signal?: AbortSignal;
  random?: () => number;
};

/** A step is a break when at least this many requests failed, and at least this share of them. */
export const MIN_ERRORS = 3;
export const ERROR_SHARE = 0.05;
/** The app is asking the crowd to slow down once this many requests were answered with a 429. */
export const MIN_PUSHBACK = 3;

export function isBreak(level: Pick<LoadLevel, 'requests' | 'errors'>): boolean {
  return level.errors >= MIN_ERRORS && level.errors / Math.max(1, level.requests) >= ERROR_SHARE;
}

export function summarize(users: number, samples: readonly Sample[]): LevelStats {
  const failed = samples.filter((sample) => sample.kind === 'error' || sample.kind === 'timeout');
  const answered = samples
    .filter((sample) => sample.kind === 'ok' || sample.kind === 'pushback')
    .map((sample) => sample.ms)
    .sort((a, b) => a - b);

  const perRoute = new Map<string, number>();
  for (const sample of failed) perRoute.set(sample.route, (perRoute.get(sample.route) ?? 0) + 1);

  let worstRoute: string | null = null;
  let worstCount = 0;
  for (const [route, count] of perRoute) {
    if (count > worstCount) {
      worstRoute = route;
      worstCount = count;
    }
  }

  return {
    users,
    requests: samples.length,
    errors: failed.length,
    timeouts: failed.filter((sample) => sample.kind === 'timeout').length,
    pushedBack: samples.filter((sample) => sample.kind === 'pushback').length,
    p50Ms: Math.round(percentile(answered, 0.5)),
    p95Ms: Math.round(percentile(answered, 0.95)),
    worstRoute,
  };
}

function chooser(routes: readonly Route[], first: Route, random: () => number): () => Route {
  const total = routes.reduce((sum, route) => sum + Math.max(0, route.weight), 0);

  return () => {
    let point = random() * total;

    for (const route of routes) {
      point -= Math.max(0, route.weight);
      if (point < 0) return route;
    }

    return first;
  };
}

/** Waits, and gives up waiting as soon as the signal is aborted. It always lets timers run. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, Math.max(1, ms));
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Grows a crowd of users step by step. Each user keeps asking for routes, with a pause between
 * requests. The ramp stops at the first step where too many requests fail, or where the app
 * keeps answering 429, and at the end of the plan.
 */
export async function runRamp(options: RampOptions): Promise<RampResult> {
  const { plan, send } = options;
  const first = options.routes[0];
  if (!first) throw new Error('The crowd needs at least one route to visit.');

  const random = options.random ?? Math.random;
  const pick = chooser(options.routes, first, random);
  const think = (): number => plan.thinkMs[0] + random() * (plan.thinkMs[1] - plan.thinkMs[0]);

  const stop = new AbortController();
  const state: { reason: StopReason | null } = { reason: null };
  const halt = (reason: StopReason): void => {
    state.reason ??= reason;
    stop.abort();
  };

  const interrupt = (): void => halt('interrupted');
  if (options.signal?.aborted) halt('interrupted');
  options.signal?.addEventListener('abort', interrupt, { once: true });

  let bucket: Sample[] = [];
  const workers: Promise<void>[] = [];

  const worker = async (): Promise<void> => {
    while (!stop.signal.aborted) {
      const route = pick();
      let sample: Sample | null;

      try {
        sample = await send(route, stop.signal);
      } catch (error) {
        if (error instanceof RampStop) {
          halt(error.reason);
          return;
        }
        sample = { route: route.label, kind: 'error', ms: 0 };
      }

      if (sample === null || stop.signal.aborted) return;

      bucket.push(sample);
      await pause(think(), stop.signal);
    }
  };

  const levels: LevelStats[] = [];
  let stoppedBy: RampResult['stoppedBy'] = 'finished';
  let breakAt: number | null = null;

  for (const users of plan.levels) {
    while (workers.length < users) workers.push(worker());

    bucket = [];
    await pause(plan.levelMs, stop.signal);

    if (state.reason !== null) {
      if (state.reason === 'budget' && bucket.length > 0) levels.push(summarize(users, bucket));
      break;
    }

    const level = summarize(users, bucket);
    levels.push(level);

    if (isBreak(level)) {
      stoppedBy = 'errors';
      breakAt = users;
      break;
    }
    if (level.pushedBack >= MIN_PUSHBACK) {
      stoppedBy = 'rate-limit';
      break;
    }
  }

  stop.abort();
  await Promise.allSettled(workers);
  options.signal?.removeEventListener('abort', interrupt);

  return { levels, stoppedBy: state.reason ?? stoppedBy, breakAt };
}
