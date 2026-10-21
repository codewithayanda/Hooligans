import type { Command } from 'commander';
import { ROSTER, type RosterEntry } from '../../core/roster.js';
import { STAGE_NUMBERS, STAGES } from '../../core/stage.js';

function when(entry: RosterEntry): string {
  if (entry.since === '0.1') return '';
  return entry.since === 'later' ? ' (later)' : ` (version ${entry.since})`;
}

export function registerList(program: Command): void {
  program
    .command('list')
    .description('Show the hooligans: their stage and what each one does.')
    .action(() => {
      for (const stage of STAGE_NUMBERS) {
        console.log(`Stage ${stage}, ${STAGES[stage].name}`);
        for (const entry of ROSTER.filter((candidate) => candidate.stage === stage)) {
          console.log(`  ${entry.name}${when(entry)}: ${entry.summary}`);
        }
        console.log('');
      }
    });
}
