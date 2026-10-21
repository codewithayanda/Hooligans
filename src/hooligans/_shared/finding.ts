import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import { buildFixPrompt } from '../../prompts/build.js';
import { redactSecrets } from '../../util/redact.js';
import { cleanText } from '../../util/text.js';

export type FindingDraft = Omit<Finding, 'fixPrompt'> & {
  /** What was seen and where, for the prompt. */
  problem: string;
  /** The exact change, for the prompt. */
  change: string;
  /** What must keep working, for the prompt. */
  keep: string;
};

/** Adds the fix prompt, and makes sure no secret and no raw control character stays in the evidence. */
export function finish(draft: FindingDraft, map: AppMap): Finding {
  const { problem, change, keep, ...rest } = draft;
  const recheck = { hooligan: rest.hooligan, url: new URL(map.entry).origin };

  return {
    ...rest,
    evidence: redactSecrets(cleanText(rest.evidence, 1500)),
    fixPrompt: buildFixPrompt({ stack: map.stack, problem, change, keep, recheck }),
  };
}

/** A path or a name from the app, made safe for a prompt: no spaces, no quotes, no markup. */
export function safeToken(text: string, max = 80): string {
  const clean = text.replace(/[^\w./~:@%+=,-]/g, '?');
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

/** "a", "a and b" or "a, b and c". */
export function joinWords(items: readonly string[]): string {
  const last = items[items.length - 1];
  if (last === undefined) return '';

  return items.length === 1 ? last : `${items.slice(0, -1).join(', ')} and ${last}`;
}

/** " (for example /, /pricing and /login)" for a prompt, or nothing when there is no example. */
export function examples(items: readonly string[], count = 3): string {
  const shown = items.slice(0, count).map((item) => safeToken(item));
  return shown.length === 0 ? '' : ` (for example ${joinWords(shown)})`;
}
