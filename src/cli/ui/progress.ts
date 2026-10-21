import type { Progress } from '../../core/orchestrator.js';
import { dim } from './color.js';

/** One quiet line per step, on stderr, so stdout stays clean for --json. */
export function createProgress(
  stream: { write(text: string): unknown } = process.stderr,
): Progress {
  return {
    step(text) {
      stream.write(`${dim(`  ${text}`)}\n`);
    },
  };
}

export const silentProgress: Progress = {
  step() {
    return undefined;
  },
};
