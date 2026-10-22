import type { AppMap } from '../../src/core/app-map.js';
import type { HooliganContext, HttpClient } from '../../src/core/context.js';
import { defaultCaps } from '../../src/guardrails/caps.js';

export function makeContext(
  map: AppMap,
  http: HttpClient,
  overrides: Partial<HooliganContext> = {},
): HooliganContext {
  return {
    runId: 'test-run',
    map,
    http,
    caps: defaultCaps(),
    confirmedHosts: [],
    includeRisky: false,
    ...overrides,
  };
}
