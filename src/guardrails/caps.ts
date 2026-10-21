import type { Caps } from '../core/context.js';

/** Every default budget in one place. Flags can lower these, and raise some up to a ceiling. */
export const LIMITS = {
  scout: { maxPages: 30, maxDepth: 3, maxSeconds: 60 },
  fuzz: { requestsPerSecond: 2 },
  brute: { attemptsPerMinute: 30 },
  mob: { users: 25, seconds: 30, ceilingUsers: 200, minSeconds: 5, maxSeconds: 120 },
  scan: { maxSeconds: 600, maxRequests: 20_000 },
} as const;

export type Clock = () => number;
export type Sleep = (ms: number) => Promise<void>;

export function defaultCaps(): Caps {
  return {
    maxRequestsPerSecond: LIMITS.fuzz.requestsPerSecond,
    maxUsers: LIMITS.mob.users,
    maxAttemptsPerMinute: LIMITS.brute.attemptsPerMinute,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** What `--load` asks for, held between one user and the ceiling. */
export function resolveUsers(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return LIMITS.mob.users;
  return clamp(Math.round(requested), 1, LIMITS.mob.ceilingUsers);
}

/** What `--duration` asks for, in seconds, held to a sensible range. */
export function resolveSeconds(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return LIMITS.mob.seconds;
  return clamp(Math.round(requested), LIMITS.mob.minSeconds, LIMITS.mob.maxSeconds);
}

/** Opens after enough failures in a row, and then stays open. */
export class CircuitBreaker {
  private readonly limit: number;
  private failures = 0;
  private open = false;

  constructor(limit = 5) {
    this.limit = limit;
  }

  record(success: boolean): void {
    if (success) {
      this.failures = 0;
      return;
    }

    this.failures += 1;
    if (this.failures >= this.limit) this.open = true;
  }

  get isOpen(): boolean {
    return this.open;
  }
}

/** The time and request budget of a whole scan. */
export class ScanBudget {
  private readonly startedAt: number;
  private readonly now: Clock;
  private readonly maxMs: number;
  private readonly maxRequests: number;

  constructor(options: { maxSeconds?: number; maxRequests?: number; now?: Clock } = {}) {
    this.now = options.now ?? Date.now;
    this.startedAt = this.now();
    this.maxMs = (options.maxSeconds ?? LIMITS.scan.maxSeconds) * 1000;
    this.maxRequests = options.maxRequests ?? LIMITS.scan.maxRequests;
  }

  /** Why the scan has to stop, or null while it may go on. */
  exceeded(requestsSent: number): string | null {
    if (this.now() - this.startedAt >= this.maxMs) return 'The time budget for this scan is used up.';
    if (requestsSent >= this.maxRequests) return 'The request budget for this scan is used up.';
    return null;
  }
}

export type RateLimiter = { take(): Promise<void> };

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Spaces calls evenly, at most `perSecond` a second. Use 0.5 for 30 a minute. */
export function createRateLimiter(
  perSecond: number,
  now: Clock = Date.now,
  sleep: Sleep = realSleep,
): RateLimiter {
  if (!(perSecond > 0)) throw new Error('A rate limit needs a rate above zero.');

  const interval = 1000 / perSecond;
  let nextAt = 0;

  return {
    async take(): Promise<void> {
      const current = now();
      const startAt = Math.max(current, nextAt);
      nextAt = startAt + interval;

      const wait = startAt - current;
      if (wait > 0) await sleep(wait);
    },
  };
}
