import type { ScoredFinding, Verdict } from '../core/report.js';

export const VERDICT_TEXT: Readonly<Record<Verdict, string>> = {
  'nothing-serious': 'Nothing serious found',
  'almost-there': 'Almost there',
  risky: 'Risky',
  'not-ready': 'Not ready',
};

export type Coverage = { ran: number; total: number };

export function bandFor(value: number): Verdict {
  if (value >= 90) return 'nothing-serious';
  if (value >= 70) return 'almost-there';
  if (value >= 40) return 'risky';
  return 'not-ready';
}

/** One critical finding caps the verdict at "Risky", whatever the score says. */
export function verdictFor(value: number, scored: readonly ScoredFinding[]): Verdict {
  const band = bandFor(value);
  const hasCritical = scored.some((finding) => finding.severity === 'critical');

  if (hasCritical && (band === 'nothing-serious' || band === 'almost-there')) return 'risky';
  return band;
}

/** Says so when hooligans did not run, so a partial run never reads as a clean bill of health. */
export function verdictLabel(verdict: Verdict, coverage: Coverage): string {
  const text = VERDICT_TEXT[verdict];
  if (coverage.ran >= coverage.total) return text;

  const soFar = verdict === 'nothing-serious' ? ' so far' : '';
  return `${text}${soFar}, ${coverage.ran} of ${coverage.total} hooligans ran`;
}
