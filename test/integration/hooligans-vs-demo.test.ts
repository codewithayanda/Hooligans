import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { silentProgress } from '../../src/cli/ui/progress.js';
import { parseScanOptions } from '../../src/core/config.js';
import { runScan } from '../../src/core/orchestrator.js';
import type { Report } from '../../src/core/report.js';
import { HOOLIGANS } from '../../src/hooligans/registry.js';
import { runScout } from '../../src/scout/scout.js';
import { shouldSkipBrowserTests } from '../helpers/browser.js';
import { startDemo, type DemoOptions } from '../helpers/demo.js';
import { expectWellFormed } from '../helpers/findings.js';

const skip = await shouldSkipBrowserTests('The hooligan tests');
const describeWithBrowser = describe.skipIf(skip);

/** Paths a careful scan must never touch: a login, a logout, a delete and pages nobody linked. */
const OFF_LIMITS = [
  '/api/login',
  '/logout',
  '/delete',
  '/admin/secret-page',
  '/hidden-in-sitemap.html',
];

type Scanned = { report: Report; offLimitsHits: number };

async function scanDemo(options: DemoOptions, yes: boolean): Promise<Scanned> {
  const demo = await startDemo(options);
  const cwd = mkdtempSync(join(tmpdir(), 'hooligans-demo-'));

  try {
    const parsed = parseScanOptions({ url: demo.origin, yes });
    if (!parsed.ok) throw new Error(parsed.error);

    const outcome = await runScan(parsed.config, {
      registry: HOOLIGANS,
      scout: runScout,
      ask: async () => false,
      progress: silentProgress,
      cwd,
      version: '0.0.0',
      requestsPerSecond: 200,
    });
    if (outcome.kind !== 'done') throw new Error(outcome.message);

    const offLimitsHits = OFF_LIMITS.reduce((total, path) => total + demo.hits(path), 0);
    return { report: outcome.report, offLimitsHits };
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

  it('leaves stage 2 alone until the database is confirmed', () => {
    const left = vulnerable.skipped
      .filter((item) => item.reason.includes('dev or test copy'))
      .map((item) => item.id)
      .sort();

    expect(left).toEqual(['door-rattler', 'fat-fingers', 'vandal']);
    expect(vulnerable.run.stagesRun).toEqual([1]);
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

describeWithBrowser('Door Rattler, Fat Fingers and Vandal against the demo', () => {
  let vulnerable!: Scanned;
  let fixed!: Scanned;

  beforeAll(async () => {
    vulnerable = await scanDemo({ mode: 'vuln' }, true);
    fixed = await scanDemo({ mode: 'fixed' }, true);
  }, 180_000);

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
  });

  it('stays quiet about the fixed twin', () => {
    expect(fixed.report.findings).toEqual([]);
    expect(fixed.report.worthALook).toEqual([]);
  });

  it('runs five of the seven hooligans, and still does not call the fixed twin safe', () => {
    expect(vulnerable.report.score.ran).toBe(5);
    expect(vulnerable.report.score.verdict).toBe('not-ready');
    expect(vulnerable.report.run.stagesRun).toEqual([1, 2]);

    expect(fixed.report.score.label).toBe('Nothing serious found so far, 5 of 7 hooligans ran');
    expect(fixed.report.run.status).toBe('partial');
  });

  it('gives every finding a plain explanation and a five part prompt', () => {
    for (const finding of vulnerable.report.findings) expectWellFormed(finding);
  });

  it('leaves junk data it can find again, and says how', () => {
    expect(vulnerable.report.activity.writes).toBeGreaterThan(0);
    expect(vulnerable.report.activity.cleanupMarker).toMatch(/^hooligans-/);
  });

  it('never goes near a login, a logout, a delete or a page nobody linked', () => {
    expect(vulnerable.offLimitsHits).toBe(0);
    expect(fixed.offLimitsHits).toBe(0);
  });
});
