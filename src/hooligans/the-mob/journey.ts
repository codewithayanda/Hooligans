import type { AppMap } from '../../core/app-map.js';
import type { Route } from '../../load/ramp.js';
import { looksDestructive } from '../../scout/crawl.js';
import { isRiskyRoute } from '../../scout/extract.js';
import { parse } from '../_shared/files.js';

const MAX_PAGES = 6;
const MAX_CALLS = 8;
const PAGE_WEIGHT = 1;
const CALL_WEIGHT = 3;

const MANAGED_PATH = /^\/(?:rest|auth|storage|functions)\/v1\/|^\/_next\/|^\/@|^\/node_modules\//;
const STATIC_FILE =
  /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp[34]|webm|pdf|zip)$/i;

/**
 * What a crowd asks for: the first page, a few more pages and the calls the pages make on their
 * own. Calls count for more, because that is where an app usually gives way. Reads only, and
 * nothing that looks risky or destructive.
 */
export function buildJourney(map: AppMap, includeRisky: boolean): Route[] {
  const origin = new URL(map.entry).origin;
  const routes = new Map<string, Route>();

  const add = (address: string, weight: number, keepQuery: boolean): boolean => {
    const url = parse(address);
    if (!url || url.origin !== origin) return false;
    if (MANAGED_PATH.test(url.pathname) || STATIC_FILE.test(url.pathname)) return false;
    if (looksDestructive(url, '') || (isRiskyRoute(url.pathname) && !includeRisky)) return false;
    if (url.search.includes('redacted')) return false;

    const path = keepQuery ? `${url.pathname}${url.search}` : url.pathname;
    const label = `GET ${path}`;
    if (routes.has(label)) return false;

    routes.set(label, { label, url: `${origin}${path}`, weight });
    return true;
  };

  add(map.entry, PAGE_WEIGHT, false);

  let pages = 0;
  for (const page of map.pages) {
    if (pages >= MAX_PAGES) break;
    if (page.status >= 200 && page.status < 400 && add(page.url, PAGE_WEIGHT, false)) pages += 1;
  }

  let calls = 0;
  for (const call of map.calls) {
    if (calls >= MAX_CALLS) break;
    if (call.method === 'GET' && call.status < 400 && add(call.url, CALL_WEIGHT, true)) calls += 1;
  }

  return [...routes.values()];
}
