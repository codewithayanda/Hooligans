import { describe, expect, it } from 'vitest';
import { buildFixPrompt, buildMasterPrompt } from '../../../src/prompts/build.js';
import { describeStack } from '../../../src/prompts/stack.js';
import { makeFinding } from '../../helpers/findings.js';

const parts = {
  stack: { framework: 'nextjs', backends: ['supabase'] },
  problem: 'Login accepts unlimited attempts.',
  change: 'Add rate limiting to POST /api/login.',
  keep: 'Normal logins must keep working.',
  recheck: { hooligan: 'brute', url: 'http://localhost:3000' },
};

const fakeStripeKey = ['sk', 'live', 'x'.repeat(24)].join('_');

describe('buildFixPrompt', () => {
  it('has the five parts', () => {
    const prompt = buildFixPrompt(parts);

    for (const label of ['Context:', 'Problem:', 'Change:', 'Keep:', 'Check:']) {
      expect(prompt).toContain(label);
    }
  });

  it('ends with the command that re-checks only this hooligan', () => {
    expect(buildFixPrompt(parts)).toContain(
      'npx hooligans scan --url http://localhost:3000 --only brute',
    );
  });

  it('refuses to build a prompt that contains a secret', () => {
    expect(() =>
      buildFixPrompt({ ...parts, problem: `The key ${fakeStripeKey} is exposed.` }),
    ).toThrow(/never contain a secret/);
  });
});

describe('buildMasterPrompt', () => {
  it('numbers the findings and includes each prompt', () => {
    const prompt = buildMasterPrompt([
      makeFinding({ title: 'First problem', fixPrompt: 'Prompt one' }),
      makeFinding({ title: 'Second problem', fixPrompt: 'Prompt two' }),
    ]);

    expect(prompt).toContain('## 1. First problem');
    expect(prompt).toContain('## 2. Second problem');
    expect(prompt).toContain('Prompt one');
    expect(prompt).toContain('Prompt two');
  });

  it('says so when there is nothing to fix', () => {
    expect(buildMasterPrompt([])).toContain('nothing to fix');
  });
});

describe('describeStack', () => {
  it('names the framework and the backend', () => {
    expect(describeStack({ framework: 'nextjs', backends: ['supabase'] })).toBe(
      'This is a Next.js app that uses Supabase.',
    );
  });

  it('names several backends', () => {
    expect(describeStack({ framework: 'vite', backends: ['supabase', 'firebase'] })).toBe(
      'This is a Vite app that uses Supabase and Firebase.',
    );
  });

  it('names Angular, and says an before a name that starts with a vowel', () => {
    expect(describeStack({ framework: 'angular', backends: [] })).toBe('This is an Angular app.');
    expect(describeStack({ framework: 'express', backends: [] })).toBe('This is an Express app.');
  });

  it('says so when it cannot tell', () => {
    expect(describeStack({ backends: [] })).toContain('could not tell');
  });

  it('ignores names it does not recognise', () => {
    expect(describeStack({ framework: '<script>', backends: ['unknown'] })).toContain(
      'could not tell',
    );
  });
});
