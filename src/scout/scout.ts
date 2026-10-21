import type { BrowserContextOptions, Response as PageResponse } from 'playwright-core';
import type {
  AppMap,
  AssetInfo,
  CallInfo,
  CookieInfo,
  FormInfo,
  Lead,
  PageInfo,
} from '../core/app-map.js';
import type { HttpClient } from '../core/context.js';
import { LIMITS } from '../guardrails/caps.js';
import type { BrowserGuard } from '../guardrails/egress/browser.js';
import { normalizeHostname, type Scope } from '../guardrails/egress/policy.js';
import { redactUrl } from '../util/redact.js';
import { launchBrowser, type BrowserChoice } from './browser.js';
import { classifyLink, normalizeUrl } from './crawl.js';
import {
  PAGE_SCRIPT,
  parseRawPage,
  sanitizeHeaders,
  toCallInfo,
  toFormInfo,
  type RawPage,
} from './extract.js';
import { fingerprint } from './fingerprint.js';
import { gatherLeads } from './leads.js';
import { assertReachable } from './reach.js';

export type ScoutLimits = { maxPages: number; maxDepth: number; maxSeconds: number };

export type ScoutOptions = {
  entry: URL;
  scope: Scope;
  /** Goes through the egress gate. Used for robots.txt, sitemaps and OpenAPI files. */
  http: HttpClient;
  /** Applies the browser rules to every request the page makes. */
  guard: BrowserGuard;
  limits?: ScoutLimits;
  browser?: BrowserChoice;
  /** A saved login from `hooligans login`. That command arrives in version 0.2. */
  storageState?: string;
  onPage?: (url: string) => void;
};

export type MapParts = {
  entry: string;
  scope: Scope;
  pages: readonly PageInfo[];
  forms: readonly FormInfo[];
  calls: readonly CallInfo[];
  assets: readonly AssetInfo[];
  cookies: readonly CookieInfo[];
  leads: readonly Lead[];
  urls: readonly string[];
  scripts: readonly string[];
  skipped: readonly string[];
};

type Collected = {
  calls: Map<string, CallInfo>;
  assets: Map<string, AssetInfo>;
  scripts: Map<string, string>;
  urls: Set<string>;
};

const MAX_CALLS = 200;
const MAX_SCRIPT_BYTES = 3 * 1024 * 1024;
const MAX_SKIPPED = 30;
const SOURCE_MAP_COMMENT = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m;

function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function unique<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(key(item))) seen.set(key(item), item);
  }
  return [...seen.values()];
}

/** Turns what the Scout saw into the map. Everything is sorted, so two runs diff cleanly. */
export function assembleMap(parts: MapParts): AppMap {
  const print = fingerprint({
    urls: parts.urls,
    headers: parts.pages.map((page) => page.headers),
    scripts: parts.scripts,
  });
  const appHosts = new Set(
    parts.scope.origins.map((origin) => normalizeHostname(new URL(origin).hostname)),
  );

  const externalHosts = new Set(print.backendHosts);
  for (const url of parts.urls) {
    try {
      const host = normalizeHostname(new URL(url).hostname);
      if (!appHosts.has(host)) externalHosts.add(host);
    } catch {
      continue;
    }
  }

  const pages = unique(parts.pages, (page) => page.url).sort((a, b) => compare(a.url, b.url));
  const forms = unique(parts.forms, (form) => `${form.page}|${form.action}|${form.method}`).sort(
    (a, b) => compare(`${a.page}|${a.action}|${a.method}`, `${b.page}|${b.action}|${b.method}`),
  );
  const calls = unique(parts.calls, (call) => `${call.method} ${call.url}`).sort((a, b) =>
    compare(`${a.url} ${a.method}`, `${b.url} ${b.method}`),
  );
  const assets = unique(parts.assets, (asset) => asset.url).sort((a, b) => compare(a.url, b.url));
  const cookies = unique(parts.cookies, (cookie) => cookie.name).sort((a, b) =>
    compare(a.name, b.name),
  );
  const leads = unique(parts.leads, (lead) => lead.url).sort((a, b) => compare(a.url, b.url));

  const skipped = [...new Set(parts.skipped)];
  const shown =
    skipped.length > MAX_SKIPPED
      ? [...skipped.slice(0, MAX_SKIPPED), `and ${skipped.length - MAX_SKIPPED} more`]
      : skipped;

  return {
    entry: parts.entry,
    mode: print.mode,
    stack: {
      ...(print.framework ? { framework: print.framework } : {}),
      backends: print.backends,
    },
    pages,
    forms,
    calls,
    assets,
    cookies,
    leads,
    externalHosts: [...externalHosts].sort(),
    coverage: { pages: pages.length, forms: forms.length, calls: calls.length, skipped: shown },
  };
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split('\n')[0] ?? '').slice(0, 120);
}

function addSourceMap(
  collected: Collected,
  scriptUrl: string,
  text: string,
  headers: Record<string, string>,
  scope: Scope,
): void {
  const fromHeader = headers['sourcemap'] ?? headers['x-sourcemap'];
  const fromComment = SOURCE_MAP_COMMENT.exec(text.slice(-500))?.[1];
  const reference = fromHeader ?? fromComment;
  if (!reference || reference.startsWith('data:')) return;

  try {
    const url = new URL(reference, scriptUrl);
    if (!scope.origins.includes(url.origin)) return;

    const shown = redactUrl(url.href);
    collected.assets.set(shown, { url: shown, kind: 'sourcemap' });
  } catch {
    return;
  }
}

