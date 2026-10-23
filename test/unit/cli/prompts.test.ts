import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readAnswer } from '../../../src/cli/ui/prompts.js';

function terminal() {
  return { input: new PassThrough(), output: new PassThrough() };
}

describe('readAnswer', () => {
  it('returns what the user typed', async () => {
    const streams = terminal();
    const answer = readAnswer('Address? ', streams);

    streams.input.write('3000\n');

    expect(await answer).toBe('3000');
  });

  it('writes the question where the user can see it', async () => {
    const streams = terminal();
    const answer = readAnswer('Address? ', streams);

    streams.input.write('3000\n');
    await answer;

    expect(String(streams.output.read())).toContain('Address? ');
  });

  it('returns null when the terminal closes before an answer', async () => {
    const streams = terminal();
    const answer = readAnswer('Address? ', streams);

    streams.input.end();

    expect(await answer).toBeNull();
  });
});
