import type { AppMap } from '../../core/app-map.js';
import type { HooliganContext } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import { isRiskyRoute } from '../../scout/extract.js';
import { probe } from '../_shared/probe.js';
import { corsReflectsOrigin, corsWildcard, type CorsAnswer } from './findings.js';

/** An origin that cannot exist, so an answer that allows it is an answer that allows anyone. */
export const PROBE_ORIGIN = 'https://hooligans.invalid';

const MAX_PROBES = 8;

/** The first page and the GET calls the Scout saw, without their query strings. */
function probePaths(map: AppMap): string[] {
  const entry = new URL(map.entry);
  const paths = [entry.pathname];

  for (const call of map.calls) {
    if (call.method !== 'GET') continue;

    try {
      const url = new URL(call.url);
      if (url.origin === entry.origin) paths.push(url.pathname);
    } catch {
      continue;
    }
  }

  return [...new Set(paths)].filter((path) => !isRiskyRoute(path)).slice(0, MAX_PROBES);
}

/** Asks a few known routes for an answer as a stranger's website would, and reads the reply. */
export async function checkCors(context: HooliganContext): Promise<Finding[]> {
  const { map, http } = context;
  const origin = new URL(map.entry).origin;
  const reflected: CorsAnswer[] = [];
  const wildcard: CorsAnswer[] = [];

  for (const path of probePaths(map)) {
    const response = await probe(http, `${origin}${path}`, {
      headers: { origin: PROBE_ORIGIN },
      redirect: 'manual',
      maxBodyBytes: 32 * 1024,
    });
    const allow = response?.headers['access-control-allow-origin'];
    if (!response || allow === undefined) continue;

    const credentials =
      (response.headers['access-control-allow-credentials'] ?? '').toLowerCase() === 'true';

    if (allow === PROBE_ORIGIN) reflected.push({ path, credentials });
    else if (allow === '*') wildcard.push({ path, credentials });
  }

  const findings: Finding[] = [];
  if (reflected.length > 0) findings.push(corsReflectsOrigin(map, reflected, PROBE_ORIGIN));
  if (wildcard.length > 0) findings.push(corsWildcard(map, wildcard));
  return findings;
}
