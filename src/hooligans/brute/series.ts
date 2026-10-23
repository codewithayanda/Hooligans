import type { HttpClient, HttpRequest, HttpResponse } from '../../core/context.js';
import { EgressError } from '../../guardrails/egress/gate.js';
import { detectPushback, type Reply } from './pushback.js';
import type { Kind, Target } from './targets.js';
import { renderBody } from './template.js';
import type { Maker, Values } from './values.js';

export type Series =
  | { kind: 'open'; attempts: number; seconds: number; statuses: number[] }
  | { kind: 'pushed-back'; at: number; why: string }
  | { kind: 'untestable'; why: string }
  | { kind: 'failing'; why: string };

export type SeriesInput = {
  http: HttpClient;
  target: Target;
  /** How many wrong attempts to make at most. */
  count: number;
  values: Maker;
  now?: () => number;
};

const WHAT: Readonly<Record<Kind, string>> = {
  login: 'login',
  signup: 'signup',
  reset: 'password reset',
};

const NEEDS_TOKEN =
  /csrf|xsrf|forgery|verification token|invalid token|token (?:is )?(?:missing|required)/;

function attemptRequest(target: Target, values: Values): HttpRequest {
  const { contentType, text } = renderBody(target.body, values);

  return {
    method: 'POST',
    url: target.url,
    headers: {
      'content-type': contentType,
      accept: 'application/json, text/html;q=0.9, */*;q=0.8',
      origin: new URL(target.url).origin,
      referer: target.page,
    },
    body: text,
    redirect: 'manual',
    timeoutMs: 10_000,
    maxBodyBytes: 16 * 1024,
  };
}

function describe(response: HttpResponse, ms: number): Reply {
  return {
    status: response.status,
    ms,
    location: (response.headers['location'] ?? '').toLowerCase(),
    retryAfter: response.headers['retry-after'] !== undefined,
    text: response.body.slice(0, 2_000).toLowerCase(),
  };
}

/** Why the first answer says nothing about limits: the request never got as far as the password. */
function untestable(reply: Reply, target: Target): string | null {
  const { status } = reply;

  if (status === 404 || status === 405 || status === 410 || status === 501) {
    return `answered ${status}, so it does not look like a working ${WHAT[target.kind]} route`;
  }
  if (status === 403 || status === 419) {
    return `answered ${status} to the first request, which usually means it needs a token only a browser has`;
  }
  if ((status === 400 || status === 422) && NEEDS_TOKEN.test(reply.text)) {
    return 'asked for a security token that only a browser has';
  }
  if (status >= 500) return `answered ${status} to the first request`;
  if (target.browserStatus !== null && status !== target.browserStatus) {
    return `answered ${status} where a browser got ${target.browserStatus}, so the request could not be repeated faithfully`;
  }
  return null;
}

/**
 * Wrong attempts with made-up people, one after another, until the app pushes back, the app
 * starts failing or the count is reached. The pace is set by the client that sends them.
 */
export async function runSeries(input: SeriesInput): Promise<Series> {
  const now = input.now ?? Date.now;
  const started = now();
  const replies: Reply[] = [];
  let failures = 0;

  for (let n = 1; n <= input.count; n += 1) {
    const sent = now();
    let response: HttpResponse;

    try {
      response = await input.http.request(attemptRequest(input.target, input.values(n)));
    } catch (error) {
      if (error instanceof EgressError && (error.kind === 'budget' || error.kind === 'aborted')) {
        throw error;
      }

      failures += 1;
      if (failures >= 3) return { kind: 'failing', why: 'the app stopped answering' };
      continue;
    }

    failures = 0;
    const reply = describe(response, now() - sent);
    replies.push(reply);

    const pushback = detectPushback(replies);
    if (pushback) return { kind: 'pushed-back', ...pushback };

    const reason = replies.length === 1 ? untestable(reply, input.target) : null;
    if (reason) return { kind: 'untestable', why: reason };
  }

  if (replies.length === 0) return { kind: 'failing', why: 'the app did not answer' };

  return {
    kind: 'open',
    attempts: replies.length,
    seconds: Math.max(1, Math.round((now() - started) / 1000)),
    statuses: [...new Set(replies.map((reply) => reply.status))].sort((a, b) => a - b),
  };
}
