import { describe, expect, it } from 'vitest';
import { doorRattler } from '../../../../src/hooligans/door-rattler/index.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp } from '../../../helpers/fake-http.js';
import { anonKey, siteRoutes, type Mode } from '../../../helpers/fake-site.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { shopMap } from '../../../helpers/maps.js';

async function rattle(mode: Mode) {
  const http = fakeHttp(siteRoutes(mode));
  const result = await doorRattler.run(makeContext(shopMap(), http));
  return { ...result, http };
}

describe('Door Rattler on the vulnerable site', () => {
  it('finds the table, the route and the page that open their doors', async () => {
    const { findings } = await rattle('vuln');

    expect(findings.map((finding) => finding.id).sort()).toEqual([
      'door-rattler.debug-page',
      'door-rattler.open-route',
      'door-rattler.open-table',
    ]);
    for (const finding of findings) expectWellFormed(finding);
  });

  it('rates each by what a stranger could do', async () => {
    const { findings } = await rattle('vuln');
    const severity = (id: string) => findings.find((finding) => finding.id === id)?.severity;

    expect(severity('door-rattler.open-table')).toBe('critical');
    expect(severity('door-rattler.open-route')).toBe('high');
    expect(severity('door-rattler.debug-page')).toBe('high');
  });

  it('never repeats the key or what a row holds', async () => {
    const { findings } = await rattle('vuln');
    const text = JSON.stringify(findings);

    expect(text).not.toContain(anonKey());
    expect(text).not.toContain('jane@example.com');
  });

  it('only reads', async () => {
    const { http } = await rattle('vuln');

    expect(http.requests.length).toBeGreaterThan(3);
    expect(http.requests.every((request) => request.method === 'GET')).toBe(true);
    expect(http.requests.every((request) => request.body === undefined)).toBe(true);
  });
});

describe('Door Rattler on the fixed site', () => {
  it('finds nothing', async () => {
    const { findings } = await rattle('fixed');

    expect(findings).toEqual([]);
  });

  it('says what it could not tell, and what it did not look at', async () => {
    const { notLookedAt } = await rattle('fixed');

    expect(notLookedAt?.[0]).toContain('Door Rattler only reads, with no login.');
    expect(notLookedAt).toContain(
      'A Supabase table that answered with no rows looks the same as a protected one, so it is not reported.',
    );
  });
});

describe('Door Rattler', () => {
  it('asks for at most 10 requests a second', () => {
    expect(doorRattler.requestsPerSecond).toBe(10);
  });

  it('needs no login', () => {
    expect(doorRattler.sessions).toBe(0);
  });
});
