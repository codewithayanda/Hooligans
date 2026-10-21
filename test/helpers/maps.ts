import type { AppMap } from '../../src/core/app-map.js';

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
