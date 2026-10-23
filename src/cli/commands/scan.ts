import type { Command } from 'commander';
import { parseScanOptions, type RawScanOptions, type ScanConfig } from '../../core/config.js';
import { runScan, type ScanOutcome } from '../../core/orchestrator.js';
import { HOOLIGANS } from '../../hooligans/registry.js';
import { serializeReport } from '../../report/json.js';
import { captureSubmission } from '../../scout/capture.js';
import { runScout } from '../../scout/scout.js';
import { openFile } from '../../util/open-file.js';
import { askForAddress } from '../ui/address.js';
import { createProgress } from '../ui/progress.js';
import { askLine, askYesNo } from '../ui/prompts.js';
import { formatSummary } from '../ui/summary.js';

type ScanFlags = Omit<RawScanOptions, 'url'> & { url?: string };

/** Asks for the app's address when --url was left out. Null means no address could be had. */
async function addressFromUser(): Promise<string | null> {
  const answer = await askForAddress(askLine, (text) => console.error(text));
  if (answer.ok) return answer.url;

  console.error(answer.message);
  process.exitCode = 2;
  return null;
}

/** Ctrl+C stops after the step in progress and still writes the report. A second press stops now. */
async function scanUntilInterrupted(config: ScanConfig, version: string): Promise<ScanOutcome> {
  const controller = new AbortController();
  const onInterrupt = (): void => {
    if (controller.signal.aborted) process.exit(130);

    console.error('Stopping after the step in progress. Press Ctrl+C again to stop now.');
    controller.abort();
  };

  process.on('SIGINT', onInterrupt);
  try {
    return await runScan(config, {
      registry: HOOLIGANS,
      scout: runScout,
      capture: captureSubmission,
      ask: askYesNo,
      progress: createProgress(),
      cwd: process.cwd(),
      version,
      signal: controller.signal,
    });
  } finally {
    process.off('SIGINT', onInterrupt);
  }
}

function present(outcome: ScanOutcome, config: ScanConfig): void {
  process.exitCode = outcome.exitCode;

  if (outcome.kind === 'stopped') {
    console.error(outcome.message);
    return;
  }

  if (config.json) {
    process.stdout.write(serializeReport(outcome.report));
    console.error(`Report: ${outcome.htmlPath}`);
  } else {
    console.log(formatSummary(outcome.report, outcome.htmlPath));
  }

  if (config.open) openFile(outcome.htmlPath);
}

export function registerScan(program: Command): void {
  program
    .command('scan')
    .description('Send the hooligans into an app running on your own machine.')
    .option(
      '--url <url>',
      'the app to test, for example http://localhost:3000 (asked for when left out)',
    )
    .option(
      '--only <hooligans>',
      'run only these hooligans, comma separated (re-check after a fix)',
    )
    .option('--stages <list>', 'stages to run, comma separated; stage 1 always runs', '1,2,3,4')
    .option('--yes', 'confirm the database behind the app is a dev or test copy')
    .option(
      '--allow-host <host...>',
      'confirm a third-party host, for example your Supabase project',
    )
    .option('--include-risky', 'include routes that were skipped as risky')
    .option('--load <users>', 'peak users for The Mob (default 25, ceiling 200)')
    .option('--duration <seconds>', 'length of the load run (default 30)')
    .option('--json', 'print the report as JSON on stdout and progress on stderr')
    .option(
      '--fail-on <severity>',
      'exit with code 1 when a finding at or above this severity exists',
    )
    .option('--open', 'open the HTML report when the scan finishes')
    .action(async (options: ScanFlags, command: Command) => {
      const url = options.url ?? (await addressFromUser());
      if (url === null) return;

      const parsed = parseScanOptions({ ...options, url });
      if (!parsed.ok) {
        console.error(parsed.error);
        process.exitCode = 2;
        return;
      }

      const version = command.parent?.version() ?? '0.0.0';
      present(await scanUntilInterrupted(parsed.config, version), parsed.config);
    });
}
