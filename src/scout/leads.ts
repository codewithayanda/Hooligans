import type { Lead } from '../core/app-map.js';
import type { HttpClient } from '../core/context.js';

const OPENAPI_PATHS = [
  '/openapi.json',
  '/swagger.json',
  '/api-docs',
  '/v3/api-docs',
  '/api/openapi.json',
];
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
const MAX_PER_SOURCE = 50;

/** Reads robots.txt: the paths it asks crawlers to keep out of, and any sitemaps it names. */
export function parseRobots(text: string, origin: string): { leads: Lead[]; sitemaps: string[] } {
  const leads: Lead[] = [];
  const sitemaps: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = (raw.split('#')[0] ?? '').trim();
    const match = /^(disallow|sitemap)\s*:\s*(.*)$/i.exec(line);
    const kind = match?.[1]?.toLowerCase();
    const value = (match?.[2] ?? '').trim();
    if (!kind || value === '') continue;

    try {
      if (kind === 'sitemap') {
        const url = new URL(value, origin);
        if (url.origin === origin) sitemaps.push(url.href);
      } else {
        const path = value.replace(/[*$]/g, '');
        if (path === '' || path === '/') continue;
        leads.push({
          url: new URL(path, origin).href,
          why: 'robots.txt asks crawlers to keep out',
        });
      }
    } catch {
      continue;
    }
  }

  return { leads: leads.slice(0, MAX_PER_SOURCE), sitemaps: sitemaps.slice(0, 3) };
}

/** Reads a sitemap: the pages it lists on the same origin. */
export function parseSitemap(text: string, origin: string): Lead[] {
  const leads: Lead[] = [];

  for (const match of text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const url = new URL((match[1] ?? '').replaceAll('&amp;', '&'));
      if (url.origin === origin) leads.push({ url: url.href, why: 'the sitemap lists it' });
    } catch {
      continue;
    }
  }

  return leads.slice(0, MAX_PER_SOURCE);
}

/** Reads an OpenAPI file: the paths it documents, with their methods. */
export function parseOpenApi(text: string, origin: string): Lead[] {
  let spec: unknown;
  try {
    spec = JSON.parse(text);
  } catch {
    return [];
  }

  const paths = (spec as { paths?: unknown } | null)?.paths;
  if (typeof paths !== 'object' || paths === null) return [];

  const leads: Lead[] = [];
  for (const [path, operations] of Object.entries(paths)) {
    if (!path.startsWith('/')) continue;

    const methods =
      typeof operations === 'object' && operations !== null
        ? Object.keys(operations).filter((method) => HTTP_METHODS.includes(method.toLowerCase()))
        : [];
    const why =
      methods.length > 0
        ? `OpenAPI lists it: ${methods.join(', ').toUpperCase()}`
        : 'OpenAPI lists it';

    leads.push({ url: `${origin}${path}`, why });
  }

  return leads.slice(0, MAX_PER_SOURCE);
}

async function read(http: HttpClient, url: string): Promise<string | null> {
  try {
    const response = await http.request({
      method: 'GET',
      url,
      maxBodyBytes: 512 * 1024,
      timeoutMs: 5000,
    });
    return response.status === 200 ? response.body : null;
  } catch {
    return null;
  }
}

/** Finds the places the app points at without linking to them. They are noted, never visited. */
export async function gatherLeads(http: HttpClient, origin: string): Promise<Lead[]> {
  const leads = new Map<string, Lead>();
  const add = (lead: Lead): void => {
    if (!leads.has(lead.url) && leads.size < 150) leads.set(lead.url, lead);
  };

  const sitemapUrls = new Set<string>([`${origin}/sitemap.xml`]);

  const robots = await read(http, `${origin}/robots.txt`);
  if (robots) {
    const parsed = parseRobots(robots, origin);
    parsed.leads.forEach(add);
    parsed.sitemaps.forEach((url) => sitemapUrls.add(url));
  }

  for (const url of [...sitemapUrls].slice(0, 3)) {
    const sitemap = await read(http, url);
    if (sitemap) parseSitemap(sitemap, origin).forEach(add);
  }

  for (const path of OPENAPI_PATHS) {
    const spec = await read(http, `${origin}${path}`);
    if (spec) parseOpenApi(spec, origin).forEach(add);
  }

  return [...leads.values()];
}
