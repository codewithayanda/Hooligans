import { describe, expect, it } from 'vitest';
import { buildSampleReport } from '../../../src/report/sample.js';
import { containsSecret } from '../../../src/util/redact.js';

const NOW = new Date('2026-10-21T12:00:00Z');

function sample() {
  return buildSampleReport({ runId: 'test-run', version: '0.0.0', now: NOW });
}

describe('the sample report', () => {
  it('is marked as a sample', () => {
    expect(sample().run.sample).toBe(true);
  });

  it('is the same every time for the same moment', () => {
    expect(sample()).toEqual(sample());
  });

  it('scores 42 and reads Risky', () => {
    const { score } = sample();

    expect(score.value).toBe(42);
    expect(score.verdict).toBe('risky');
    expect(score.label).toBe('Risky');
  });

  it('merges the two content security policy findings into one', () => {
    const merged = sample().findings.filter(
      (finding) => finding.rootCause === 'loudmouth:header:content-security-policy',
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.affected).toHaveLength(10);
  });

  it('ranks the most serious findings first', () => {
    expect(sample().findings.map((finding) => finding.id)).toEqual([
      'door-rattler.open-table',
      'brute.no-rate-limit',
      'vandal.reflected-input',
      'loudmouth.missing-csp',
      'fat-fingers.stack-trace',
      'pickpocket.public-source-map',
      'loudmouth.server-banner',
    ]);
  });

  it('keeps the unsure finding out of the score', () => {
    const { worthALook } = sample();

    expect(worthALook.map((finding) => finding.id)).toEqual(['the-mob.slows-down']);
  });

  it('shows all seven hooligans of version 0.1', () => {
    const report = sample();
    const seen = new Set(
      [...report.findings, ...report.worthALook].map((finding) => finding.hooligan),
    );

    expect([...seen].sort()).toEqual([
      'brute',
      'door-rattler',
      'fat-fingers',
      'loudmouth',
      'pickpocket',
      'the-mob',
      'vandal',
    ]);
  });

  it('shows what The Mob saw at each step', () => {
    const { load } = sample();

    expect(load?.levels.map((level) => level.users)).toEqual([1, 2, 5, 10, 15, 25]);
    expect(load?.stoppedBy).toBe('finished');
  });

  it('contains nothing that looks like a secret', () => {
    const report = sample();
    const everything = JSON.stringify(report);

    expect(containsSecret(everything)).toBe(false);
  });
});
