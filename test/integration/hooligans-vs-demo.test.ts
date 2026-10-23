import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { silentProgress } from '../../src/cli/ui/progress.js';
import { parseScanOptions } from '../../src/core/config.js';
import { runScan } from '../../src/core/orchestrator.js';
import type { Report } from '../../src/core/report.js';
import { HOOLIGANS } from '../../src/hooligans/registry.js';
import { captureSubmission } from '../../src/scout/capture.js';
import { runScout } from '../../src/scout/scout.js';
import { shouldSkipBrowserTests } from '../helpers/browser.js';
import { startDemo, type DemoOptions } from '../helpers/demo.js';
import { expectWellFormed } from '../helpers/findings.js';

const skip = await shouldSkipBrowserTests('The hooligan tests');
const describeWithBrowser = describe.skipIf(skip);

/** Paths a careful scan must never touch: a logout, a delete and pages nobody linked. */
const OFF_LIMITS = ['/logout', '/delete', '/admin/secret-page', '/hidden-in-sitemap.html'];

type Scanned = {
  report: Report;
  offLimitsHits: number;
  /** The lines the crowd left in the request log, and the requests those lines stand for. */
  crowd: { lines: number; requests: number };
};

type LogLine = { hooligan: string; count?: number };

/** A full scan asks for ten users over twelve seconds, so the crowd run stays short. */
async function scanDemo(options: DemoOptions, yes: boolean): Promise<Scanned> {
  const demo = await startDemo(options);
  const cwd = mkdtempSync(join(tmpdir(), 'hooligans-demo-'));

  try {
    const parsed = parseScanOptions({
      url: demo.origin,
      yes,
      ...(yes ? { load: '10', duration: '12' } : {}),
    });
    if (!parsed.ok) throw new Error(parsed.error);

    const outcome = await runScan(parsed.config, {
      registry: HOOLIGANS,
      scout: runScout,
      capture: captureSubmission,
      ask: async () => false,
      progress: silentProgress,
      cwd,
      version: '0.0.0',
      requestsPerSecond: 200,
    });
    if (outcome.kind !== 'done') throw new Error(outcome.message);

    const lines = readFileSync(join(outcome.directory, 'requests.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as LogLine)
      .filter((line) => line.hooligan === 'the-mob');

    return {
      report: outcome.report,
      offLimitsHits: OFF_LIMITS.reduce((total, path) => total + demo.hits(path), 0),
      crowd: {
        lines: lines.length,
        requests: lines.reduce((total, line) => total + (line.count ?? 1), 0),
      },
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    await demo.close();
  }
}

async function scan(options: DemoOptions): Promise<Report> {
  return (await scanDemo(options, false)).report;
}

describeWithBrowser('Pickpocket and Loudmouth against the demo', () => {
  let vulnerable!: Report;
  let fixed!: Report;
  let dev!: Report;

  beforeAll(async () => {
    vulnerable = await scan({ mode: 'vuln' });
    fixed = await scan({ mode: 'fixed' });
    dev = await scan({ mode: 'vuln', devServer: true });
  }, 180_000);

  it('finds the problems in the vulnerable twin', () => {
    const ids = vulnerable.findings.map((finding) => finding.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'pickpocket.secret.stripe-secret-key',
        'pickpocket.exposed-env',
        'pickpocket.exposed-git',
        'pickpocket.public-source-map',
        'loudmouth.missing-csp',
        'loudmouth.missing-frame-protection',
        'loudmouth.missing-nosniff',
        'loudmouth.server-banner',
        'loudmouth.cors-reflects-origin',
        'loudmouth.cookie-readable-by-scripts',
      ]),
    );
  });

  it('is plain about how the vulnerable twin is doing', () => {
    expect(vulnerable.score.value).toBeLessThan(40);
    expect(vulnerable.score.verdict).toBe('not-ready');
    expect(vulnerable.score.label).toBe('Not ready, 2 of 7 hooligans ran');
  });

  it('finds nothing in the fixed twin', () => {
    expect(fixed.findings).toEqual([]);
    expect(fixed.worthALook).toEqual([]);
  });

  it('still does not call the fixed twin safe', () => {
    expect(fixed.score.value).toBe(100);
    expect(fixed.score.label).toBe('Nothing serious found so far, 2 of 7 hooligans ran');
    expect(fixed.run.status).toBe('partial');
    expect(fixed.notLookedAt.length).toBeGreaterThan(4);
    expect(fixed.skipped.map((item) => item.id)).toContain('door-rattler');
  });

  it('leaves stages 2 to 4 alone until the database is confirmed', () => {
    const left = vulnerable.skipped
      .filter((item) => item.reason.includes('dev or test copy'))
      .map((item) => item.id)
      .sort();

    expect(left).toEqual(['brute', 'door-rattler', 'fat-fingers', 'the-mob', 'vandal']);
    expect(vulnerable.run.stagesRun).toEqual([1]);
    expect(vulnerable.load).toBeUndefined();
  });

  it('gives every finding a plain explanation and a five part prompt', () => {
    for (const finding of vulnerable.findings) expectWellFormed(finding);
  });

  it('counts what the browser guard refused, and writes nothing through the app', () => {
    expect(vulnerable.activity.requestsBlocked).toBeGreaterThan(0);
    expect(vulnerable.activity.requestsSent).toBeGreaterThan(10);
    expect(vulnerable.activity.writes).toBe(0);
    expect(vulnerable.activity.cleanupMarker).toBeNull();
  });

  it('knows a dev server when it sees one', () => {
    expect(vulnerable.run.mode).toBe('prod');
    expect(dev.run.mode).toBe('dev');
  });
});

describeWithBrowser('Every hooligan against the demo', () => {
  let vulnerable!: Scanned;
  let fixed!: Scanned;

  beforeAll(async () => {
    vulnerable = await scanDemo({ mode: 'vuln' }, true);
    fixed = await scanDemo({ mode: 'fixed' }, true);
  }, 240_000);

  const idsOf = (report: Report, hooligan: string) =>
    report.findings
      .filter((finding) => finding.hooligan === hooligan)
      .map((finding) => finding.id)
      .sort();

  it('finds each hooligan its own problem in the vulnerable twin', () => {
    const { report } = vulnerable;

    expect(idsOf(report, 'door-rattler')).toEqual([
      'door-rattler.debug-page',
      'door-rattler.open-route',
      'door-rattler.open-table',
    ]);
    expect(idsOf(report, 'fat-fingers')).toEqual(['fat-fingers.stack-trace']);
    expect(idsOf(report, 'vandal')).toEqual(['vandal.reflected-input', 'vandal.sql-error']);
    expect(idsOf(report, 'the-mob')).toEqual(['the-mob.errors-under-load']);
  });

  it('finds the login with no limit, both as a form and as a single page login', () => {
    const { report } = vulnerable;
    const logins = report.findings.filter((finding) => finding.hooligan === 'brute');

    expect(logins.map((finding) => finding.id)).toEqual([
      'brute.no-rate-limit',
      'brute.no-rate-limit',
    ]);
    expect(logins.flatMap((finding) => finding.affected).sort()).toEqual([
      'POST /api/login',
      'POST /api/session',
    ]);
  });

  it('lists the signup and the reset as worth a look, because that is all it can say', () => {
    const ids = vulnerable.report.worthALook
      .filter((finding) => finding.hooligan === 'brute')
      .map((finding) => finding.id)
      .sort();

    expect(ids).toEqual(['brute.reset-no-limit', 'brute.signup-no-limit']);
  });

  it('stays quiet about the fixed twin, where a limit answers 429 and the crowd is served', () => {
    expect(fixed.report.findings).toEqual([]);
    expect(fixed.report.worthALook).toEqual([]);
  });

  it('shows how the crowd got on, and where it gave way', () => {
    const load = vulnerable.report.load;

    expect(load?.stoppedBy).toBe('errors');
    expect(load?.breakAt).toBeLessThanOrEqual(10);
    expect(load?.weakSpot).toMatch(/^GET \/api\/(?:products|stats|activity)$/);

    expect(fixed.report.load?.stoppedBy).toBe('finished');
    expect(fixed.report.load?.peakUsers).toBe(10);
  });

  it('runs all seven hooligans, and still does not call the fixed twin safe', () => {
    expect(vulnerable.report.score.ran).toBe(7);
    expect(vulnerable.report.score.verdict).toBe('not-ready');
    expect(vulnerable.report.run.stagesRun).toEqual([1, 2, 3, 4]);
    expect(vulnerable.report.run.status).toBe('complete');

    expect(fixed.report.score.label).toBe('Nothing serious found');
    expect(fixed.report.score.value).toBe(100);
  });

  it('gives every finding a plain explanation and a five part prompt', () => {
    for (const finding of vulnerable.report.findings) expectWellFormed(finding);
    for (const finding of vulnerable.report.worthALook) expectWellFormed(finding);
  });

  it('leaves junk data it can find again, and says how', () => {
    expect(vulnerable.report.activity.writes).toBeGreaterThan(0);
    expect(vulnerable.report.activity.cleanupMarker).toMatch(/^hooligans-/);
  });

  it('writes the crowd to the request log as counts for each second, not a line for each request', () => {
    expect(fixed.crowd.lines).toBeGreaterThan(0);
    expect(fixed.crowd.requests).toBeGreaterThan(fixed.crowd.lines);
  });

  it('never goes near a logout, a delete or a page nobody linked', () => {
    expect(vulnerable.offLimitsHits).toBe(0);
    expect(fixed.offLimitsHits).toBe(0);
  });
});
