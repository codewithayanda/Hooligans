import { Command } from 'commander';
import { registerDoctor } from './commands/doctor.js';
import { registerList } from './commands/list.js';
import { registerLogin } from './commands/login.js';
import { registerReport } from './commands/report.js';
import { registerScan } from './commands/scan.js';

export function buildProgram(version: string): Command {
  const program = new Command()
    .name('hooligans')
    .description('A rehearsal for your app before real users show up.')
    .version(version)
    .showHelpAfterError()
    .exitOverride();

  registerScan(program);
  registerReport(program);
  registerLogin(program);
  registerDoctor(program);
  registerList(program);

  return program;
}
