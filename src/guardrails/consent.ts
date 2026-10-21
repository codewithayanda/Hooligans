import { STAGE_NUMBERS, STAGES, type Stage } from '../core/stage.js';
import { normalizeHostname } from './egress/policy.js';

export type ConsentInput = {
  /** The stages asked for. Stage 1 runs whatever is asked. */
  stages: readonly Stage[];
  /** The user said with --yes that the database behind the app is a dev or test copy. */
  yes: boolean;
  allowHosts: readonly string[];
  /** Hosted backends the Scout saw, such as a Supabase project. */
  hostedBackends: readonly string[];
  /** Asks a yes or no question. Without a terminal it answers no. */
  ask: (question: string) => Promise<boolean>;
};

export type ConsentResult = {
  stagesToRun: Stage[];
  skippedStages: { stage: Stage; reason: string }[];
  confirmedHosts: string[];
  databaseConfirmed: 'flag' | 'prompt' | 'no';
};

const SKIPPED = 'You did not confirm that the database behind the app is a dev or test copy.';

function databaseQuestion(hostedBackends: readonly string[]): string {
  const lead = 'Stages 2 to 4 write junk data through your app and fire login attempts.';
  const hosted =
    hostedBackends.length > 0
      ? ` Your app talks to ${hostedBackends.join(', ')}, and Hooligans cannot tell whether that is production.`
      : '';

  return `${lead}${hosted} Is the database behind this app a dev or test copy?`;
}

function hostQuestion(host: string): string {
  return `Door Rattler wants to read ${host} with your app's public key. Is that your project?`;
}

/** The user's say-so for the risky parts. Stage 1 never needs it, and the default answer is no. */
export async function gatherConsent(input: ConsentInput): Promise<ConsentResult> {
  const requested = STAGE_NUMBERS.filter((stage) => stage === 1 || input.stages.includes(stage));
  const writing = requested.filter((stage) => STAGES[stage].writesData);

  let databaseConfirmed: ConsentResult['databaseConfirmed'] = 'no';
  if (writing.length > 0) {
    if (input.yes) {
      databaseConfirmed = 'flag';
    } else if (await input.ask(databaseQuestion(input.hostedBackends))) {
      databaseConfirmed = 'prompt';
    }
  }

  const stagesToRun = requested.filter(
    (stage) => !STAGES[stage].writesData || databaseConfirmed !== 'no',
  );
  const skippedStages =
    databaseConfirmed === 'no' ? writing.map((stage) => ({ stage, reason: SKIPPED })) : [];

  const confirmedHosts = input.allowHosts.map(normalizeHostname);
  if (stagesToRun.includes(2)) {
    for (const backend of input.hostedBackends.map(normalizeHostname)) {
      if (confirmedHosts.includes(backend)) continue;
      if (await input.ask(hostQuestion(backend))) confirmedHosts.push(backend);
    }
  }

  return { stagesToRun, skippedStages, confirmedHosts, databaseConfirmed };
}
