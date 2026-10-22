import type { HttpClient, HttpRequest, HttpResponse } from '../../src/core/context.js';
import { EgressError } from '../../src/guardrails/egress/gate.js';

export type FakeReply = { status?: number; headers?: Record<string, string>; body?: string };
export type FakeRoute =
  | FakeReply
  | 'network-error'
  | ((request: HttpRequest) => FakeReply | EgressError);
export type FakeHttp = HttpClient & { requests: HttpRequest[] };

const NOT_FOUND: FakeReply = {
  status: 404,
  headers: { 'content-type': 'text/plain' },
  body: 'Not found',
};

/** Answers from a table of paths, so a hooligan can run without a server. Other paths get a 404. */
export function fakeHttp(routes: Record<string, FakeRoute> = {}): FakeHttp {
  const requests: HttpRequest[] = [];

  return {
    requests,
    request: async (request): Promise<HttpResponse> => {
      requests.push(request);

      const route = routes[new URL(request.url).pathname];
      if (route === 'network-error') throw new EgressError('network', 'No answer.');

      const reply = typeof route === 'function' ? route(request) : (route ?? NOT_FOUND);
      if (reply instanceof EgressError) throw reply;

      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(reply.headers ?? {})) {
        headers[name.toLowerCase()] = value;
      }

      return {
        status: reply.status ?? 200,
        headers,
        body: reply.body ?? '',
        durationMs: 1,
        truncated: false,
        url: request.url,
      };
    },
  };
}
