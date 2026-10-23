import type { Finding } from './finding.js';

export const REPORT_SCHEMA_VERSION = 1;

export type Verdict = 'nothing-serious' | 'almost-there' | 'risky' | 'not-ready';

/** A finding with the points it cost. Low confidence findings and findings past a cap cost 0. */
export type ScoredFinding = Finding & { pointsLost: number };

/** What The Mob saw at one number of users. Milliseconds are relative to this machine. */
export type LoadLevel = {
  users: number;
  requests: number;
  /** Server errors, timeouts and dropped connections. */
  errors: number;
  /** The part of the errors that were timeouts. */
  timeouts: number;
  /** Answers of 429, where the app asked the crowd to slow down. */
  pushedBack: number;
  p50Ms: number;
  p95Ms: number;
};

export type LoadStop = 'finished' | 'errors' | 'rate-limit' | 'budget';

export type LoadSummary = {
  /** The most users that were on the app at once. */
  peakUsers: number;
  levels: LoadLevel[];
  stoppedBy: LoadStop;
  /** The first number of users at which too many requests failed. */
  breakAt: number | null;
  /** The route that failed most at that point, for example "GET /api/stats". */
  weakSpot: string | null;
  /** Whether an ordinary request worked a few seconds after the crowd left. Null when not asked. */
  recovered: boolean | null;
  /** The routes the crowd visited. */
  routes: string[];
};

export type Report = {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  tool: { name: string; version: string };
  run: {
    id: string;
    startedAt: string;
    finishedAt: string;
    target: string;
    mode: 'dev' | 'prod' | 'unknown';
    status: 'complete' | 'partial';
    stagesRun: number[];
    /** True for the made-up report from `hooligans report --sample`. */
    sample?: boolean;
  };
  score: {
    value: number;
    verdict: Verdict;
    label: string;
    /** How many hooligans ran, out of how many were possible. */
    ran: number;
    total: number;
  };
  /** Merged by root cause and ranked, most serious first. The first five are the top five. */
  findings: ScoredFinding[];
  /** Low confidence. Listed, but they cost nothing. */
  worthALook: Finding[];
  skipped: { id: string; reason: string }[];
  /** Plain sentences about what the run did not cover. */
  notLookedAt: string[];
  /** What The Mob saw. Only there when The Mob ran. */
  load?: LoadSummary;
  activity: {
    requestsSent: number;
    requestsBlocked: number;
    writes: number;
    /** What Hooligans typed into the app, so the junk can be found. Null when it wrote nothing. */
    cleanupMarker: string | null;
  };
};
