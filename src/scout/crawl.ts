import type { Scope } from '../guardrails/egress/policy.js';

export type Link = { href: string; text: string; download: boolean };

export type LinkVerdict =
  { kind: 'visit'; url: URL } | { kind: 'skip'; reason: string } | { kind: 'ignore' };

const DESTRUCTIVE =
  /(?:^|[^a-z])(?:log[-_ ]?out|sign[-_ ]?out|delete|remove|destroy|unsubscribe|deactivate|disable|revoke|purge|clear)(?:[^a-z]|$)/i;

const STATIC_FILE =
  /\.(?:pdf|zip|gz|tar|png|jpe?g|gif|svg|webp|ico|mp4|webm|mp3|woff2?|ttf|otf|css|js|mjs|map|json|xml|txt|csv)$/i;

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The page without its fragment, so /a and /a#top count as one page. */
export function normalizeUrl(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}`;
}

/** A link that could do something when it is followed, judged by its address and its words. */
export function looksDestructive(url: URL, text: string): boolean {
  return DESTRUCTIVE.test(`${decode(url.pathname)} ${decode(url.search)} ${text}`);
}

/** Decides what the Scout does with one link: visit it, say why it skipped it, or ignore it. */
export function classifyLink(link: Link, scope: Scope): LinkVerdict {
  let url: URL;
  try {
    url = new URL(link.href);
  } catch {
    return { kind: 'ignore' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'ignore' };
  if (link.download) return { kind: 'skip', reason: `${url.pathname} (a download link)` };
  if (!scope.origins.includes(url.origin)) {
    return { kind: 'skip', reason: `${url.origin} (another site, not followed)` };
  }
  if (STATIC_FILE.test(url.pathname)) return { kind: 'ignore' };
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return { kind: 'skip', reason: `${url.pathname} (an API route, not a page)` };
  }
  if (looksDestructive(url, link.text)) {
    return { kind: 'skip', reason: `${url.pathname} (looks destructive)` };
  }

  return { kind: 'visit', url };
}
