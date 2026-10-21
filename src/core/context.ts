import type { AppMap } from './app-map.js';

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export type HttpRequest = {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** Follow redirects (the default), or hand back the redirect response as it is. */
  redirect?: 'follow' | 'manual';
  timeoutMs?: number;
  /** A response bigger than this is cut off, and `truncated` says so. */
  maxBodyBytes?: number;
  signal?: AbortSignal;
};

export type HttpResponse = {
  status: number;
  /** Names are lower case. Several Set-Cookie headers are joined with a line break. */
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  truncated: boolean;
  /** Where the response came from, after any redirects. */
  url: string;
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

/** Everything a hooligan is given. A first draft, refined as the hooligans arrive. */
export type HooliganContext = {
  runId: string;
  map: AppMap;
  http: HttpClient;
  caps: Caps;
};
