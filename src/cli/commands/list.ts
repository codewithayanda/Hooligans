import type { Command } from 'commander';
import { notYet } from '../not-yet.js';

export function registerList(program: Command): void {
  program
    .command('list')
    .description('Show the hooligans: their stage and what each one does.')
    .action(() => notYet('list'));
}
