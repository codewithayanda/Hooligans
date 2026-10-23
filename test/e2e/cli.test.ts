import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseReport } from '../../src/report/json.js';
import { shouldSkipBrowserTests } from '../helpers/browser.js';
import { startDemo, type Demo } from '../helpers/demo.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const cli = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
const built = existsSync(cli);

if (!built) {
  console.warn('The command line tests are skipped because the project is not built yet.');
}

const skipScans = built ? await shouldSkipBrowserTests('The scan tests') : true;
const workspace = mkdtempSync(join(tmpdir(), 'hooligans-cli-'));

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

type Run = { code: number | null; stdout: string; stderr: string };

/** Runs the built command line the way a user would, and waits for it to finish. */
function runCli(args: string[]): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: workspace,
      env: { ...process.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe.skipIf(!built)('the built command line, without a browser', () => {
  it('lists the hooligans', async () => {
    const run = await runCli(['list']);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain('Pickpocket');
    expect(run.stdout).toContain('Loudmouth');
  });

  it('refuses an app that is not on this machine', async () => {
    const run = await runCli(['scan', '--url', 'http://example.com']);

    expect(run.code).toBe(2);
    expect(run.stderr).toContain('your own machine');
  });

  it('says so when nothing is running at the address', async () => {
    const run = await runCli(['scan', '--url', 'http://127.0.0.1:1']);

    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/Nothing is listening|No answer from/);
  });

  it('refuses flags it does not understand', async () => {
    const url = ['--url', 'http://localhost:3000'];

    expect((await runCli(['scan', ...url, '--stages', '9'])).code).toBe(2);
    expect((await runCli(['scan', ...url, '--fail-on', 'nope'])).code).toBe(2);
    expect((await runCli(['scan', ...url, '--only', 'gremlin'])).code).toBe(2);
  });

  it('asks for a url', async () => {
    const run = await runCli(['scan']);

    expect(run.code).toBe(2);
    expect(run.stderr).toContain('--url');
  });
});

describe.skipIf(skipScans)('hooligans scan against the demo', () => {
  let vulnerable!: Demo;
  let fixed!: Demo;

  beforeAll(async () => {
    vulnerable = await startDemo({ mode: 'vuln' });
    fixed = await startDemo({ mode: 'fixed' });
  });

  afterAll(async () => {
    await Promise.all([vulnerable?.close(), fixed?.close()]);
  });

  it('exits 1 and prints a report when the vulnerable twin has a serious finding', async () => {
    const run = await runCli(['scan', '--url', vulnerable.origin, '--json', '--fail-on', 'high']);
    const report = parseReport(run.stdout);
    const left = report.skipped.filter((item) => item.reason.includes('dev or test copy'));

    expect(run.code).toBe(1);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.score.value).toBeLessThan(40);
    expect(run.stderr).toContain('Report:');
    expect(left.map((item) => item.id).sort()).toEqual([
      'brute',
      'door-rattler',
      'fat-fingers',
      'the-mob',
      'vandal',
    ]);
    expect(report.activity.writes).toBe(0);
  });

  it('runs stage 2 with --yes, and finds what each of its hooligans is for', async () => {
    const args = ['scan', '--url', vulnerable.origin, '--yes', '--stages', '1,2', '--json'];
    const run = await runCli(args);
    const report = parseReport(run.stdout);
    const ids = report.findings.map((finding) => finding.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'door-rattler.open-table',
        'fat-fingers.stack-trace',
        'vandal.reflected-input',
        'vandal.sql-error',
      ]),
    );
    expect(report.score.ran).toBe(5);
    expect(report.activity.cleanupMarker).toMatch(/^hooligans-/);
  });

  it('runs The Mob with --yes, --load and --duration, and finds where the app gives way', async () => {
    const args = ['scan', '--url', vulnerable.origin, '--yes', '--only', 'the-mob'];
    const run = await runCli([...args, '--load', '10', '--duration', '12', '--json']);
    const report = parseReport(run.stdout);

    expect(report.findings.map((finding) => finding.id)).toEqual(['the-mob.errors-under-load']);
    expect(report.load?.stoppedBy).toBe('errors');
    expect(report.load?.breakAt).toBeLessThanOrEqual(10);
    expect(report.score.ran).toBe(1);
  });

  it('exits 0 and prints the summary for the fixed twin, without calling it safe', async () => {
    const run = await runCli(['scan', '--url', fixed.origin, '--fail-on', 'low']);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain(
      'Hooligan score 100/100: Nothing serious found so far, 2 of 7 hooligans ran',
    );
    expect(run.stdout).toContain('Not looked at');
    expect(run.stdout).toContain('Report: ');
  });
});
