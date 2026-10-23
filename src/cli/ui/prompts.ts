import { createInterface } from 'node:readline/promises';

export type Streams = { input: NodeJS.ReadableStream; output: NodeJS.WritableStream };

/** One line from the user, or null when the terminal closed first, for example on Ctrl+C. */
export async function readAnswer(
  question: string,
  streams: Streams = { input: process.stdin, output: process.stderr },
): Promise<string | null> {
  const prompt = createInterface(streams);
  const closed = new Promise<null>((resolve) => {
    prompt.once('close', () => resolve(null));
  });
  const answered = prompt.question(question).catch(() => null);

  try {
    return await Promise.race([answered, closed]);
  } finally {
    prompt.close();
  }
}

/** Asks a yes or no question. Only y or yes counts as yes, and without a terminal the answer is no. */
export async function askYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  const answer = await readAnswer(`${question} [y/N] `);
  return answer !== null && /^y(?:es)?$/i.test(answer.trim());
}

/** Asks for a line of text. Without a terminal there is nobody to ask, so the answer is null. */
export async function askLine(question: string): Promise<string | null> {
  if (!process.stdin.isTTY) return null;

  return readAnswer(`${question}\n> `);
}
