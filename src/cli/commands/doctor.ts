import type { Command } from 'commander';
import { notYet } from '../not-yet.js';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check Node, the browser and the workspace before a first scan.')
    .action(() => notYet('doctor'));
}
