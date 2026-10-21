import { describe, expect, it } from 'vitest';
import { containsSecret, maskSecret, redactSecrets } from '../../../src/util/redact.js';

const stripe = ['sk', 'live', 'x'.repeat(24)].join('_');
const aws = 'AKIA' + 'X'.repeat(16);
const github = 'ghp_' + 'a'.repeat(36);
const jwt = ['eyJ' + 'a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)].join('.');

describe('maskSecret', () => {
  it('keeps the type visible and hides the rest', () => {
    expect(maskSecret(stripe)).toBe('sk_live...xx');
  });

  it('hides short values completely', () => {
    expect(maskSecret('short')).toBe('[masked]');
  });

  it('never gives away more than a quarter of the start', () => {
    expect(maskSecret('a'.repeat(12))).toBe('aaa...');
  });
});

describe('containsSecret', () => {
  it('recognises the common shapes', () => {
    for (const secret of [stripe, aws, github, jwt]) {
      expect(containsSecret(`before ${secret} after`)).toBe(true);
    }
  });

  it('leaves ordinary text alone', () => {
    expect(containsSecret('Login accepts unlimited attempts.')).toBe(false);
  });

  it('does not flag a masked value', () => {
    expect(containsSecret(maskSecret(stripe))).toBe(false);
  });
});

describe('redactSecrets', () => {
  it('replaces every secret with its masked form', () => {
    const text = redactSecrets(`token ${stripe} and ${aws}`);

    expect(containsSecret(text)).toBe(false);
    expect(text).toContain('sk_live...xx');
  });
});
