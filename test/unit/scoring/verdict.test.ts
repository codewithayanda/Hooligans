import { describe, expect, it } from 'vitest';
import { bandFor, verdictFor, verdictLabel } from '../../../src/scoring/verdict.js';
import { makeFinding } from '../../helpers/findings.js';

describe('bandFor', () => {
  it('draws the lines at 90, 70 and 40', () => {
    expect(bandFor(100)).toBe('nothing-serious');
    expect(bandFor(90)).toBe('nothing-serious');
    expect(bandFor(89)).toBe('almost-there');
    expect(bandFor(70)).toBe('almost-there');
    expect(bandFor(69)).toBe('risky');
    expect(bandFor(40)).toBe('risky');
    expect(bandFor(39)).toBe('not-ready');
    expect(bandFor(0)).toBe('not-ready');
  });
});

describe('verdictFor', () => {
  it('caps the verdict at risky when there is a critical finding', () => {
    const critical = { ...makeFinding({ severity: 'critical' }), pointsLost: 25 };

    expect(verdictFor(95, [critical])).toBe('risky');
    expect(verdictFor(75, [critical])).toBe('risky');
  });

  it('does not lift a low score because of the cap', () => {
    const critical = { ...makeFinding({ severity: 'critical' }), pointsLost: 25 };

    expect(verdictFor(20, [critical])).toBe('not-ready');
  });

  it('leaves the band alone when nothing is critical', () => {
    expect(verdictFor(95, [])).toBe('nothing-serious');
  });
});

describe('verdictLabel', () => {
  it('is plain when every hooligan ran', () => {
    expect(verdictLabel('nothing-serious', { ran: 7, total: 7 })).toBe('Nothing serious found');
  });

  it('says "so far" and how many ran when the top verdict comes from a partial run', () => {
    expect(verdictLabel('nothing-serious', { ran: 3, total: 7 })).toBe(
      'Nothing serious found so far, 3 of 7 hooligans ran',
    );
  });

  it('still says how many ran for the other verdicts', () => {
    expect(verdictLabel('risky', { ran: 3, total: 7 })).toBe('Risky, 3 of 7 hooligans ran');
  });
});
