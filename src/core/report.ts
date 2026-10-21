import type { Finding } from './finding.js';

export const REPORT_SCHEMA_VERSION = 1;

export type Verdict = 'nothing-serious' | 'almost-there' | 'risky' | 'not-ready';

/** A finding with the points it cost. Low confidence findings and findings past a cap cost 0. */
export type ScoredFinding = Finding & { pointsLost: number };

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
  activity: {
    requestsSent: number;
    requestsBlocked: number;
    writes: number;
    /** What Hooligans typed into the app, so the junk can be found. Null when it wrote nothing. */
    cleanupMarker: string | null;
  };
};
