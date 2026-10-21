import { describe, expect, it } from 'vitest';
import { loudmouth } from '../../../../src/hooligans/loudmouth/index.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp, type FakeRoute } from '../../../helpers/fake-http.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { loadMap, makeMap, type FixtureName } from '../../../helpers/maps.js';

const echoOrigin: FakeRoute = (request) => ({
  headers: {
    'access-control-allow-origin': request.headers?.origin ?? '*',
    'access-control-allow-credentials': 'true',
  },
});

async function scan(name: FixtureName, routes: Record<string, FakeRoute> = {}) {
  return loudmouth.run(makeContext(loadMap(name), fakeHttp(routes)));
}

describe('Loudmouth', () => {
  it('finds what the vulnerable site says too loudly', async () => {
    const { findings } = await scan('vulnerable', { '/': echoOrigin, '/api/products': echoOrigin });

    expect(findings.map((finding) => finding.id).sort()).toEqual([
      'loudmouth.cookie-readable-by-scripts',
      'loudmouth.cors-reflects-origin',
      'loudmouth.missing-csp',
      'loudmouth.missing-frame-protection',
      'loudmouth.missing-nosniff',
      'loudmouth.server-banner',
    ]);
    for (const finding of findings) expectWellFormed(finding);
  });

  it('finds nothing on the fixed site', async () => {
    const { findings } = await scan('fixed');

    expect(findings).toEqual([]);
  });

  it('finds nothing on a clean single page app that uses Supabase', async () => {
    const { findings } = await scan('spa-with-login');

    expect(findings).toEqual([]);
  });

  it('says what it did not check, including what only matters over https', async () => {
    const { notLookedAt } = await scan('fixed');

    expect(notLookedAt).toContainEqual(expect.stringContaining('only on the pages and calls'));
    expect(notLookedAt).toContainEqual(expect.stringContaining('only matter over https'));
  });

  it('does not mention https settings when the app is on https', async () => {
    const map = makeMap({ entry: 'https://localhost:3000/' });
    const { notLookedAt } = await loudmouth.run(makeContext(map, fakeHttp()));

    expect(notLookedAt?.some((sentence) => sentence.includes('only matter over https'))).toBe(
      false,
    );
  });

  it('says so when it could not read the headers of any page', async () => {
    const { findings, notLookedAt } = await loudmouth.run(makeContext(makeMap(), fakeHttp()));

    expect(findings).toEqual([]);
    expect(notLookedAt).toContainEqual(expect.stringContaining('could not read the headers'));
  });
});
