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

async function scan(options: DemoOptions): Promise<Report> {
  const demo = await startDemo(options);
  const cwd = mkdtempSync(join(tmpdir(), 'hooligans-demo-'));

  try {
    const parsed = parseScanOptions({ url: demo.origin });
    if (!parsed.ok) throw new Error(parsed.error);

    const outcome = await runScan(parsed.config, {
      registry: HOOLIGANS,
      scout: runScout,
      ask: async () => false,
      progress: silentProgress,
      cwd,
      version: '0.0.0',
    });
    if (outcome.kind !== 'done') throw new Error(outcome.message);

    return outcome.report;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    await demo.close();
  }
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
