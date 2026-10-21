import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { launchBrowser } from '../../scout/browser.js';
import { ensureWorkspace } from '../../util/workspace.js';

export type Check = { ok: boolean; label: string; detail: string };

const MINIMUM_NODE = '22.13.0';

/** Positive when a is newer than b. Compares dotted numbers such as 22.13.0. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

export function checkNode(version: string, minimum = MINIMUM_NODE): Check {
  const ok = compareVersions(version, minimum) >= 0;

  return {
    ok,
    label: 'Node',
    detail: ok
      ? `${version} (needs ${minimum} or newer)`
      : `${version} is too old, Hooligans needs ${minimum} or newer`,
  };
}

async function checkBrowser(): Promise<Check> {
  try {
    const { browser, used } = await launchBrowser();
    await browser.close();

    return { ok: true, label: 'Browser', detail: `${used} started and closed fine` };
  } catch (error) {
    return {
      ok: false,
      label: 'Browser',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkWorkspace(cwd: string): Check {
  try {
    const directory = ensureWorkspace(cwd);
    const probe = join(directory, '.probe');
    writeFileSync(probe, '');
    rmSync(probe);

    return { ok: true, label: 'Workspace', detail: '.hooligans can be written here' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      label: 'Workspace',
      detail: `.hooligans cannot be written here: ${reason}`,
    };
  }
}

export function formatChecks(checks: readonly Check[]): string {
  const lines = checks.map((check) => {
    const mark = check.ok ? 'ok     ' : 'problem';
    return `  ${mark}  ${check.label}: ${check.detail.split('\n').join('\n           ')}`;
  });

  return ['Hooligans doctor', ...lines].join('\n');
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check Node, the browser and the workspace before a first scan.')
    .action(async () => {
      const checks = [
        checkNode(process.versions.node),
        await checkBrowser(),
        checkWorkspace(process.cwd()),
      ];

      console.log(formatChecks(checks));
      if (checks.some((check) => !check.ok)) process.exitCode = 1;
    });
}
