import { readFileSync } from 'node:fs';
import type { AppMap } from '../../src/core/app-map.js';

export type FixtureName = 'vulnerable' | 'fixed' | 'spa-with-login';

export function makeMap(overrides: Partial<AppMap> = {}): AppMap {
  return {
    entry: 'http://localhost:3000/',
    mode: 'prod',
    stack: { backends: [] },
    pages: [],
    forms: [],
    calls: [],
    assets: [],
    cookies: [],
    leads: [],
    externalHosts: [],
    coverage: { pages: 0, forms: 0, calls: 0, skipped: [] },
    ...overrides,
  };
}

/** A small shop: a contact form, a search form, a login form and the calls its page makes. */
export function shopMap(overrides: Partial<AppMap> = {}): AppMap {
  return makeMap({
    forms: [
      {
        page: 'http://localhost:3000/contact.html',
        action: 'http://localhost:3000/api/contact',
        method: 'POST',
        fields: [
          { name: 'name', type: 'text' },
          { name: 'topic', type: 'select-one' },
          { name: 'message', type: 'textarea' },
        ],
      },
      {
        page: 'http://localhost:3000/',
        action: 'http://localhost:3000/search',
        method: 'GET',
        fields: [{ name: 'q', type: 'search' }],
      },
      {
        page: 'http://localhost:3000/login.html',
        action: 'http://localhost:3000/api/login',
        method: 'POST',
        fields: [
          { name: 'email', type: 'email' },
          { name: 'password', type: 'password' },
        ],
      },
    ],
    calls: [
      {
        method: 'GET',
        url: 'http://localhost:3000/rest/v1/orders?select=*&limit=1',
        status: 200,
        sentAuth: true,
      },
      { method: 'GET', url: 'http://localhost:3000/api/users', status: 200, sentAuth: false },
      { method: 'GET', url: 'http://localhost:3000/api/products', status: 200, sentAuth: false },
      { method: 'POST', url: 'http://localhost:3000/api/track', status: 204, sentAuth: false },
    ],
    assets: [{ url: 'http://localhost:3000/assets/index-4f2a9c1b.js', kind: 'script' }],
    ...overrides,
  });
}

/** Several POST forms with the same plain text fields, to try the caps on requests. */
export function manyForms(count: number, fieldCount = 1): AppMap {
  const fields = ['a', 'b', 'c'].slice(0, fieldCount).map((name) => ({ name, type: 'text' }));
  const forms = Array.from({ length: count }, (_, index) => ({
    page: 'http://localhost:3000/',
    action: `http://localhost:3000/api/form${index}`,
    method: 'POST',
    fields,
  }));

  return makeMap({ forms });
}

/** A map the Scout could have written, saved in test/fixtures/maps, so no browser is needed. */
export function loadMap(name: FixtureName): AppMap {
  const file = new URL(`../fixtures/maps/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as AppMap;
}
