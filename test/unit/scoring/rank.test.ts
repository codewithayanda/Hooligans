import { describe, expect, it } from 'vitest';
import { rankFindings } from '../../../src/scoring/rank.js';
import { makeFinding } from '../../helpers/findings.js';

const ids = (findings: { id: string }[]) => findings.map((finding) => finding.id);

describe('rankFindings', () => {
  it('puts severity first', () => {
    const ranked = rankFindings([
      makeFinding({ id: 'low', severity: 'low' }),
      makeFinding({ id: 'critical', severity: 'critical' }),
      makeFinding({ id: 'medium', severity: 'medium' }),
      makeFinding({ id: 'high', severity: 'high' }),
    ]);

    expect(ids(ranked)).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('puts confidence second', () => {
    const ranked = rankFindings([
      makeFinding({ id: 'unsure', confidence: 'medium' }),
      makeFinding({ id: 'sure', confidence: 'high' }),
    ]);

    expect(ids(ranked)).toEqual(['sure', 'unsure']);
  });

  it('puts the finding seen in more places first', () => {
    const ranked = rankFindings([
      makeFinding({ id: 'one-place', affected: ['/a'] }),
      makeFinding({ id: 'three-places', affected: ['/a', '/b', '/c'] }),
    ]);

    expect(ids(ranked)).toEqual(['three-places', 'one-place']);
  });

  it('falls back to the id so the order never wobbles', () => {
    const ranked = rankFindings([makeFinding({ id: 'b' }), makeFinding({ id: 'a' })]);

    expect(ids(ranked)).toEqual(['a', 'b']);
  });

  it('does not change the list it was given', () => {
    const input = [makeFinding({ id: 'b' }), makeFinding({ id: 'a' })];
    rankFindings(input);

    expect(ids(input)).toEqual(['b', 'a']);
  });
});
