import type { FakeReply, FakeRoute } from './fake-http.js';

export type Mode = 'vuln' | 'fixed';

function part(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** A made-up token built from its parts, so no key-shaped text sits in the source. */
export function makeJwt(claims: object): string {
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.${'s'.repeat(30)}`;
}

export function anonKey(): string {
  return makeJwt({ role: 'anon', ref: 'demo' });
}

const TRACE = [
  "TypeError: Cannot read properties of undefined (reading 'trim')",
  '    at saveMessage (/srv/shop/src/contact.js:42:17)',
  '    at handleContact (/srv/shop/src/routes.js:18:5)',
].join('\n');

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

export function json(status: number, data: unknown): FakeReply {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  };
}

/** What the demo twins do, without a server, so a hooligan can be tried on its own. */
export function siteRoutes(mode: Mode): Record<string, FakeRoute> {
  return {
    '/assets/index-4f2a9c1b.js': {
      headers: { 'content-type': 'text/javascript' },
      body: `var anonKey = '${anonKey()}';`,
    },

    '/rest/v1/orders': (request) =>
      request.headers?.apikey === undefined
        ? json(401, { message: 'No API key found in request' })
        : json(200, mode === 'vuln' ? [{ id: 1, user_id: 'u-1', total: 12 }] : []),

    '/api/users': () =>
      mode === 'vuln' ? json(200, [{ id: 1, email: 'jane@example.com' }]) : json(401, { error: 'x' }),

    '/api/contact': (request) => {
      const name = new URLSearchParams(request.body ?? '').get('name') ?? '';
      if (name.length <= 200) return { status: 204 };

      return mode === 'vuln'
        ? { status: 500, headers: { 'content-type': 'text/plain' }, body: TRACE }
        : json(400, { error: 'The name is too long' });
    },

    '/search': (request) => {
      const term = new URL(request.url).searchParams.get('q') ?? '';

      if (mode === 'vuln' && term.includes("'")) {
        return {
          status: 500,
          headers: { 'content-type': 'text/plain' },
          body: `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${term}' at line 1`,
        };
      }

      const shown = mode === 'vuln' ? term : escapeHtml(term);
      return {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: `<html><body><h1>Results for ${shown}</h1></body></html>`,
      };
    },

    ...(mode === 'vuln'
      ? { '/actuator/env': () => json(200, { propertySources: [{ name: 'env', properties: {} }] }) }
      : {}),
  };
}
