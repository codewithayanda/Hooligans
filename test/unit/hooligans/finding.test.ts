import { describe, expect, it } from 'vitest';
import {
  examples,
  finish,
  joinWords,
  safeToken,
  type FindingDraft,
} from '../../../src/hooligans/_shared/finding.js';
import { makeMap } from '../../helpers/maps.js';

const stripe = ['sk', 'live', 'x'.repeat(24)].join('_');
const bell = String.fromCharCode(7);

describe('safeToken', () => {
  it('keeps ordinary paths and names', () => {
    expect(safeToken('/api/products/1')).toBe('/api/products/1');
    expect(safeToken('connect.sid')).toBe('connect.sid');
  });

  it('replaces anything that could carry an instruction', () => {
    expect(safeToken('/a b`c"d\n<e>')).toBe('/a?b?c?d??e?');
  });

  it('shortens long text', () => {
    expect(safeToken('a'.repeat(200), 20)).toBe(`${'a'.repeat(17)}...`);
  });
});

describe('joinWords', () => {
  it('joins in plain English', () => {
    expect(joinWords([])).toBe('');
    expect(joinWords(['a'])).toBe('a');
    expect(joinWords(['a', 'b'])).toBe('a and b');
    expect(joinWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('examples', () => {
  it('gives nothing when there is nothing to show', () => {
    expect(examples([])).toBe('');
  });

  it('shows at most three, made safe', () => {
    expect(examples(['/'])).toBe(' (for example /)');
    expect(examples(['/a', '/b', '/c', '/d'])).toBe(' (for example /a, /b and /c)');
  });
});

describe('finish', () => {
  const draft: FindingDraft = {
    id: 'loudmouth.example',
    hooligan: 'loudmouth',
    title: 'An example finding for the test',
    severity: 'low',
    category: 'security',
    confidence: 'high',
    rootCause: 'example',
    affected: ['/'],
    evidence: `seen ${stripe}${bell} here`,
    fix: 'Fix it.',
    problem: 'It is wrong.',
    change: 'Change it.',
    keep: 'Keep working.',
  };

  it('adds a five part prompt that points back at this hooligan', () => {
    const finding = finish(draft, makeMap());

    expect(finding.fixPrompt).toContain('Problem: It is wrong.');
    expect(finding.fixPrompt).toContain(
      'npx hooligans scan --url http://localhost:3000 --only loudmouth',
    );
    expect('problem' in finding).toBe(false);
  });

  it('masks secrets and strips control characters from the evidence', () => {
    const { evidence } = finish(draft, makeMap());

    expect(evidence).not.toContain(stripe);
    expect(evidence).not.toContain(bell);
    expect(evidence).toContain('sk_live...xx');
  });
});
