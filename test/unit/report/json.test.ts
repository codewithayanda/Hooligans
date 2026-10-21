import { describe, expect, it } from 'vitest';
import { parseReport, serializeReport } from '../../../src/report/json.js';
import { buildSampleReport } from '../../../src/report/sample.js';

const NOW = new Date('2026-10-21T12:00:00Z');

describe('the report file', () => {
  it('survives a round trip', () => {
    const report = buildSampleReport({ runId: 'test-run', version: '0.0.0', now: NOW });

    expect(parseReport(serializeReport(report))).toEqual(report);
  });

  it('ends with a newline', () => {
    const report = buildSampleReport({ runId: 'test-run', version: '0.0.0', now: NOW });

    expect(serializeReport(report).endsWith('\n')).toBe(true);
  });

  it('refuses a file with another schema version', () => {
    expect(() => parseReport('{"schemaVersion": 99}')).toThrow(/not a Hooligans report/);
  });

  it('refuses something that is not an object', () => {
    expect(() => parseReport('[]')).toThrow(/not a Hooligans report/);
    expect(() => parseReport('null')).toThrow(/not a Hooligans report/);
  });
});
