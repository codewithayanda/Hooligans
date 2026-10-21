import { describe, expect, it } from 'vitest';
import { assembleMap, type MapParts } from '../../../src/scout/scout.js';

const scope = { origins: ['http://localhost:3000'], confirmedHosts: [] };

const base: MapParts = {
  entry: 'http://localhost:3000/',
  scope,
  pages: [],
  forms: [],
  calls: [],
  assets: [],
  cookies: [],
  leads: [],
  urls: [],
  scripts: [],
  skipped: [],
};

describe('assembleMap', () => {
  it('sorts everything and removes duplicates', () => {
    const map = assembleMap({
      ...base,
      pages: [
        { url: 'http://localhost:3000/b', status: 200, headers: {} },
        { url: 'http://localhost:3000/a', status: 200, headers: {} },
        { url: 'http://localhost:3000/a', status: 200, headers: {} },
      ],
      cookies: [
        { name: 'b', secure: false, httpOnly: false },
        { name: 'a', secure: false, httpOnly: false },
      ],
    });

    expect(map.pages.map((page) => page.url)).toEqual([
      'http://localhost:3000/a',
      'http://localhost:3000/b',
    ]);
    expect(map.cookies.map((cookie) => cookie.name)).toEqual(['a', 'b']);
  });

  it('lists the other hosts the app talks to, not its own', () => {
    const map = assembleMap({
      ...base,
      urls: [
        'http://localhost:3000/',
        'https://cdn.example.com/lib.js',
        'https://abcd.supabase.co/rest/v1/orders',
        'not a url',
      ],
    });

    expect(map.externalHosts).toEqual(['abcd.supabase.co', 'cdn.example.com']);
    expect(map.stack.backends).toEqual(['supabase']);
  });

  it('takes the framework and the mode from what the browser saw', () => {
    const map = assembleMap({ ...base, urls: ['http://localhost:3000/assets/index-4f2a9c1b.js'] });

    expect(map.stack.framework).toBe('vite');
    expect(map.mode).toBe('prod');
  });

  it('counts what it found', () => {
    const map = assembleMap({
      ...base,
      pages: [{ url: 'http://localhost:3000/', status: 200, headers: {} }],
      calls: [{ method: 'GET', url: 'http://localhost:3000/api/a', status: 200, sentAuth: false }],
      skipped: ['/logout (looks destructive)', '/logout (looks destructive)'],
    });

    expect(map.coverage).toEqual({
      pages: 1,
      forms: 0,
      calls: 1,
      skipped: ['/logout (looks destructive)'],
    });
  });

  it('keeps the list of skipped things short', () => {
    const skipped = Array.from({ length: 40 }, (_, index) => `/page-${index} (skipped)`);
    const map = assembleMap({ ...base, skipped });

    expect(map.coverage.skipped).toHaveLength(31);
    expect(map.coverage.skipped.at(-1)).toBe('and 10 more');
  });
});
