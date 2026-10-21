import type { Severity } from '../core/finding.js';
import type { Report } from '../core/report.js';
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

/** Report times are UTC, so the label is too. */
export function dateLabel(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}
