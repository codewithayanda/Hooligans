import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { silentProgress } from '../../../src/cli/ui/progress.js';
import { parseScanOptions, type ScanConfig } from '../../../src/core/config.js';
import type { HooliganContext } from '../../../src/core/context.js';
import type { Hooligan, HooliganResult } from '../../../src/core/hooligan.js';
import { runScan, type ScanDeps, type ScanOutcome } from '../../../src/core/orchestrator.js';
import { identity } from '../../../src/hooligans/_shared/identity.js';
import { AppNotReachable } from '../../../src/scout/reach.js';
import { makeFinding } from '../../helpers/findings.js';
import { makeMap } from '../../helpers/maps.js';

let directory = '';

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'hooligans-scan-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function configFor(overrides: Partial<ScanConfig> = {}): ScanConfig {
  const parsed = parseScanOptions({ url: 'http://localhost:3000' });
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...parsed.config, ...overrides };
}

function fake(
  id: string,
  run: (context: HooliganContext) => Promise<HooliganResult> = async () => ({ findings: [] }),
): Hooligan {
  return { ...identity(id), sessions: 0, run };
}

function depsFor(registry: Hooligan[], overrides: Partial<ScanDeps> = {}) {
  const asked: string[] = [];
  const deps: ScanDeps = {
    registry,
    scout: async () => makeMap(),
    ask: async (question) => {
      asked.push(question);
      return false;
    },
    progress: silentProgress,
    cwd: directory,
    version: '0.0.0',
    runId: 'test-run',
    ...overrides,
  };

  return { deps, asked };
}

function finished(outcome: ScanOutcome) {
  if (outcome.kind !== 'done') throw new Error(`The scan stopped: ${outcome.message}`);
  return outcome;
}

function messageOf(outcome: ScanOutcome): string {
  return outcome.kind === 'stopped' ? outcome.message : '';
}

describe('runScan: what it refuses', () => {
  it('does not scan an address that is not on this machine', async () => {
    const outcome = await runScan(configFor({ url: 'http://example.com' }), depsFor([]).deps);

    expect(outcome).toMatchObject({ kind: 'stopped', exitCode: 2 });
    expect(messageOf(outcome)).toContain('your own machine');
  });

  it('refuses a hooligan that is not built yet', async () => {
    const { deps } = depsFor([fake('pickpocket')]);
    const outcome = await runScan(configFor({ only: ['brute'] }), deps);

    expect(outcome).toEqual({ kind: 'stopped', exitCode: 2, message: 'Brute is not built yet.' });
  });

  it('refuses a hooligan whose stage was left out', async () => {
    const { deps } = depsFor([fake('brute')]);
    const outcome = await runScan(configFor({ only: ['brute'], stages: [1] }), deps);

    expect(outcome).toMatchObject({ kind: 'stopped', exitCode: 2 });
    expect(messageOf(outcome)).toContain('stage 3');
  });

  it('says plainly when the app is not running', async () => {
    const reason = 'Nothing is listening at localhost:3000. Is the app running?';
    const { deps } = depsFor([fake('pickpocket')], {
      scout: async () => {
        throw new AppNotReachable(reason);
      },
    });

    expect(await runScan(configFor(), deps)).toEqual({
      kind: 'stopped',
      exitCode: 2,
      message: reason,
    });
  });

  it('points to doctor when the Scout fails for another reason', async () => {
    const { deps } = depsFor([fake('pickpocket')], {
      scout: async () => {
        throw new Error('No browser.');
      },
    });
    const outcome = await runScan(configFor(), deps);

    expect(outcome).toMatchObject({ kind: 'stopped', exitCode: 3 });
    expect(messageOf(outcome)).toContain('hooligans doctor');
  });
});

