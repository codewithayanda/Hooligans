import { describe, expect, it } from 'vitest';
import type { Severity } from '../../../src/core/finding.js';
import { scoreFindings } from '../../../src/scoring/score.js';
import { makeFinding } from '../../helpers/findings.js';

function many(count: number, severity: Severity) {
  return Array.from({ length: count }, (_, index) =>
    makeFinding({ id: `${severity}-${String(index).padStart(2, '0')}`, severity }),
  );
}

describe('scoreFindings', () => {
  it('starts at 100 when nothing was found', () => {
    expect(scoreFindings([]).value).toBe(100);
  });

  it('loses 25, 10, 4 and 1 points by severity', () => {
    const findings = [
      makeFinding({ id: 'a', severity: 'critical' }),
      makeFinding({ id: 'b', severity: 'high' }),
      makeFinding({ id: 'c', severity: 'medium' }),
      makeFinding({ id: 'd', severity: 'low' }),
    ];

    expect(scoreFindings(findings).value).toBe(60);
  });

  it('caps what a whole tier can cost', () => {
    expect(scoreFindings(many(30, 'low')).value).toBe(90);
    expect(scoreFindings(many(20, 'medium')).value).toBe(70);
    expect(scoreFindings(many(10, 'high')).value).toBe(50);
  });

  it('gives the points of a capped tier to the first findings in rank order', () => {
    const points = scoreFindings(many(12, 'medium')).scored.map((finding) => finding.pointsLost);

    expect(points).toEqual([4, 4, 4, 4, 4, 4, 4, 2, 0, 0, 0, 0]);
  });

  it('never goes below zero', () => {
    expect(scoreFindings(many(6, 'critical')).value).toBe(0);
  });

  it('lists low confidence findings without charging for them', () => {
    const result = scoreFindings([makeFinding({ severity: 'critical', confidence: 'low' })]);

    expect(result.value).toBe(100);
    expect(result.scored).toHaveLength(0);
    expect(result.worthALook).toHaveLength(1);
  });

  it('never rises when a finding is added', () => {
    const all = [...many(2, 'critical'), ...many(3, 'high'), ...many(5, 'medium'), ...many(8, 'low')];
    let previous = 100;

    for (let size = 1; size <= all.length; size += 1) {
      const value = scoreFindings(all.slice(0, size)).value;
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  it('gives the same result whatever order the findings arrive in', () => {
    const findings = [...many(2, 'high'), ...many(2, 'low'), ...many(2, 'critical')];
    const reversed = [...findings].reverse();

    expect(scoreFindings(reversed)).toEqual(scoreFindings(findings));
  });
});
