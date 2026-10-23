import type { AppMap } from '../../core/app-map.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../../core/context.js';
import { CircuitBreaker } from '../../guardrails/caps.js';
import { EgressError } from '../../guardrails/egress/gate.js';
import type { FieldKind } from '../../payloads/clumsy.js';
import { looksDestructive } from '../../scout/crawl.js';
import { isRiskyRoute } from '../../scout/extract.js';
import { parse } from './files.js';
import { joinWords } from './finding.js';

export type FuzzField = { name: string; type: string };

export type FuzzTarget = {
  method: 'GET' | 'POST';
  /** The address without a query string. A GET puts the fields in the query. */
  url: string;
  path: string;
  /** The page the form is on. It is sent as the Referer, the way a browser would. */
  page: string;
  fields: FuzzField[];
};

/** What was left alone, so the report can say so. */
export type LeftOut = { logins: number; risky: number; calls: number };

export type Override = { name: string; value: string };

const TEXT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'textarea']);
const NUMBER_TYPES = new Set(['number', 'range']);
const MANAGED_PATH = /^\/(?:rest|auth|storage|functions)\/v1\/|^\/_next\/|^\/@|^\/node_modules\//;
const SENSITIVE_PARAM =
  /^(?:token|key|apikey|api_key|code|sig|signature|session|auth|password|secret)$/i;
const PLAIN_NAME = /^[A-Za-z0-9_.-]{1,40}$/;

const MAX_TARGETS = 8;
const MAX_FIELDS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 256 * 1024;

export function isFuzzable(field: FuzzField): boolean {
  return TEXT_TYPES.has(field.type) || NUMBER_TYPES.has(field.type);
}

export function kindOf(field: FuzzField): FieldKind {
  return NUMBER_TYPES.has(field.type) ? 'number' : 'text';
}

function formMethod(raw: string): 'GET' | 'POST' | null {
  const method = raw.toUpperCase();
  return method === 'GET' || method === 'POST' ? method : null;
}

function isPlainParam(name: string): boolean {
  return PLAIN_NAME.test(name) && !SENSITIVE_PARAM.test(name);
}

/**
 * The forms and search fields on the app itself that are safe to type into. Login and signup
 * forms, file uploads, routes that look like they have side effects and anything on another
 * origin are left alone.
 */
export function findTargets(
  map: AppMap,
  includeRisky: boolean,
): { targets: FuzzTarget[]; left: LeftOut } {
  const origin = new URL(map.entry).origin;
  const found = new Map<string, FuzzTarget>();
  const heldBack = new Set<string>();
  const calls = new Set<string>();
  let logins = 0;

  const add = (target: FuzzTarget): void => {
    const key = `${target.method} ${target.path}`;
    if (!found.has(key)) found.set(key, target);
  };

  const held = (url: URL): boolean => {
    const hold = looksDestructive(url, '') || (isRiskyRoute(url.pathname) && !includeRisky);
    if (hold) heldBack.add(url.pathname);
    return hold;
  };

  for (const form of map.forms) {
    const action = parse(form.action);
    const method = formMethod(form.method);
    if (!action || !method) continue;
    if (action.origin !== origin || MANAGED_PATH.test(action.pathname)) continue;

    if (form.fields.some((field) => field.type === 'password')) {
      logins += 1;
      continue;
    }
    if (form.fields.some((field) => field.type === 'file') || held(action)) continue;

    const fields = form.fields.filter(isFuzzable).slice(0, MAX_FIELDS);
    if (fields.length === 0) continue;

    add({
      method,
      url: `${origin}${action.pathname}`,
      path: action.pathname,
      page: form.page,
      fields,
    });
  }

  const addresses = [
    ...map.pages.map((page) => page.url),
    ...map.calls.filter((call) => call.method === 'GET').map((call) => call.url),
  ];

  for (const address of addresses) {
    const url = parse(address);
    if (!url || url.origin !== origin || MANAGED_PATH.test(url.pathname)) continue;

    const names = [...new Set(url.searchParams.keys())].filter(isPlainParam).slice(0, MAX_FIELDS);
    if (names.length === 0 || held(url)) continue;

    add({
      method: 'GET',
      url: `${origin}${url.pathname}`,
      path: url.pathname,
      page: url.href,
      fields: names.map((name) => ({ name, type: 'text' })),
    });
  }

  for (const call of map.calls) {
    if (call.method !== 'POST' && call.method !== 'PUT' && call.method !== 'PATCH') continue;

    const url = parse(call.url);
    if (url && url.origin === origin && !MANAGED_PATH.test(url.pathname)) calls.add(url.pathname);
  }

  return {
    targets: [...found.values()].slice(0, MAX_TARGETS),
    left: { logins, risky: heldBack.size, calls: calls.size },
  };
}

