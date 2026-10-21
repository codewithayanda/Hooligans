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

/** A map the Scout could have written, saved in test/fixtures/maps, so no browser is needed. */
export function loadMap(name: FixtureName): AppMap {
  const file = new URL(`../fixtures/maps/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as AppMap;
}
