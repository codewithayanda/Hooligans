import type { Command } from 'commander';
import { notYet } from '../not-yet.js';

export function registerScan(program: Command): void {
  program
    .command('scan')
    .description('Send the hooligans into an app running on your own machine.')
    .requiredOption('--url <url>', 'the app to test, for example http://localhost:3000')
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
    .action(() => notYet('scan'));
}
