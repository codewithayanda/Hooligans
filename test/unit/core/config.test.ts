import { describe, expect, it } from 'vitest';
import {
  parseScanOptions,
  type ConfigResult,
  type RawScanOptions,
  type ScanConfig,
} from '../../../src/core/config.js';

function parse(options: Partial<RawScanOptions> = {}): ConfigResult {
  return parseScanOptions({ url: 'http://localhost:3000', ...options });
}

function config(options: Partial<RawScanOptions> = {}): ScanConfig {
  const result = parse(options);
  if (!result.ok) throw new Error(result.error);
  return result.config;
}

function refusal(options: Partial<RawScanOptions>): string {
  const result = parse(options);
  if (result.ok) throw new Error('Expected the options to be refused.');
  return result.error;
}

describe('parseScanOptions', () => {
  it('fills in the defaults', () => {
    expect(parse()).toEqual({
      ok: true,
      config: {
        url: 'http://localhost:3000',
        only: [],
        stages: [1, 2, 3, 4],
        yes: false,
        allowHosts: [],
        includeRisky: false,
        users: 25,
        seconds: 30,
        json: false,
        failOn: null,
        open: false,
      },
    });
  });

  it('always includes stage 1', () => {
    expect(config({ stages: '2' }).stages).toEqual([1, 2]);
    expect(config({ stages: '4, 3' }).stages).toEqual([1, 3, 4]);
  });

  it('refuses a stage that does not exist', () => {
    expect(refusal({ stages: '1,5' })).toContain('--stages');
    expect(refusal({ stages: 'all' })).toContain('--stages');
  });

  it('reads the hooligans to run, in lower case and without repeats', () => {
    expect(config({ only: 'Loudmouth, pickpocket,loudmouth' }).only).toEqual([
      'loudmouth',
      'pickpocket',
    ]);
  });

  it('refuses a name that is not on the roster', () => {
    expect(refusal({ only: 'gremlin' })).toContain('"gremlin" is not a hooligan');
  });

  it('holds the number of users between one and the ceiling', () => {
    expect(config({ load: '500' }).users).toBe(200);
    expect(config({ load: '0' }).users).toBe(1);
    expect(config({ load: '40' }).users).toBe(40);
  });

  it('holds the duration to a sensible range', () => {
    expect(config({ duration: '1' }).seconds).toBe(5);
    expect(config({ duration: '9999' }).seconds).toBe(120);
  });

  it('refuses a load or a duration that is not a number', () => {
    expect(refusal({ load: 'many' })).toContain('--load');
    expect(refusal({ load: '' })).toContain('--load');
    expect(refusal({ duration: 'long' })).toContain('--duration');
  });

  it('reads the severity for --fail-on in any case', () => {
    expect(config({ failOn: 'HIGH' }).failOn).toBe('high');
    expect(config({ failOn: 'low' }).failOn).toBe('low');
  });

  it('refuses a severity that does not exist', () => {
    expect(refusal({ failOn: 'nope' })).toContain('critical, high, medium, low');
  });

  it('passes the switches and the confirmed hosts through', () => {
    const result = config({
      yes: true,
      json: true,
      open: true,
      includeRisky: true,
      allowHost: ['abcd.supabase.co'],
    });

    expect(result).toMatchObject({
      yes: true,
      json: true,
      open: true,
      includeRisky: true,
      allowHosts: ['abcd.supabase.co'],
    });
  });
});
