import { readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROSTER, rosterEntry } from '../src/core/roster.js';
import { HOOLIGANS } from '../src/hooligans/registry.js';

const hooliganFolders = new URL('../src/hooligans/', import.meta.url);
const demoRoutes = new URL('../demo/src/routes/', import.meta.url);

function hasContent(path: URL): boolean {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

/** The folders in src/hooligans whose index.ts has something in it. */
function writtenHooligans(): string[] {
  return readdirSync(hooliganFolders, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .filter((entry) => hasContent(new URL(`${entry.name}/index.ts`, hooliganFolders)))
    .map((entry) => entry.name)
    .sort();
}

describe('the hooligans are wired up', () => {
  it('registers every hooligan that has been written', () => {
    expect(HOOLIGANS.map((hooligan) => hooligan.id).sort()).toEqual(writtenHooligans());
  });

  it('registers each hooligan once', () => {
    const ids = HOOLIGANS.map((hooligan) => hooligan.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('takes the name, stage and summary of each from the roster', () => {
    for (const hooligan of HOOLIGANS) {
      const entry = rosterEntry(hooligan.id);

      expect(entry, `${hooligan.id} is not on the roster`).toBeDefined();
      expect(hooligan).toMatchObject({
        name: entry?.name,
        stage: entry?.stage,
        summary: entry?.summary,
      });
    }
  });

  it('runs them in roster order, which is stage order', () => {
    const positions = HOOLIGANS.map((hooligan) =>
      ROSTER.findIndex((entry) => entry.id === hooligan.id),
    );

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('needs no saved login for anything in version 0.1', () => {
    for (const hooligan of HOOLIGANS) expect(hooligan.sessions).toBe(0);
  });

  it('keeps the findings of each hooligan in its own folder', () => {
    for (const hooligan of HOOLIGANS) {
      const findings = new URL(`${hooligan.id}/findings.ts`, hooliganFolders);

      expect(hasContent(findings), `${hooligan.id} has no findings.ts`).toBe(true);
    }
  });

  it('gives each hooligan a vulnerable and a fixed twin in the demo', () => {
    for (const hooligan of HOOLIGANS) {
      const route = new URL(`${hooligan.id}.ts`, demoRoutes);

      expect(hasContent(route), `${hooligan.id} has no demo route`).toBe(true);
    }
  });
});
