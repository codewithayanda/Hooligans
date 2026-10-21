import { createInterface } from 'node:readline/promises';

/** Asks a yes or no question. Only y or yes counts as yes, and without a terminal the answer is no. */
export async function askYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await prompt.question(`${question} [y/N] `);
    return /^y(?:es)?$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}
