import { describe, expect, it } from 'vitest';
import { checkNode, compareVersions, formatChecks } from '../../../src/cli/commands/doctor.js';

describe('compareVersions', () => {
  it('compares dotted numbers', () => {
    expect(compareVersions('22.13.0', '22.9.1')).toBeGreaterThan(0);
    expect(compareVersions('20.19.0', '22.13.0')).toBeLessThan(0);
    expect(compareVersions('22.13', '22.13.0')).toBe(0);
  });
});

describe('checkNode', () => {
  it('accepts a new enough Node', () => {
    expect(checkNode('24.17.0').ok).toBe(true);
  });

  it('refuses an old Node and says why', () => {
    const check = checkNode('20.19.0');

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('too old');
  });
});

describe('formatChecks', () => {
  it('marks each check ok or problem and keeps multi-line details together', () => {
    const text = formatChecks([
      { ok: true, label: 'Node', detail: '24.17.0 fine' },
      { ok: false, label: 'Browser', detail: 'line one\nline two' },
    ]);

    expect(text).toMatch(/ok\s+Node: 24\.17\.0 fine/);
    expect(text).toMatch(/problem\s+Browser: line one/);
    expect(text).toContain('line two');
  });
});
