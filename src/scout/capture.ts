import type { Locator, Page, Request as PageRequest } from 'playwright-core';
import type { CaptureValues, Submission } from '../core/context.js';
import type { BrowserGuard } from '../guardrails/egress/browser.js';
import { launchBrowser, type BrowserChoice } from './browser.js';
import { guardContext } from './guarded.js';

export type CaptureOptions = {
  guard: BrowserGuard;
  /** The page with the login form. */
  page: string;
  values: CaptureValues;
  signal?: AbortSignal;
  browser?: BrowserChoice;
};

const TOTAL_MS = 40_000;
const WRITES = new Set(['POST', 'PUT', 'PATCH']);
const KINDS = new Set(['fetch', 'xhr', 'document']);

function visible(selectors: readonly string[]): string {
  return selectors.map((selector) => `${selector}:visible`).join(', ');
}

const IDENTIFIER = visible([
  'input[type="email"]',
  'input[autocomplete="username"]',
  'input[name*="mail" i]',
  'input[name*="user" i]',
  'input[name*="login" i]',
  'input[id*="mail" i]',
  'input[id*="user" i]',
  'input[placeholder*="mail" i]',
  'input[placeholder*="user" i]',
  'input[type="text"]',
]);

const SUBMIT = visible(['button[type="submit"]', 'input[type="submit"]', 'button:not([type])']);

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(read: () => T | null, ms: number): Promise<T | null> {
  const until = Date.now() + ms;
  let value = read();

  while (value === null && Date.now() < until) {
    await pause(100);
    value = read();
  }

  return value;
}

async function submitOnce(page: Page, options: CaptureOptions): Promise<Submission | null> {
  await page.goto(options.page, { waitUntil: 'load', timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);

  const password = page.locator('input[type="password"]:visible').first();
  if ((await password.count()) === 0) return null;

  const form = password.locator('xpath=ancestor::form[1]');
  const inForm = (await form.count()) > 0;
  const find = (selector: string): Locator =>
    inForm ? form.locator(selector) : page.locator(selector);

  const identifier = find(IDENTIFIER).first();
  if ((await identifier.count()) === 0) return null;

  await identifier.fill(options.values.identifier, { timeout: 5_000 });
  await password.fill(options.values.password, { timeout: 5_000 });

  // Only a request sent after the click, and only one that carries the typed password, counts.
  const sent: { request: PageRequest | null } = { request: null };
  page.on('request', (request) => {
    const writes = WRITES.has(request.method()) && KINDS.has(request.resourceType());
    const typed = (request.postData() ?? '').includes(options.values.password);
    if (sent.request === null && writes && typed) sent.request = request;
  });

  const button = find(SUBMIT).first();
  if ((await button.count()) > 0) await button.click({ timeout: 5_000 });
  else await password.press('Enter');

  const request = await waitFor(() => sent.request, 6_000);
  if (!request) return null;

  const response = await Promise.race([
    request.response().catch(() => null),
    pause(6_000).then(() => null),
  ]);

  return {
    method: request.method(),
    url: request.url(),
    contentType: request.headers()['content-type'] ?? '',
    body: request.postData() ?? '',
    status: response ? response.status() : null,
  };
}

/**
 * Opens a page in a browser that follows the Scout's rules, types made-up values into its login
 * form, submits it once and reports the request that went out. Anything that goes wrong is null.
 */
export async function captureSubmission(options: CaptureOptions): Promise<Submission | null> {
  const launched = await launchBrowser(options.browser).catch(() => null);
  if (!launched) return null;

  const { browser } = launched;
  const stop = (): void => {
    void browser.close().catch(() => undefined);
  };
  options.signal?.addEventListener('abort', stop, { once: true });

  try {
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
    await guardContext(context, options.guard);

    context.on('response', (response) => {
      const size = Number(response.headers()['content-length']) || 0;
      options.guard.noteResponse(
        response.request().method(),
        response.url(),
        response.status(),
        size,
      );
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('dialog', (dialog) => {
      void dialog.dismiss();
    });
    context.on('page', (popup) => {
      if (popup !== page) void popup.close();
    });

    const work = submitOnce(page, options).catch(() => null);
    return await Promise.race([work, pause(TOTAL_MS).then(() => null)]);
  } catch {
    return null;
  } finally {
    options.signal?.removeEventListener('abort', stop);
    await browser.close().catch(() => undefined);
  }
}
