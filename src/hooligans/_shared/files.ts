import type { HooliganContext } from '../../core/context.js';
import { probe } from './probe.js';

export const MAX_SCRIPTS = 25;
const MAX_PAGES = 10;
const PAGE_BYTES = 1024 * 1024;
const SCRIPT_BYTES = 3 * 1024 * 1024;

export type AppFile = { url: string; path: string; body: string };

export function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function sameOrigin(urls: readonly string[], origin: string): string[] {
  return [...new Set(urls)].filter((url) => parse(url)?.origin === origin);
}

export function pathOf(url: string): string {
  return parse(url)?.pathname ?? url;
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** The app's own files come before libraries, because a cap should never cut off the app. */
function appFirst(urls: readonly string[]): string[] {
  const library = (url: string): number => (url.includes('/node_modules/') ? 1 : 0);
  return [...urls].sort((a, b) => library(a) - library(b) || compareText(a, b));
}

/**
 * The scripts and pages the Scout saw on the app itself, read the way any visitor could read
 * them: at most 25 scripts and 10 pages, and `unread` says how many scripts were left out.
 */
export async function readAppFiles(
  context: HooliganContext,
): Promise<{ files: AppFile[]; unread: number; cutShort: boolean }> {
  const { map, http } = context;
  const origin = new URL(map.entry).origin;

  const scripts = appFirst(
    sameOrigin(
      map.assets.filter((asset) => asset.kind === 'script').map((asset) => asset.url),
      origin,
    ),
  );
  const pages = sameOrigin(
    map.pages.map((page) => page.url),
    origin,
  ).slice(0, MAX_PAGES);

  const targets = [
    ...scripts.slice(0, MAX_SCRIPTS).map((url) => ({ url, limit: SCRIPT_BYTES })),
    ...pages.map((url) => ({ url, limit: PAGE_BYTES })),
  ];

  const files: AppFile[] = [];
  let cutShort = false;

  for (const target of targets) {
    const response = await probe(http, target.url, { maxBodyBytes: target.limit });
    if (!response || response.status !== 200) continue;
    if (response.truncated) cutShort = true;

    files.push({ url: target.url, path: pathOf(target.url), body: response.body });
  }

  return { files, unread: Math.max(0, scripts.length - MAX_SCRIPTS), cutShort };
}
