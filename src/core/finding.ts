export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Category = 'security' | 'resilience' | 'performance';

export type Confidence = 'high' | 'medium' | 'low';

/** Most serious first. Ranking and scoring read these. */
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low'];

/** Most certain first. */
export const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];

export type Finding = {
  /** Stable across runs, for example "loudmouth.missing-csp". */
  id: string;
  /** The hooligan that found it. */
  hooligan: string;
  /** Plain words, no jargon. */
  title: string;
  severity: Severity;
  category: Category;
  confidence: Confidence;
  /** Findings with the same root cause are merged into one. */
  rootCause: string;
  /** Routes or files it was seen on. */
  affected: string[];
  /** What Hooligans saw. Secrets are masked. */
  evidence: string;
  /** A plain-language explanation of the fix. */
  fix: string;
  /** A paste-ready prompt for an AI coding tool. Never contains a secret. */
  fixPrompt: string;
};
