import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isValidRunId,
  listRunIds,
  newRunId,
  runDirectory,
  workspacePath,
} from '../../../src/util/workspace.js';

let directory = '';

function freshDirectory(): string {
  directory = mkdtempSync(join(tmpdir(), 'hooligans-'));
  return directory;
}

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = '';
});

describe('isValidRunId', () => {
  it('accepts a normal run id', () => {
    expect(isValidRunId('20261021-140312-ab12')).toBe(true);
  });

  it('rejects anything that could leave the runs folder', () => {
    for (const bad of ['', '..', '../x', '.hidden', 'a/b', 'a\\b']) {
      expect(isValidRunId(bad)).toBe(false);
    }
  });
});

describe('newRunId', () => {
  it('starts with the time so ids sort oldest to newest', () => {
    expect(newRunId(new Date('2026-10-21T14:03:12Z'))).toMatch(/^20261021-140312-[0-9a-f]{4}$/);
  });
});

describe('runDirectory', () => {
  it('creates the run folder and a .gitignore that ignores everything in it', () => {
    const cwd = freshDirectory();
    const run = runDirectory(cwd, '20261021-140312-ab12');

    expect(existsSync(run)).toBe(true);
    expect(readFileSync(join(workspacePath(cwd), '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('refuses an invalid run id', () => {
    expect(() => runDirectory(freshDirectory(), '../escape')).toThrow(/not a valid run id/);
  });
});

describe('listRunIds', () => {
  it('lists runs oldest first, so the last one is the newest', () => {
    const cwd = freshDirectory();
    runDirectory(cwd, '20261021-110000-bbbb');
    runDirectory(cwd, '20261021-100000-aaaa');

    expect(listRunIds(cwd)).toEqual(['20261021-100000-aaaa', '20261021-110000-bbbb']);
  });

  it('returns nothing when there is no workspace yet', () => {
    expect(listRunIds(freshDirectory())).toEqual([]);
  });
});
