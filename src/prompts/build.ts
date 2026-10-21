import type { AppMap } from '../core/app-map.js';
import type { Finding } from '../core/finding.js';
import { containsSecret } from '../util/redact.js';
import { describeStack } from './stack.js';

export type PromptParts = {
  stack: AppMap['stack'];
  /** What Hooligans saw, and where. */
  problem: string;
  /** The exact change to make. */
  change: string;
  /** What must keep working. */
  keep: string;
  /** How to check the fix. */
  recheck: { hooligan: string; url: string };
};

function assertNoSecret(prompt: string): void {
  if (containsSecret(prompt)) {
    throw new Error('A fix prompt must never contain a secret. Mask it before building the prompt.');
  }
}

/** Five parts: the stack, the problem, the change, what to keep, and how to check it. */
export function buildFixPrompt(parts: PromptParts): string {
  const command = `npx hooligans scan --url ${parts.recheck.url} --only ${parts.recheck.hooligan}`;

  const prompt = [
    `Context: ${describeStack(parts.stack)}`,
    `Problem: ${parts.problem}`,
    `Change: ${parts.change}`,
    `Keep: ${parts.keep}`,
    'Check: When you are done, run `' + command + '` and confirm this problem is gone.',
  ].join('\n\n');

  assertNoSecret(prompt);
  return prompt;
}

/** One prompt that walks through the findings in order, for the "copy top five" button. */
export function buildMasterPrompt(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'Hooligans found nothing to fix in this run.';

  const steps = findings.map(
    (finding, index) => `## ${index + 1}. ${finding.title}\n\n${finding.fixPrompt}`,
  );

  const prompt = [
    'Fix the following problems in this app, in order. Make one small commit for each, and stop if one of them needs a decision from me.',
    ...steps,
  ].join('\n\n');

  assertNoSecret(prompt);
  return prompt;
}
