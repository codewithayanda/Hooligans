import { describe, expect, it } from 'vitest';
import { buildJourney } from '../../../../src/hooligans/the-mob/journey.js';
import { makeMap, shopMap } from '../../../helpers/maps.js';

const page = (path: string, status = 200) => ({
  url: `http://localhost:3000${path}`,
  status,
  headers: {},
});

const call = (path: string, method = 'GET', status = 200) => ({
  method,
  url: `http://localhost:3000${path}`,
  status,
  sentAuth: false,
});

const labels = (map: ReturnType<typeof makeMap>, includeRisky = false) =>
  buildJourney(map, includeRisky).map((route) => route.label);

describe('buildJourney', () => {
  it('visits the first page, the pages of the app and the calls the pages make', () => {
    const map = shopMap({ pages: [page('/'), page('/about.html'), page('/gone', 404)] });

    expect(labels(map)).toEqual([
      'GET /',
      'GET /about.html',
      'GET /api/users',
      'GET /api/products',
    ]);
  });

  it('counts a call for more than a page, because that is where an app gives way', () => {
    const map = shopMap({ pages: [page('/about.html')] });
    const weights = buildJourney(map, false).map((route) => route.weight);

    expect(weights).toEqual([1, 1, 3, 3]);
  });

  it('reads only, from the app itself', () => {
    const map = makeMap({
      pages: [page('/')],
      calls: [
        call('/api/track', 'POST'),
        call('/api/items', 'DELETE'),
        { ...call('/api/items'), url: 'https://other.example/api/items' },
      ],
    });

    expect(labels(map)).toEqual(['GET /']);
  });

  it('leaves out files, and the calls of Supabase and Next.js', () => {
    const map = makeMap({
      calls: [
        call('/assets/app.js'),
        call('/rest/v1/orders?select=*'),
        call('/_next/data/x.json?a=1'),
        call('/api/items'),
      ],
    });

    expect(labels(map)).toEqual(['GET /', 'GET /api/items']);
  });

  it('leaves out routes that look risky, unless they were asked for', () => {
    const map = makeMap({ pages: [page('/checkout'), page('/about.html')] });

    expect(labels(map)).toEqual(['GET /', 'GET /about.html']);
    expect(labels(map, true)).toEqual(['GET /', 'GET /checkout', 'GET /about.html']);
  });

  it('never takes a route that looks destructive', () => {
    const map = makeMap({ pages: [page('/logout')], calls: [call('/api/delete-account')] });

    expect(labels(map, true)).toEqual(['GET /']);
  });

  it('keeps the query string of a call, but not of a page', () => {
    const map = makeMap({
      pages: [{ url: 'http://localhost:3000/shop?sort=price', status: 200, headers: {} }],
      calls: [call('/api/items?limit=20')],
    });

    expect(labels(map)).toEqual(['GET /', 'GET /shop', 'GET /api/items?limit=20']);
  });

  it('leaves out a call whose address was hidden by the Scout', () => {
    const map = makeMap({ calls: [call('/api/items?token=%5Bredacted%5D'), call('/api/ok')] });

    expect(labels(map)).toEqual(['GET /', 'GET /api/ok']);
  });

  it('takes at most 6 more pages and 8 calls', () => {
    const pages = Array.from({ length: 12 }, (_, index) => page(`/p${index}`));
    const calls = Array.from({ length: 12 }, (_, index) => call(`/api/c${index}`));
    const routes = buildJourney(makeMap({ pages, calls }), false);

    expect(routes).toHaveLength(1 + 6 + 8);
  });

  it('is empty when the first page cannot be loaded', () => {
    const map = makeMap({ entry: 'http://localhost:3000/checkout' });

    expect(buildJourney(map, false)).toEqual([]);
  });

  it('gives every route an address the crowd can ask for', () => {
    const [first, second] = buildJourney(shopMap(), false);

    expect(first?.url).toBe('http://localhost:3000/');
    expect(second?.url).toBe('http://localhost:3000/api/users');
  });
});
