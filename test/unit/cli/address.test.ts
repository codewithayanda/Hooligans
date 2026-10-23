import { describe, expect, it } from 'vitest';
import { askForAddress, normalizeAddress, type AskLine } from '../../../src/cli/ui/address.js';

/** A user who gives these answers in turn. Null stands for a terminal that cannot answer. */
function user(...answers: (string | null)[]) {
  const asked: string[] = [];
  const said: string[] = [];
  const queue = [...answers];

  const askLine: AskLine = async (question) => {
    asked.push(question);
    return queue.shift() ?? null;
  };
  const say = (text: string): void => {
    said.push(text);
  };

  return { asked, said, askLine, say };
}

describe('normalizeAddress', () => {
  it.each<[string, string]>([
    ['3000', 'http://localhost:3000'],
    [':3000', 'http://localhost:3000'],
    ['localhost:3000', 'http://localhost:3000'],
    ['127.0.0.1:5173/', 'http://127.0.0.1:5173/'],
    ['  http://localhost:4200  ', 'http://localhost:4200'],
    ['https://localhost:3000', 'https://localhost:3000'],
    ['example.com', 'http://example.com'],
    ['', ''],
  ])('turns %j into %j', (typed, expected) => {
    expect(normalizeAddress(typed)).toBe(expected);
  });
});

describe('askForAddress', () => {
  it('takes a full address on the first try', async () => {
    const { askLine, say, said } = user('http://localhost:3000');

    expect(await askForAddress(askLine, say)).toEqual({ ok: true, url: 'http://localhost:3000' });
    expect(said).toEqual([]);
  });

  it('takes a bare port', async () => {
    const { askLine, say } = user('3000');

    expect(await askForAddress(askLine, say)).toEqual({ ok: true, url: 'http://localhost:3000' });
  });

  it('asks in plain words and says to start the app first', async () => {
    const { askLine, say, asked } = user('3000');
    await askForAddress(askLine, say);

    expect(asked[0]).toContain('Start your app first');
    expect(asked[0]).toContain('http://localhost:3000');
  });

  it('refuses an app that is not on this machine, says why and asks again', async () => {
    const { askLine, say, said, asked } = user('https://example.com', 'localhost:4200');
    const result = await askForAddress(askLine, say);

    expect(result).toEqual({ ok: true, url: 'http://localhost:4200' });
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('your own machine');
    expect(asked).toHaveLength(2);
  });

  it('asks again when nothing was typed', async () => {
    const { askLine, say, said } = user('', '3000');
    const result = await askForAddress(askLine, say);

    expect(result.ok).toBe(true);
    expect(said[0]).toContain('Give me a URL');
  });

  it('gives up after three tries and says how to give the address', async () => {
    const { askLine, say, asked } = user('a.example', 'b.example', 'c.example', '3000');
    const result = await askForAddress(askLine, say);

    expect(result).toEqual({ ok: false, message: expect.stringContaining('--url') });
    expect(asked).toHaveLength(3);
  });

  it('says to use --url when there is nobody to ask', async () => {
    const { askLine, say, said } = user(null);
    const result = await askForAddress(askLine, say);

    expect(result).toEqual({ ok: false, message: expect.stringContaining('--url') });
    expect(said).toEqual([]);
  });
});
