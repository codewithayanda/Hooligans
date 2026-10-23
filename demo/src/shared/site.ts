import { readFile } from 'node:fs/promises';
import { PRODUCTS } from './db.js';
import { send, type Handler } from './route.js';

const PUBLIC_DIR = new URL('../../public/', import.meta.url);

const PAGES: Readonly<Record<string, string>> = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/about.html': 'about.html',
  '/pricing.html': 'pricing.html',
  '/login.html': 'login.html',
  '/contact.html': 'contact.html',
  '/signup.html': 'signup.html',
  '/forgot.html': 'forgot.html',
  '/app-login.html': 'app-login.html',
  '/hidden-in-sitemap.html': 'hidden-in-sitemap.html',
};

const PRODUCT_PATH = /^\/products\/\d+$/;

async function readPage(name: string, devServer: boolean): Promise<string> {
  const html = await readFile(new URL(name, PUBLIC_DIR), 'utf8');

  return devServer
    ? html.replace('</head>', '<script type="module" src="/@vite/client"></script></head>')
    : html;
}

function page(name: string): Handler {
  return async (_request, response, context) => {
    send(response, 200, 'text/html; charset=utf-8', await readPage(name, context.devServer));
  };
}

function empty(status: number): Handler {
  return (_request, response) => {
    response.statusCode = status;
    response.end();
  };
}

function plain(body: string): Handler {
  return (_request, response) => send(response, 200, 'text/plain; charset=utf-8', body);
}

/** Product pages share one template, so they are matched by pattern. */
export function productPage(method: string, path: string): Handler | undefined {
  return method === 'GET' && PRODUCT_PATH.test(path) ? page('product.html') : undefined;
}

/** The parts of the demo that do not belong to any one hooligan. */
export function sharedRoutes(): Record<string, Handler> {
  const routes: Record<string, Handler> = {};

  for (const [path, file] of Object.entries(PAGES)) routes[`GET ${path}`] = page(file);

  routes['GET /api/products'] = (_request, response) =>
    send(response, 200, 'application/json', JSON.stringify(PRODUCTS));
  routes['POST /api/track'] = empty(204);
  routes['POST /api/contact'] = empty(204);
  routes['POST /api/login'] = (_request, response) =>
    send(response, 401, 'application/json', JSON.stringify({ error: 'Wrong email or password' }));

  routes['GET /robots.txt'] = (_request, response, context) =>
    send(
      response,
      200,
      'text/plain; charset=utf-8',
      ['User-agent: *', 'Disallow: /admin/', 'Disallow: /delete', `Sitemap: ${context.origin()}/sitemap.xml`, ''].join('\n'),
    );

  routes['GET /sitemap.xml'] = (_request, response, context) => {
    const origin = context.origin();
    const paths = ['/', '/about.html', '/pricing.html', '/hidden-in-sitemap.html'];
    const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n');

    send(
      response,
      200,
      'application/xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
  };

  routes['GET /openapi.json'] = (_request, response) =>
    send(
      response,
      200,
      'application/json',
      JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Hooligans demo', version: '1.0.0' },
        paths: {
          '/api/products': { get: {} },
          '/api/login': { post: {} },
          '/api/contact': { post: {} },
        },
      }),
    );

  routes['GET /@vite/client'] = (_request, response, context) =>
    context.devServer
      ? send(response, 200, 'text/javascript; charset=utf-8', 'export {};\n')
      : send(response, 404, 'text/plain; charset=utf-8', 'Not found');

  // These must never be visited by the Scout: the tests count the hits.
  routes['GET /logout'] = plain('You should not be here: the Scout must not visit this.');
  routes['GET /delete'] = plain('You should not be here: the Scout must not visit this.');
  routes['GET /admin/secret-page'] = plain('You should not be here: robots.txt says to keep out.');

  return routes;
}