/** One plain sentence about what a hooligan left alone, or null when it left nothing out. */
export function describeLeft(who: string, left: LeftOut): string | null {
  const parts: string[] = [];

  if (left.logins > 0) {
    const forms =
      left.logins === 1 ? 'a login or signup form' : `${left.logins} login or signup forms`;
    parts.push(`${forms} (Brute looks at those)`);
  }
  if (left.risky > 0) {
    const routes = left.risky === 1 ? 'a route' : `${left.risky} routes`;
    parts.push(`${routes} whose name suggests side effects (use --include-risky to include them)`);
  }
  if (left.calls > 0) {
    const calls = left.calls === 1 ? 'a call' : `${left.calls} calls`;
    parts.push(
      `${calls} the page makes with a JSON body, because their fields are not visible yet`,
    );
  }

  return parts.length === 0 ? null : `${who} did not type into ${joinWords(parts)}.`;
}

/** An ordinary value for a field, so the other fields of a form are filled in while one is tested. */
export function benignValue(field: FuzzField, marker: string): string {
  switch (field.type) {
    case 'email':
      return `${marker}@hooligans.invalid`;
    case 'number':
    case 'range':
      return '1';
    case 'tel':
      return '0000000000';
    case 'url':
      return `https://hooligans.invalid/${marker}`;
    default:
      return marker;
  }
}

/** The request a browser would send for this form, with one field optionally replaced. */
export function buildRequest(target: FuzzTarget, marker: string, override?: Override): HttpRequest {
  const entries = target.fields.map((field): [string, string] => [
    field.name,
    override !== undefined && override.name === field.name
      ? override.value
      : benignValue(field, marker),
  ]);

  if (target.method === 'GET') {
    const url = new URL(target.url);
    for (const [name, value] of entries) url.searchParams.set(name, value);

    return {
      method: 'GET',
      url: url.href,
      redirect: 'manual',
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBodyBytes: MAX_BODY_BYTES,
    };
  }

  return {
    method: 'POST',
    url: target.url,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: new URL(target.url).origin,
      referer: target.page,
    },
    body: new URLSearchParams(entries).toString(),
    redirect: 'manual',
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxBodyBytes: MAX_BODY_BYTES,
  };
}

export type Attempt =
  | { kind: 'answer'; response: HttpResponse }
  | { kind: 'hang' }
  | { kind: 'down' }
  | { kind: 'failed' };

/**
 * One request, and what became of it. Running out of budget, or being stopped, is passed on so
 * the whole scan stops too. Anything else is an outcome the hooligan can weigh.
 */
export async function attempt(http: HttpClient, request: HttpRequest): Promise<Attempt> {
  try {
    return { kind: 'answer', response: await http.request(request) };
  } catch (error) {
    if (error instanceof EgressError) {
      if (error.kind === 'budget' || error.kind === 'aborted') throw error;
      if (error.kind === 'timeout') return { kind: 'hang' };
      if (error.kind === 'network') return { kind: 'down' };
    }
    return { kind: 'failed' };
  }
}

/** A cap on requests, and a stop when the app keeps failing, so nothing hammers a dying app. */
export class FuzzBudget {
  private left: number;
  private readonly breaker = new CircuitBreaker(5);

  constructor(requests: number) {
    this.left = requests;
  }

  /** True when there is budget for one more request, and takes it. */
  take(): boolean {
    if (this.stopped) return false;

    this.left -= 1;
    return true;
  }

  record(ok: boolean): void {
    this.breaker.record(ok);
  }

  get exhausted(): boolean {
    return this.left <= 0;
  }

  get broken(): boolean {
    return this.breaker.isOpen;
  }

  get stopped(): boolean {
    return this.exhausted || this.broken;
  }
}
