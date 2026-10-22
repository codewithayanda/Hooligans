import type { HooliganContext } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import { looksDestructive } from '../../scout/crawl.js';
import { isRiskyRoute } from '../../scout/extract.js';
import { parse } from '../_shared/files.js';
import { probe } from '../_shared/probe.js';
import { debugPage, openRoute, type DebugHit, type OpenRoute } from './findings.js';
import { isSensitiveRoute } from './sensitive.js';

const MAX_ROUTES = 12;
const MANAGED_PATH = /^\/(?:rest|auth|storage|functions)\/v1\//;
const FILE_PATH = /\.[A-Za-z0-9]{1,5}$/;
const TEMPLATE_PATH = /[{}]|%7B|%7D/i;
const OPENAPI_GET = /^OpenAPI lists it: .*\bGET\b/;

/** Keys of an answer that say how a request went rather than hold any data. */
const NOISE = new Set(['error', 'errors', 'message', 'msg', 'status', 'statuscode', 'detail', 'code', 'success', 'ok']);

const DEBUG_PAGES: readonly (DebugHit & { marker: RegExp })[] = [
  {
    path: '/actuator/env',
    marker: /"propertySources"/,
    title: 'Your Spring Boot settings page is public',
    what: 'the settings and environment of the application',
    severity: 'high',
    fix: 'Turn off the Actuator env endpoint, or put it behind a login, and expose only the health endpoint.',
  },
  {
    path: '/phpinfo.php',
    marker: /<title>phpinfo\(\)<\/title>/i,
    title: 'A phpinfo page is public',
    what: 'the PHP configuration of the server',
    severity: 'medium',
    fix: 'Delete the phpinfo file from the server.',
  },
  {
    path: '/server-status',
    marker: /Apache Server Status/,
    title: 'Your Apache status page is public',
    what: 'the status of the web server and the requests it is handling',
    severity: 'medium',
    fix: 'Limit the server-status page to your own machine in the Apache configuration.',
  },
  {
    path: '/console',
    marker: /Werkzeug Debugger|Interactive Console/,
    title: 'The Flask debugger console is reachable',
    what: 'the Werkzeug debugger console',
    severity: 'high',
    fix: 'Turn off debug mode, for example by removing debug=True, before anyone else can reach the app.',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldsOf(item: unknown): string[] {
  return isRecord(item) ? Object.keys(item).slice(0, 8) : [];
}

function isFilled(value: unknown): boolean {
  if (value === null || value === '') return false;
  return !(Array.isArray(value) && value.length === 0);
}

/**
 * Whether an answer holds data, and what shape it has. An error, an empty list and an object
 * with nothing in it do not count. Neither does a lone number such as a count.
 */
export function describeData(json: unknown): { items: number | null; fields: string[] } | null {
  if (Array.isArray(json)) {
    return json.length > 0 ? { items: json.length, fields: fieldsOf(json.find(isRecord)) } : null;
  }
  if (!isRecord(json)) return null;

  const entries = Object.entries(json).filter(([key]) => !NOISE.has(key.toLowerCase()));

  for (const [, value] of entries) {
    if (Array.isArray(value) && value.length > 0) {
      return { items: value.length, fields: fieldsOf(value.find(isRecord)) };
    }
  }

  const filled = entries.filter(([, value]) => isFilled(value));
  const holdsData =
    filled.length > 1 || filled.some(([, value]) => typeof value === 'string' || isRecord(value));

  return holdsData ? { items: null, fields: filled.map(([key]) => key).slice(0, 8) } : null;
}

/** The GET routes the page calls or the API docs list, whose names sound private. */
export function routeCandidates(context: HooliganContext): string[] {
  const { map, includeRisky } = context;
  const origin = new URL(map.entry).origin;
  const addresses = [
    ...map.calls.filter((call) => call.method === 'GET').map((call) => call.url),
    ...map.leads.filter((lead) => OPENAPI_GET.test(lead.why)).map((lead) => lead.url),
  ];
  const paths = new Set<string>();

  for (const address of addresses) {
    const url = parse(address);
    if (!url || url.origin !== origin) continue;

    const path = url.pathname;
    if (MANAGED_PATH.test(path) || FILE_PATH.test(path) || TEMPLATE_PATH.test(path)) continue;
    if (!isSensitiveRoute(path) || looksDestructive(url, '')) continue;
    if (isRiskyRoute(path) && !includeRisky) continue;

    paths.add(path);
  }

  return [...paths].slice(0, MAX_ROUTES);
}

/** Asks for each of those routes again with no login, the way a stranger would. */
export async function checkOpenRoutes(context: HooliganContext): Promise<Finding[]> {
  const origin = new URL(context.map.entry).origin;
  const open: OpenRoute[] = [];

  for (const path of routeCandidates(context)) {
    const response = await probe(context.http, `${origin}${path}`, {
      redirect: 'manual',
      maxBodyBytes: 256 * 1024,
    });
    if (!response || response.status !== 200) continue;

    let json: unknown;
    try {
      json = JSON.parse(response.body);
    } catch {
      continue;
    }

    const data = describeData(json);
    if (data) open.push({ path, items: data.items, fields: data.fields });
  }

  return open.map((route) => openRoute(context.map, route));
}

/** A short list of well-known debug pages, each judged by what the page says and not by its status. */
export async function checkDebugPages(context: HooliganContext): Promise<Finding[]> {
  const origin = new URL(context.map.entry).origin;
  const shown: DebugHit[] = [];

  for (const page of DEBUG_PAGES) {
    const response = await probe(context.http, `${origin}${page.path}`, {
      redirect: 'manual',
      maxBodyBytes: 128 * 1024,
    });
    if (response && response.status === 200 && page.marker.test(response.body)) shown.push(page);
  }

  return shown.map((hit) => debugPage(context.map, hit));
}
