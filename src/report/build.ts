import type { Finding } from '../core/finding.js';
import { REPORT_SCHEMA_VERSION, type Report } from '../core/report.js';
import { HOOLIGANS_IN_V01 } from '../core/roster.js';
import { dedupeFindings } from '../scoring/dedupe.js';
import { scoreFindings } from '../scoring/score.js';
import { verdictFor, verdictLabel } from '../scoring/verdict.js';

export type BuildReportInput = {
  tool: Report['tool'];
  run: Report['run'];
  findings: readonly Finding[];
  /** How many hooligans ran. */
  ran: number;
  /** How many were possible. Defaults to everything in version 0.1. */
  total?: number;
  skipped: Report['skipped'];
  notLookedAt: Report['notLookedAt'];
  activity: Report['activity'];
};

/** Raw findings in, finished report out. A real scan and the sample both go through here. */
export function buildReport(input: BuildReportInput): Report {
  const total = input.total ?? HOOLIGANS_IN_V01;
  const { value, scored, worthALook } = scoreFindings(dedupeFindings(input.findings));
  const verdict = verdictFor(value, scored);

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: input.tool,
    run: input.run,
    score: {
      value,
      verdict,
      label: verdictLabel(verdict, { ran: input.ran, total }),
      ran: input.ran,
      total,
    },
    findings: scored,
    worthALook,
    skipped: input.skipped,
    notLookedAt: input.notLookedAt,
    activity: input.activity,
  };
}
