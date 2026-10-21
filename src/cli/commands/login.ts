import type { Command } from 'commander';
import { notYet } from '../not-yet.js';

export function registerLogin(program: Command): void {
  program
    .command('login')
    .description('Log in once by hand so the hooligans can reach what is behind your login (planned for 0.2).')
    .requiredOption('--as <name>', 'a name for this login, for example alice')
    .requiredOption('--url <url>', 'the app to log in to, for example http://localhost:3000')
    .action(() => notYet('login'));
}
