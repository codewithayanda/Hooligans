import { expect } from 'vitest';
import type { Finding } from '../../src/core/finding.js';
import { containsSecret } from '../../src/util/redact.js';

const EM_DASH = String.fromCharCode(0x2014);

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

/** A finding that is ready to show: every field filled in, and a five part prompt with no secret. */
export function expectWellFormed(finding: Finding): void {
  expect(finding.id).toMatch(/^[a-z-]+\.[a-z0-9.-]+$/);
  expect(finding.title.length).toBeGreaterThan(10);
  expect(finding.evidence).not.toBe('');
  expect(finding.fix).not.toBe('');
  expect(finding.affected.length).toBeGreaterThan(0);

  for (const part of ['Context:', 'Problem:', 'Change:', 'Keep:', 'Check:']) {
    expect(finding.fixPrompt).toContain(part);
  }
  expect(finding.fixPrompt).toContain(`--only ${finding.hooligan}`);

  expect(containsSecret(finding.evidence)).toBe(false);
  expect(containsSecret(finding.fixPrompt)).toBe(false);

  const text = [finding.title, finding.evidence, finding.fix, finding.fixPrompt].join(' ');
  expect(text).not.toContain(EM_DASH);
}
