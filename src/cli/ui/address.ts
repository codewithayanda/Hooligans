import { checkTarget } from '../../guardrails/scope.js';

/** Asks one question and gives back the answer, or null when nobody can answer. */
export type AskLine = (question: string) => Promise<string | null>;

export type AddressResult = { ok: true; url: string } | { ok: false; message: string };

const TRIES = 3;

const QUESTION =
  'Which address is your app running on? Start your app first, then type the address you open in your browser, for example http://localhost:3000 (or just the port, such as 3000).';

const AGAIN = 'Which address? For example http://localhost:3000 or just 3000.';

const NO_ANSWER =
  'No address was given. Give it with --url, for example: hooligans scan --url http://localhost:3000';

const GAVE_UP =
  'That did not work three times. Start your app, then run hooligans scan --url followed by its address.';

/** What a friend types is not always a full address: 3000, :3000 and localhost:3000 all work. */
export function normalizeAddress(input: string): string {
  const text = input.trim();
  if (text === '') return text;

  if (/^:?\d{1,5}$/.test(text)) return `http://localhost:${text.replace(':', '')}`;
  return text.includes('://') ? text : `http://${text}`;
}

/** Asks for the address of the app in plain words, and only takes one on this machine. */
export async function askForAddress(
  askLine: AskLine,
  say: (text: string) => void,
): Promise<AddressResult> {
  let question = QUESTION;

  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const answer = await askLine(question);
    if (answer === null) return { ok: false, message: NO_ANSWER };

    const url = normalizeAddress(answer);
    const decision = checkTarget(url);
    if (decision.allowed) return { ok: true, url };

    say(decision.reason);
    question = AGAIN;
  }

  return { ok: false, message: GAVE_UP };
}
