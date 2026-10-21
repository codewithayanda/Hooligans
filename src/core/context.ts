import type { AppMap } from './app-map.js';

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export type HttpRequest = {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
};

/** The only way a hooligan reaches the network. The egress gate implements it. */
export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse>;
}

export type Caps = {
  maxRequestsPerSecond: number;
  maxUsers: number;
  maxAttemptsPerMinute: number;
};

/** Everything a hooligan is given. A first draft, refined when the gate is built. */
export type HooliganContext = {
  runId: string;
  map: AppMap;
  http: HttpClient;
  caps: Caps;
};
