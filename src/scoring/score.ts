import type { Finding, Severity } from '../core/finding.js';
import type { ScoredFinding } from '../core/report.js';
import { rankFindings } from './rank.js';

export const WEIGHTS: Readonly<Record<Severity, number>> = {
  critical: 25,
  high: 10,
  medium: 4,
  low: 1,
};

/** The most a whole tier can cost, so a pile of small problems never outweighs one big one. */
export const TIER_CAPS: Readonly<Record<Severity, number>> = {
  critical: Number.POSITIVE_INFINITY,
  high: 50,
  medium: 30,
  low: 10,
};

export type ScoreResult = {
  value: number;
  /** Counted findings, ranked, each with the points it cost. */
  scored: ScoredFinding[];
  /** Low confidence findings. They are listed and cost nothing. */
  worthALook: Finding[];
};

/** Expects findings that are already merged by root cause. */
export function scoreFindings(findings: readonly Finding[]): ScoreResult {
  const counted = rankFindings(findings.filter((finding) => finding.confidence !== 'low'));
  const worthALook = rankFindings(findings.filter((finding) => finding.confidence === 'low'));

  const spent: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  const scored = counted.map((finding): ScoredFinding => {
    const room = TIER_CAPS[finding.severity] - spent[finding.severity];
    const pointsLost = Math.max(0, Math.min(WEIGHTS[finding.severity], room));
    spent[finding.severity] += pointsLost;
    return { ...finding, pointsLost };
  });

  const total = scored.reduce((sum, finding) => sum + finding.pointsLost, 0);
  return { value: Math.max(0, 100 - total), scored, worthALook };
}
