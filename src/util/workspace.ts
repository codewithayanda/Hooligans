import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const WORKSPACE_DIR = '.hooligans';

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidRunId(runId: string): boolean {
  return RUN_ID_PATTERN.test(runId);
}

export function workspacePath(cwd: string): string {
  return join(cwd, WORKSPACE_DIR);
}

/** Creates .hooligans with its own .gitignore, so nothing inside can be committed by accident. */
export function ensureWorkspace(cwd: string): string {
  const root = workspacePath(cwd);
  mkdirSync(root, { recursive: true });

  const ignoreFile = join(root, '.gitignore');
  if (!existsSync(ignoreFile)) writeFileSync(ignoreFile, '*\n');

  return root;
}

export function runDirectory(cwd: string, runId: string): string {
  if (!isValidRunId(runId)) throw new Error(`"${runId}" is not a valid run id.`);

  const directory = join(ensureWorkspace(cwd), 'runs', runId);
  mkdirSync(directory, { recursive: true });
  return directory;
}

/** Run ids start with a timestamp, so sorting them puts the newest last. */
export function listRunIds(cwd: string): string[] {
  try {
    return readdirSync(join(workspacePath(cwd), 'runs'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function newRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${stamp}-${randomBytes(2).toString('hex')}`;
}

/** What Hooligans puts in everything it types into an app, so the junk can be found and removed. */
export function cleanupMarker(runId: string): string {
  return `hooligans-${runId}`;
}
