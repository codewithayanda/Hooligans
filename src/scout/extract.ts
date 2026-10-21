import type { AppMap, CallInfo, FormInfo } from '../core/app-map.js';
import { redactSecrets, redactUrl } from '../util/redact.js';
import { cleanText } from '../util/text.js';

export type RawLink = { href: string; text: string; download: boolean };
export type RawForm = {
  action: string;
  method: string;
  fields: { name: string; type: string }[];
};
export type RawPage = { links: RawLink[]; forms: RawForm[] };

/** Runs inside the page. It only reads: it never clicks, types or submits. */
export const PAGE_SCRIPT = `(() => {
  const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
    href: a.href,
    text: (a.textContent || '').trim().slice(0, 80),
    download: a.hasAttribute('download'),
  }));
  const forms = Array.from(document.forms).map((form) => ({
    action: form.action,
    method: (form.getAttribute('method') || 'get').toUpperCase(),
    fields: Array.from(form.elements)
      .filter((element) => element.name)
      .map((element) => ({
        name: element.name,
        type: element.type || element.tagName.toLowerCase(),
      })),
  }));
  return { links, forms };
})()`;

const MAX_LINKS = 500;
const MAX_FORMS = 50;
const MAX_FIELDS = 100;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** The page is not trusted, so whatever its script returned is checked and capped. */
export function parseRawPage(value: unknown): RawPage {
  const page = record(value);

  const links = list(page.links)
    .slice(0, MAX_LINKS)
    .map((item) => {
      const link = record(item);
      return {
        href: text(link.href, 2048),
        text: text(link.text, 80),
        download: link.download === true,
      };
    });

  const forms = list(page.forms)
    .slice(0, MAX_FORMS)
    .map((item) => {
      const form = record(item);
      const fields = list(form.fields)
        .slice(0, MAX_FIELDS)
        .map((field) => {
          const entry = record(field);
          return { name: text(entry.name, 100), type: text(entry.type, 30) };
        })
        .filter((field) => field.name !== '');

      return { action: text(form.action, 2048), method: text(form.method, 10), fields };
    });

  return { links, forms };
}

export function toFormInfo(raw: RawForm, pageUrl: string): FormInfo | null {
  let action: URL;
  try {
    action = new URL(raw.action || pageUrl, pageUrl);
  } catch {
    return null;
  }
  if (action.protocol !== 'http:' && action.protocol !== 'https:') return null;

  const seen = new Set<string>();
  const fields: FormInfo['fields'] = [];
  for (const field of raw.fields) {
    const key = `${field.name}|${field.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ name: field.name, type: field.type || 'text' });
  }

  return {
    page: redactUrl(pageUrl),
    action: redactUrl(action.href),
    method: (raw.method || 'GET').toUpperCase(),
    fields,
  };
}

const AUTH_HEADERS = new Set(['authorization', 'cookie', 'apikey', 'x-api-key']);

export function toCallInfo(
  method: string,
  url: string,
  status: number,
  requestHeaders: Record<string, string>,
): CallInfo {
  const sentAuth = Object.keys(requestHeaders).some((name) => AUTH_HEADERS.has(name.toLowerCase()));

  return { method: method.toUpperCase(), url: redactUrl(url), status, sentAuth };
}

/** Keeps the name and the attributes of a cookie and hides its value. */
export function maskSetCookie(line: string): string {
  const [pair = '', ...attributes] = line.split(';');
  const name = pair.split('=')[0]?.trim() ?? '';

  return [`${name}=[hidden]`, ...attributes.map((attribute) => attribute.trim())].join('; ');
}

const HIDDEN_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie']);

/** Response headers for the map: lower case, cleaned, cookie values and credentials removed. */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (HIDDEN_HEADERS.has(name)) continue;

    const value =
      name === 'set-cookie' ? rawValue.split('\n').map(maskSetCookie).join('\n') : rawValue;
    result[name] = redactSecrets(cleanText(value, 2000));
  }

  return result;
}

const RISKY_WORDS = new Set([
  'checkout',
  'pay',
  'payment',
  'charge',
  'purchase',
  'send',
  'email',
  'sms',
  'invite',
  'generate',
  'completion',
  'chat',
  'webhook',
]);

/** Routes whose names suggest side effects: money, messages, paid AI calls. */
export function isRiskyRoute(path: string): boolean {
  const words = path
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);

  return words.some((word) => RISKY_WORDS.has(word));
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** The risky routes the map knows about. Stages 2 to 4 skip these unless the user opts in. */
export function riskyRoutes(map: AppMap): string[] {
  const paths = [...map.calls.map((call) => call.url), ...map.forms.map((form) => form.action)];

  return [...new Set(paths.map(pathOf).filter(isRiskyRoute))].sort();
}
