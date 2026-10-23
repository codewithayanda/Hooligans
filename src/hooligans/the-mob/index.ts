import type { HooliganContext, HttpClient } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import type { Hooligan, HooliganResult } from '../../core/hooligan.js';
import type { LoadLevel, LoadSummary } from '../../core/report.js';
import { EgressError } from '../../guardrails/egress/gate.js';
import { planFor, type Timing } from '../../load/plan.js';
import { RampStop, runRamp, type Route, type Send } from '../../load/ramp.js';
import { identity } from '../_shared/identity.js';
import { errorsUnderLoad, findSlowdown, slowsDown } from './findings.js';
import { buildJourney } from './journey.js';

export type MobTiming = Timing & {
  /** How long to wait after the crowd left before asking whether the app is back. */
  recoverAfterMs: number;
  requestTimeoutMs: number;
};

const DEFAULT_TIMING: MobTiming = {
  minLevelMs: 1_000,
  thinkMs: [200, 600],
  recoverAfterMs: 3_000,
  requestTimeoutMs: 8_000,
};

const MAX_BODY_BYTES = 128 * 1024;

const ALWAYS_NOT_LOOKED_AT = [
  'The Mob only sends GET requests to the pages and calls the Scout saw. It says nothing about many people submitting forms or logging in at once.',
  'The crowd runs on the same machine as the app, so the numbers are relative: they show what gives way first, not how many real users the app can take.',
];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const users = (count: number): string => (count === 1 ? '1 user' : `${count} users`);

/** One request from one user. A failure of the app is a sample, a stop of the scan is not. */
function sender(http: HttpClient, timeoutMs: number): Send {
  return async (route, signal) => {
    const started = Date.now();
    const sample = (kind: 'ok' | 'error' | 'timeout' | 'pushback') => ({
      route: route.label,
      kind,
      ms: Date.now() - started,
    });

    try {
      const response = await http.request({
        method: 'GET',
        url: route.url,
        timeoutMs,
        maxBodyBytes: MAX_BODY_BYTES,
        signal,
      });

      if (response.status === 429) return sample('pushback');
      return sample(response.status >= 500 ? 'error' : 'ok');
    } catch (error) {
      if (signal.aborted) return null;

      if (error instanceof EgressError) {
        if (error.kind === 'aborted') throw new RampStop('interrupted');
        if (error.kind === 'budget') throw new RampStop('budget');
        if (error.kind === 'timeout') return sample('timeout');
      }
      return sample('error');
    }
  };
}

/** One visitor at a time asks for every route, so a route that fails alone is left out. */
async function warmUp(
  http: HttpClient,
  routes: readonly Route[],
  timeoutMs: number,
  notes: string[],
): Promise<Route[]> {
  const usable: Route[] = [];

  for (const route of routes) {
    try {
      const response = await http.request({
        method: 'GET',
        url: route.url,
        timeoutMs,
        maxBodyBytes: MAX_BODY_BYTES,
      });

      if (response.status >= 200 && response.status < 400) {
        usable.push(route);
      } else {
        notes.push(
          `The Mob left ${route.label} out, because it answered ${response.status} to a single visitor.`,
        );
      }
    } catch (error) {
      if (error instanceof EgressError && (error.kind === 'budget' || error.kind === 'aborted')) {
        throw error;
      }
      notes.push(`The Mob left ${route.label} out, because it did not answer a single visitor.`);
    }
  }

  return usable;
}

/** True when an ordinary request is answered without a server error. */
async function answers(http: HttpClient, route: Route, timeoutMs: number): Promise<boolean> {
  try {
    const response = await http.request({
      method: 'GET',
      url: route.url,
      timeoutMs,
      maxBodyBytes: MAX_BODY_BYTES,
    });
    return response.status < 500;
  } catch (error) {
    if (error instanceof EgressError && (error.kind === 'budget' || error.kind === 'aborted')) {
      throw error;
    }
    return false;
  }
}

function levelOf(level: LoadLevel): LoadLevel {
  return {
    users: level.users,
    requests: level.requests,
    errors: level.errors,
    timeouts: level.timeouts,
    pushedBack: level.pushedBack,
    p50Ms: level.p50Ms,
    p95Ms: level.p95Ms,
  };
}

async function run(context: HooliganContext, timing: MobTiming): Promise<HooliganResult> {
  const { map, http, caps } = context;
  const notes = [...ALWAYS_NOT_LOOKED_AT];

  const routes = buildJourney(map, context.includeRisky);
  if (routes.length === 0) {
    return { findings: [], notLookedAt: [...notes, 'The Mob found no page or call to load.'] };
  }

  const usable = await warmUp(http, routes, timing.requestTimeoutMs, notes);
  const start = usable[0];
  if (!start) {
    notes.push('The Mob could not load any route with a single visitor, so it sent no crowd.');
    return { findings: [], notLookedAt: notes };
  }

  const result = await runRamp({
    plan: planFor({ maxUsers: caps.maxUsers, seconds: caps.loadSeconds }, timing),
    routes: usable,
    send: sender(http, timing.requestTimeoutMs),
  });

  const stoppedBy = result.stoppedBy;
  if (stoppedBy === 'interrupted') throw new EgressError('aborted', 'The crowd was stopped.');

  const levels = result.levels.map(levelOf);
  const last = levels.at(-1);
  const broke = stoppedBy === 'errors';

  let recovered: boolean | null = null;
  if (broke) {
    await sleep(timing.recoverAfterMs);
    recovered = await answers(http, start, timing.requestTimeoutMs);
  }

  const load: LoadSummary = {
    peakUsers: last?.users ?? 0,
    levels,
    stoppedBy,
    breakAt: result.breakAt,
    weakSpot: broke ? (result.levels.at(-1)?.worstRoute ?? null) : null,
    recovered,
    routes: usable.map((route) => route.label),
  };

  const findings: Finding[] = [];
  if (broke && last) findings.push(errorsUnderLoad(map, load, last, levels.at(-2) ?? null));

  const slow = findSlowdown(levels);
  if (slow && (load.breakAt === null || slow.to.users < load.breakAt)) {
    findings.push(slowsDown(map, load, slow.from, slow.to));
  }

  if (stoppedBy === 'rate-limit') {
    notes.push(
      `The Mob stopped at ${users(load.peakUsers)}, because the app answered 429, which means a rate limit is working. It could not go higher.`,
    );
  }
  if (stoppedBy === 'budget') {
    notes.push(
      `The Mob stopped at ${users(load.peakUsers)}, because the request budget for the whole scan ran out.`,
    );
  }

  return { findings, notLookedAt: notes, load };
}

/** The timing can be shortened, so a test does not have to wait seconds at every step. */
export function createMob(timing: Partial<MobTiming> = {}): Hooligan {
  const merged: MobTiming = { ...DEFAULT_TIMING, ...timing };

  return {
    ...identity('the-mob'),
    sessions: 0,
    aggregateLog: true,
    run: (context) => run(context, merged),
  };
}

export const theMob = createMob();
