import { CONFIDENCES, SEVERITIES, type Finding } from '../core/finding.js';

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Severity first, then confidence, then how many places are affected, then id. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
    CONFIDENCES.indexOf(a.confidence) - CONFIDENCES.indexOf(b.confidence) ||
    b.affected.length - a.affected.length ||
    compareText(a.id, b.id)
  );
}

export function rankFindings<T extends Finding>(findings: readonly T[]): T[] {
  return [...findings].sort(compareFindings);
}
