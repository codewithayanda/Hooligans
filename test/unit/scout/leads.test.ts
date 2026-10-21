import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../../../src/core/context.js';
import { gatherLeads, parseOpenApi, parseRobots, parseSitemap } from '../../../src/scout/leads.js';

const origin = 'http://localhost:3000';

describe('parseRobots', () => {
  const text = [
    'User-agent: *',
    'Disallow: /admin/',
    'Disallow: /private/*',
    'Disallow:',
    'Disallow: /',
    '# Disallow: /commented',
    `Sitemap: ${origin}/sitemap.xml`,
    'Sitemap: http://evil.example/sitemap.xml',
  ].join('\n');

  it('lists the paths it asks crawlers to keep out of', () => {
    const { leads } = parseRobots(text, origin);

    expect(leads.map((lead) => lead.url)).toEqual([`${origin}/admin/`, `${origin}/private/`]);
  });

  it('keeps only sitemaps on the same origin', () => {
    expect(parseRobots(text, origin).sitemaps).toEqual([`${origin}/sitemap.xml`]);
  });

  it('copes with a page that is not a robots file', () => {
    expect(parseRobots('<!doctype html><html></html>', origin)).toEqual({
      leads: [],
      sitemaps: [],
    });
  });
});

describe('parseSitemap', () => {
  it('lists pages on the same origin and unescapes the address', () => {
    const xml = [
      `<loc>${origin}/a</loc>`,
      `<loc> ${origin}/b?x=1&amp;y=2 </loc>`,
      '<loc>http://other.example/c</loc>',
    ].join('\n');

    expect(parseSitemap(xml, origin).map((lead) => lead.url)).toEqual([
      `${origin}/a`,
      `${origin}/b?x=1&y=2`,
    ]);
  });
});

describe('parseOpenApi', () => {
  it('lists the documented paths with their methods', () => {
    const spec = JSON.stringify({
      paths: {
        '/api/products': { get: {}, parameters: [] },
        '/api/login': { post: {} },
        nonsense: {},
      },
    });

    expect(parseOpenApi(spec, origin)).toEqual([
      { url: `${origin}/api/products`, why: 'OpenAPI lists it: GET' },
      { url: `${origin}/api/login`, why: 'OpenAPI lists it: POST' },
    ]);
  });

  it('copes with something that is not JSON or has no paths', () => {
    expect(parseOpenApi('<html></html>', origin)).toEqual([]);
    expect(parseOpenApi('{"openapi":"3.0.0"}', origin)).toEqual([]);
  });
});

describe('gatherLeads', () => {
  function fakeHttp(files: Record<string, string>): HttpClient {
    return {
      request: async ({ url }) => {
        const body = files[new URL(url).pathname];
        if (body === undefined) throw new Error('not found');
        return { status: 200, headers: {}, body, durationMs: 1, truncated: false, url };
      },
    };
  }

  it('gathers leads from robots.txt, the sitemap and an OpenAPI file, without duplicates', async () => {
    const http = fakeHttp({
      '/robots.txt': 'Disallow: /admin/\nSitemap: http://localhost:3000/sitemap.xml',
      '/sitemap.xml': `<loc>${origin}/hidden.html</loc><loc>${origin}/admin/</loc>`,
      '/openapi.json': JSON.stringify({ paths: { '/api/products': { get: {} } } }),
    });

    const urls = (await gatherLeads(http, origin)).map((lead) => lead.url);

    expect(urls).toEqual([`${origin}/admin/`, `${origin}/hidden.html`, `${origin}/api/products`]);
  });

  it('copes with files that are missing', async () => {
    expect(await gatherLeads(fakeHttp({}), origin)).toEqual([]);
  });
});
