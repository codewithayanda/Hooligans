import type { Finding } from '../../src/core/finding.js';

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test.finding',
    hooligan: 'loudmouth',
    title: 'A test finding',
    severity: 'medium',
    category: 'security',
    confidence: 'high',
    rootCause: 'test:root',
    affected: [],
    evidence: 'evidence',
    fix: 'fix',
    fixPrompt: 'prompt',
    ...overrides,
  };
}
