/** What one wrong attempt got back, kept small. */
export type Reply = {
  status: number;
  ms: number;
  /** The Location header of a redirect, in lower case, or an empty string. */
  location: string;
  retryAfter: boolean;
  /** The start of the body, in lower case, for words that mean "slow down". */
  text: string;
};

export type Pushback = { at: number; why: string };

const SAYS_SLOW_DOWN =
  /too many|rate.?limit|try again (?:later|in)|temporar(?:y|ily) (?:locked|blocked|disabled)|locked out|account (?:is )?locked|captcha|slow down|please wait/;
const SENDS_AWAY = /captcha|challenge/;
const CHANGES_TO = new Set([403, 503]);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** A long run of attempts that kept getting slower is a delay put in on purpose. */
function slowedDown(replies: readonly Reply[]): Pushback | null {
  if (replies.length < 8) return null;

  const early = median(replies.slice(0, 3).map((reply) => reply.ms));
  const late = median(replies.slice(-3).map((reply) => reply.ms));
  if (late < early * 3 || late - early < 400) return null;

  return {
    at: replies.length,
    why: `got slower, from about ${Math.round(early)} ms to about ${Math.round(late)} ms`,
  };
}

/**
 * Whether the app pushed back, and at which attempt: a 429, a lock, a wait, words that say so,
 * a challenge, an answer that changed or answers that got slower. Null when nothing changed.
 */
export function detectPushback(replies: readonly Reply[]): Pushback | null {
  const first = replies[0];
  if (!first) return null;

  for (const [index, reply] of replies.entries()) {
    const at = index + 1;

    if (reply.status === 429) return { at, why: 'answered 429, which means too many requests' };
    if (reply.status === 423) return { at, why: 'answered 423, which means locked' };
    if (reply.retryAfter) return { at, why: 'asked for a wait with a Retry-After header' };
    if (SAYS_SLOW_DOWN.test(reply.text))
      return { at, why: 'said in words that it limits attempts' };
    if (SENDS_AWAY.test(reply.location)) return { at, why: 'sent the caller to a challenge page' };

    if (at > 1 && reply.status !== first.status && CHANGES_TO.has(reply.status)) {
      return { at, why: `changed its answer from ${first.status} to ${reply.status}` };
    }
  }

  return slowedDown(replies);
}
