import { describe, expect, it } from 'vitest';
import { dedupeFindings } from '../../../src/scoring/dedupe.js';
import { makeFinding } from '../../helpers/findings.js';

describe('dedupeFindings', () => {
  it('merges findings that share a root cause and unites the places affected', () => {
    const merged = dedupeFindings([
      makeFinding({ id: 'csp', rootCause: 'header:csp', affected: ['/b', '/a'] }),
      makeFinding({ id: 'csp', rootCause: 'header:csp', affected: ['/c', '/a'] }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.affected).toEqual(['/a', '/b', '/c']);
  });

  it('lets the most serious copy lead', () => {
    const merged = dedupeFindings([
      makeFinding({ id: 'small', rootCause: 'same', severity: 'low' }),
      makeFinding({ id: 'big', rootCause: 'same', severity: 'high' }),
    ]);

    expect(merged[0]?.id).toBe('big');
    expect(merged[0]?.severity).toBe('high');
  });

  it('keeps findings with different root causes apart', () => {
    const merged = dedupeFindings([
      makeFinding({ id: 'a', rootCause: 'one' }),
      makeFinding({ id: 'b', rootCause: 'two' }),
    ]);

    expect(merged).toHaveLength(2);
  });

  it('gives the same answer when run twice', () => {
    const once = dedupeFindings([
      makeFinding({ id: 'a', rootCause: 'same', affected: ['/x'] }),
      makeFinding({ id: 'a', rootCause: 'same', affected: ['/y'] }),
    ]);

    expect(dedupeFindings(once)).toEqual(once);
  });
});
