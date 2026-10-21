import type { Command } from 'commander';
import { notYet } from '../not-yet.js';

export function registerReport(program: Command): void {
  program
    .command('report')
    .description('Reopen the latest report.')
    .option('--open', 'open the HTML report in your browser')
    .option('--run <id>', 'a specific run instead of the latest')
    .action(() => notYet('report'));
}
