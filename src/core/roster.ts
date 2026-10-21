import type { Stage } from './stage.js';

export type RosterEntry = {
  id: string;
  name: string;
  stage: Stage;
  summary: string;
  since: '0.1' | '0.2' | 'later';
};

/** Every hooligan, planned or built. `hooligans list`, the reports and the docs read this. */
export const ROSTER: readonly RosterEntry[] = [
  {
    id: 'pickpocket',
    name: 'Pickpocket',
    stage: 1,
    since: '0.1',
    summary: 'Looks through your public files for keys, secrets and a stray .env or .git folder.',
  },
  {
    id: 'loudmouth',
    name: 'Loudmouth',
    stage: 1,
    since: '0.1',
    summary: 'Checks what your app says too loudly: missing security headers, open CORS, weak cookies.',
  },
  {
    id: 'door-rattler',
    name: 'Door Rattler',
    stage: 2,
    since: '0.1',
    summary: 'Tries the back doors: open Supabase or Firebase data, routes that answer without a login.',
  },
  {
    id: 'fat-fingers',
    name: 'Fat Fingers',
    stage: 2,
    since: '0.1',
    summary: 'Types clumsy input: empty, huge, emoji and negative numbers.',
  },
  {
    id: 'vandal',
    name: 'Vandal',
    stage: 2,
    since: '0.1',
    summary: 'Sprays scripts and SQL into inputs to see what sticks.',
  },
  {
    id: 'snooper',
    name: 'Snooper',
    stage: 2,
    since: '0.2',
    summary: "Checks whether one user can see another user's data.",
  },
  {
    id: 'wallet-drainer',
    name: 'Wallet Drainer',
    stage: 2,
    since: 'later',
    summary: 'Finds open endpoints that could run up a paid API bill.',
  },
  {
    id: 'brute',
    name: 'Brute',
    stage: 3,
    since: '0.1',
    summary: 'Hammers login, signup and password reset to see whether anything slows it down.',
  },
  {
    id: 'double-tapper',
    name: 'Double Tapper',
    stage: 3,
    since: '0.2',
    summary: 'Fires the same action twice at once to catch double charges and duplicate rows.',
  },
  {
    id: 'slowpoke',
    name: 'Slowpoke',
    stage: 3,
    since: '0.2',
    summary: 'Acts like a user on a slow connection to see what hangs or times out.',
  },
  {
    id: 'the-mob',
    name: 'The Mob',
    stage: 4,
    since: '0.1',
    summary: 'Ramps up a crowd of users and shows what breaks first.',
  },
];

/** How many hooligans a complete run of version 0.1 has. */
export const HOOLIGANS_IN_V01 = ROSTER.filter((entry) => entry.since === '0.1').length;

export function rosterEntry(id: string): RosterEntry | undefined {
  return ROSTER.find((entry) => entry.id === id);
}