describe('runScan: a scan of stage 1', () => {
  it('runs the hooligans and builds the report', async () => {
    const finding = makeFinding({ hooligan: 'pickpocket', rootCause: 'a' });
    const registry = [
      fake('pickpocket', async () => ({
        findings: [finding],
        notLookedAt: ['It missed one thing.'],
      })),
      fake('loudmouth'),
    ];
    const { report, exitCode } = finished(await runScan(configFor(), depsFor(registry).deps));

    expect(exitCode).toBe(0);
    expect(report.findings.map((item) => item.id)).toEqual(['test.finding']);
    expect(report.score).toMatchObject({ ran: 2, total: 7 });
    expect(report.run).toMatchObject({
      id: 'test-run',
      target: 'http://localhost:3000',
      mode: 'prod',
      status: 'partial',
      stagesRun: [1],
    });
    expect(report.notLookedAt).toContain('It missed one thing.');
  });

  it('says which hooligans do not exist yet', async () => {
    const { report } = finished(await runScan(configFor(), depsFor([fake('pickpocket')]).deps));

    expect(report.skipped.map((item) => item.id)).toEqual([
      'loudmouth',
      'door-rattler',
      'fat-fingers',
      'vandal',
      'brute',
      'the-mob',
    ]);
    expect(report.skipped[0]?.reason).toBe('Not built yet.');
  });

  it('never calls a partial run clean', async () => {
    const registry = [fake('pickpocket')];
    const { report } = finished(
      await runScan(configFor({ only: ['pickpocket'] }), depsFor(registry).deps),
    );

    expect(report.score.label).toBe('Nothing serious found so far, 1 of 7 hooligans ran');
  });

  it('writes the report, the map and the request log', async () => {
    const result = finished(await runScan(configFor(), depsFor([fake('pickpocket')]).deps));

    expect(result.directory).toBe(join(directory, '.hooligans', 'runs', 'test-run'));
    for (const name of ['report.json', 'report.html', 'map.json', 'requests.jsonl']) {
      expect(existsSync(join(result.directory, name))).toBe(true);
    }
    expect(JSON.parse(readFileSync(result.jsonPath, 'utf8'))).toMatchObject({ schemaVersion: 1 });
  });

  it('gives each hooligan the map, the run id and the caps', async () => {
    let seen: { runId: string; entry: string; users: number } | undefined;
    const spy = fake('pickpocket', async (context) => {
      seen = { runId: context.runId, entry: context.map.entry, users: context.caps.maxUsers };
      return { findings: [] };
    });

    await runScan(configFor({ users: 40 }), depsFor([spy]).deps);

    expect(seen).toEqual({ runId: 'test-run', entry: 'http://localhost:3000/', users: 40 });
  });

  it('tells each hooligan which hosts were confirmed, and whether risky routes are in', async () => {
    let seen: Pick<HooliganContext, 'confirmedHosts' | 'includeRisky'> | undefined;
    const spy = fake('pickpocket', async (context) => {
      seen = { confirmedHosts: context.confirmedHosts, includeRisky: context.includeRisky };
      return { findings: [] };
    });
    const config = configFor({ allowHosts: ['Abcd.Supabase.co'], includeRisky: true });

    await runScan(config, depsFor([spy]).deps);

    expect(seen).toEqual({ confirmedHosts: ['abcd.supabase.co'], includeRisky: true });
  });

  it('stamps each finding with the hooligan that found it', async () => {
    const wrong = makeFinding({ hooligan: 'someone-else' });
    const registry = [fake('pickpocket', async () => ({ findings: [wrong] }))];
    const { report } = finished(await runScan(configFor(), depsFor(registry).deps));

    expect(report.findings[0]?.hooligan).toBe('pickpocket');
  });

  it('lists what the Scout did not follow under what was not looked at', async () => {
    const map = makeMap({
      coverage: { pages: 1, forms: 0, calls: 0, skipped: ['/logout (looks destructive)'] },
    });
    const { deps } = depsFor([fake('pickpocket')], { scout: async () => map });
    const { report } = finished(await runScan(configFor(), deps));

    expect(report.notLookedAt).toContain('The Scout did not follow: /logout (looks destructive).');
  });

  it('keeps going when one hooligan crashes', async () => {
    const registry = [
      fake('pickpocket'),
      fake('loudmouth', async () => {
        throw new Error('boom');
      }),
    ];
    const { report, exitCode } = finished(await runScan(configFor(), depsFor(registry).deps));

    expect(exitCode).toBe(0);
    expect(report.score.ran).toBe(1);
    expect(report.skipped).toContainEqual({ id: 'loudmouth', reason: 'Stopped by an error: boom' });
  });
});

describe('runScan: --fail-on', () => {
  const registry = [
    fake('pickpocket', async () => ({ findings: [makeFinding({ severity: 'medium' })] })),
  ];

  async function exitFor(failOn: ScanConfig['failOn']): Promise<number> {
    const outcome = await runScan(configFor({ failOn }), depsFor(registry).deps);
    return finished(outcome).exitCode;
  }

  it('exits 0 when nothing was asked for', async () => {
    expect(await exitFor(null)).toBe(0);
  });

  it('exits 0 when the findings are below the line', async () => {
    expect(await exitFor('high')).toBe(0);
  });

  it('exits 1 when a finding is at or above the line', async () => {
    expect(await exitFor('medium')).toBe(1);
    expect(await exitFor('low')).toBe(1);
  });
});

describe('runScan: consent', () => {
  function writer() {
    const state = { ran: false };
    const hooligan = fake('door-rattler', async () => {
      state.ran = true;
      return { findings: [] };
    });
    return { state, hooligan };
  }

  it('never asks about the database when only stage 1 runs', async () => {
    const { deps, asked } = depsFor([fake('pickpocket')]);
    await runScan(configFor(), deps);

    expect(asked).toEqual([]);
  });

  it('asks before a stage that writes data, and skips it without a yes', async () => {
    const { state, hooligan } = writer();
    const { deps, asked } = depsFor([fake('pickpocket'), hooligan]);
    const { report } = finished(await runScan(configFor(), deps));

    expect(asked).toHaveLength(1);
    expect(state.ran).toBe(false);
    expect(report.skipped).toContainEqual({
      id: 'door-rattler',
      reason: expect.stringContaining('dev or test copy'),
    });
  });

  it('runs that stage with --yes, and does not ask', async () => {
    const { state, hooligan } = writer();
    const { deps, asked } = depsFor([fake('pickpocket'), hooligan]);
    const { report } = finished(await runScan(configFor({ yes: true }), deps));

    expect(asked).toEqual([]);
    expect(state.ran).toBe(true);
    expect(report.run.stagesRun).toEqual([1, 2]);
    expect(report.score.ran).toBe(2);
  });
});

describe('runScan: Ctrl+C', () => {
  it('stops after the step in progress and still writes a partial report', async () => {
    const controller = new AbortController();
    const { deps } = depsFor([fake('pickpocket')], {
      signal: controller.signal,
      scout: async () => {
        controller.abort();
        return makeMap();
      },
    });
    const result = finished(await runScan(configFor(), deps));

    expect(result.exitCode).toBe(130);
    expect(result.report.run.status).toBe('partial');
    expect(result.report.skipped).toContainEqual({
      id: 'pickpocket',
      reason: 'Stopped with Ctrl+C.',
    });
  });
});
