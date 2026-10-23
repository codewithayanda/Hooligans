import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/core/roster.js';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('the roster page', () => {
  const page = read('docs/roster.md');

  it('names every hooligan and its job as the roster does', () => {
    for (const entry of ROSTER) {
      expect(page, `${entry.name} is not in the table`).toContain(`| ${entry.name} |`);
      expect(page, `the job of ${entry.name} differs`).toContain(entry.summary);
    }
  });
});

describe('the README', () => {
  const readme = read('README.md');

  it('names every hooligan of version 0.1', () => {
    for (const entry of ROSTER.filter((candidate) => candidate.since === '0.1')) {
      expect(readme, `${entry.name} is missing`).toContain(`**${entry.name}**`);
    }
  });

  it('points to the pages that say what is covered and where Hooligans stops', () => {
    for (const page of ['docs/roster.md', 'docs/safety.md', 'docs/architecture.md']) {
      expect(readme).toContain(page);
    }
  });
});

describe('the pages that were empty', () => {
  it.each(['docs/roster.md', 'docs/safety.md', 'docs/architecture.md'])('%s is written', (page) => {
    expect(read(page).trim().length).toBeGreaterThan(500);
  });
});