/** Notes what one response tells us: a call, a script, a source map or a style sheet. */
async function collect(
  response: PageResponse,
  collected: Collected,
  scope: Scope,
  guard: BrowserGuard,
): Promise<void> {
  try {
    const request = response.request();
    const url = response.url();
    const status = response.status();
    const headers = response.headers();
    const size = Number(headers['content-length']) || 0;

    collected.urls.add(url);
    guard.noteResponse(request.method(), url, status, size);

    const type = request.resourceType();
    const shown = redactUrl(url);

    if (type === 'fetch' || type === 'xhr') {
      if (collected.calls.size >= MAX_CALLS) return;
      const call = toCallInfo(request.method(), url, status, await request.allHeaders());
      collected.calls.set(`${call.method} ${call.url}`, call);
    } else if (type === 'script') {
      collected.assets.set(shown, { url: shown, kind: 'script' });

      const sameOrigin = scope.origins.includes(new URL(url).origin);
      if (sameOrigin && size <= MAX_SCRIPT_BYTES) {
        const text = await response.text();
        if (text.length <= MAX_SCRIPT_BYTES) {
          collected.scripts.set(url, text);
          addSourceMap(collected, url, text, headers, scope);
        }
      }
    } else if (type === 'stylesheet') {
      collected.assets.set(shown, { url: shown, kind: 'other' });
    }
  } catch {
    return;
  }
}

/**
 * Maps the app with a real browser. It only reads: it follows links on the same origin, never
 * submits a form, never clicks a button and skips links that look destructive.
 */
export async function runScout(options: ScoutOptions): Promise<AppMap> {
  const limits = options.limits ?? LIMITS.scout;
  const { guard, scope } = options;

  const collected: Collected = {
    calls: new Map(),
    assets: new Map(),
    scripts: new Map(),
    urls: new Set(),
  };
  const pages: PageInfo[] = [];
  const forms: FormInfo[] = [];
  const skipped = new Set<string>();
  const pending = new Set<Promise<void>>();

  await assertReachable(options.http, options.entry);

  const { browser } = await launchBrowser(options.browser);

  try {
    const contextOptions: BrowserContextOptions = {
      acceptDownloads: false,
      serviceWorkers: 'block',
      ...(options.storageState ? { storageState: options.storageState } : {}),
    };
    const context = await browser.newContext(contextOptions);

    await context.route('**/*', async (route) => {
      const request = route.request();

      try {
        const decision = await guard.decide(new URL(request.url()));

        if (!decision.allowed) {
          guard.noteBlocked(request.method(), request.url(), decision.reason);
          await route.abort('blockedbyclient');
          return;
        }

        await route.continue();
      } catch {
        await route.abort('failed').catch(() => undefined);
      }
    });

    context.on('response', (response) => {
      const work = collect(response, collected, scope, guard);
      pending.add(work);
      void work.finally(() => pending.delete(work));
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('dialog', (dialog) => {
      void dialog.dismiss();
    });
    context.on('page', (popup) => {
      if (popup !== page) void popup.close();
    });

    const started = Date.now();
    const queued = new Set<string>([normalizeUrl(options.entry)]);
    const queue = [{ url: options.entry, depth: 0 }];

    while (queue.length > 0) {
      if (pages.length >= limits.maxPages) {
        skipped.add(`${queue.length} more page(s) were not visited because of the page limit`);
        break;
      }
      if (Date.now() - started >= limits.maxSeconds * 1000) {
        skipped.add('The time limit was reached before every page was visited');
        break;
      }

      const next = queue.shift();
      if (!next) break;
      options.onPage?.(next.url.href);

      let response: PageResponse | null;
      try {
        response = await page.goto(next.url.href, { waitUntil: 'load', timeout: 15_000 });
        await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);
      } catch (error) {
        skipped.add(`${next.url.pathname} (could not be loaded: ${reasonOf(error)})`);
        continue;
      }

      const finalUrl = page.url();
      const headers = sanitizeHeaders(response ? await response.allHeaders() : {});
      pages.push({ url: redactUrl(finalUrl), status: response?.status() ?? 0, headers });

      let found: RawPage;
      try {
        found = parseRawPage(await page.evaluate(PAGE_SCRIPT));
      } catch {
        found = { links: [], forms: [] };
      }

      for (const rawForm of found.forms) {
        const form = toFormInfo(rawForm, finalUrl);
        if (form) forms.push(form);
      }

      for (const link of found.links) {
        const verdict = classifyLink(link, scope);

        if (verdict.kind === 'skip') {
          skipped.add(verdict.reason);
          continue;
        }
        if (verdict.kind !== 'visit') continue;

        const key = normalizeUrl(verdict.url);
        if (queued.has(key)) continue;

        if (next.depth + 1 > limits.maxDepth) {
          skipped.add(
            `Links more than ${limits.maxDepth} steps from the first page were not followed`,
          );
          continue;
        }

        queued.add(key);
        queue.push({ url: verdict.url, depth: next.depth + 1 });
      }
    }

    await Promise.allSettled([...pending]);

    const cookies = (await context.cookies()).map((cookie): CookieInfo => ({
      name: cookie.name,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
    }));

    const leads = await gatherLeads(options.http, scope.origins[0] ?? options.entry.origin);

    return assembleMap({
      entry: options.entry.href,
      scope,
      pages,
      forms,
      calls: [...collected.calls.values()],
      assets: [...collected.assets.values()],
      cookies,
      leads,
      urls: [...collected.urls],
      scripts: [...collected.scripts.values()],
      skipped: [...skipped],
    });
  } finally {
    await browser.close();
  }
}
