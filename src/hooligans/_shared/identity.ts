import type { Hooligan } from '../../core/hooligan.js';
import { rosterEntry } from '../../core/roster.js';

export type Identity = Pick<Hooligan, 'id' | 'name' | 'stage' | 'summary'>;

/** Name, stage and summary come from the roster, so the list and the code cannot drift apart. */
export function identity(id: string): Identity {
  const entry = rosterEntry(id);
  if (!entry) throw new Error(`"${id}" is not on the roster.`);

  return { id: entry.id, name: entry.name, stage: entry.stage, summary: entry.summary };
}
