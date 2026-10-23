import type { Severity } from '../core/finding.js';
import type { LoadSummary, Report } from '../core/report.js';
import { rosterEntry } from '../core/roster.js';

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function hooliganName(id: string): string {
  return rosterEntry(id)?.name ?? id;
}

/** The one line of personality above the details: how many hooligans got through. */
export function headline(report: Pick<Report, 'findings'>): string {
  const through = new Set(
    report.findings.filter((finding) => finding.pointsLost > 0).map((finding) => finding.hooligan),
  ).size;

  if (through === 0) return 'No hooligan got through.';
  return through === 1 ? '1 hooligan got through.' : `${through} hooligans got through.`;
}

function whole(value: number): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

function users(count: number): string {
  const total = whole(count);
  return total === 1 ? '1 user' : `${total} users`;
}

/** What the crowd did, in a sentence or two, for the report and the terminal. */
export function describeLoad(load: LoadSummary): string {
  const peak = users(load.peakUsers);
  const last = load.levels.at(-1);

  if (load.stoppedBy === 'errors' && last) {
    const before = load.levels.at(-2);
    const where = load.weakSpot ? `, mostly on ${load.weakSpot}` : '';
    const held = before ? ` It held up to ${users(before.users)}.` : '';

    let after = '';
    if (load.recovered === true) after = ' It worked again a few seconds after the crowd left.';
    if (load.recovered === false) {
      after = ' It was still not answering normally a few seconds after the crowd left.';
    }

    return `Errors began at ${users(last.users)}: ${whole(last.errors)} of ${whole(last.requests)} requests failed${where}.${held}${after}`;
  }

  if (load.stoppedBy === 'rate-limit') {
    return `The app asked the crowd to slow down with a 429 at ${peak}, so the test stopped there. That is a rate limit doing its job.`;
  }
  if (load.stoppedBy === 'budget') {
    return `The test stopped at ${peak}, because the request budget for the scan ran out.`;
  }

  const slowest = last
    ? ` The slowest typical answer (95th percentile) at the top was ${whole(last.p95Ms)} ms.`
    : '';
  return `The crowd grew to ${peak} and the app held up.${slowest}`;
}

/** Report times are UTC, so the label is too. */
export function dateLabel(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}
