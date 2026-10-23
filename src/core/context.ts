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
  /** How long The Mob takes to ramp up, in seconds. */
  loadSeconds: number;
};

/** The request a page sent when a made-up login was typed into its form and submitted. */
export type Submission = {
  method: string;
  url: string;
  contentType: string;
  /** What was sent. It holds only the made-up values that were typed. */
  body: string;
  /** What the app answered, or null when no answer was seen. */
  status: number | null;
};

export type CaptureValues = { identifier: string; password: string };

/** Types made-up values into the login form of a page, submits it once and reports what was sent. */
export type SubmitCapture = (page: string, values: CaptureValues) => Promise<Submission | null>;

/** Everything a hooligan is given. A first draft, refined as the hooligans arrive. */
export type HooliganContext = {
  runId: string;
  map: AppMap;
  http: HttpClient;
  caps: Caps;
  /** Third-party hosts the user confirmed are theirs, in lower case. */
  confirmedHosts: readonly string[];
  /** The user asked for routes that look like they have side effects to be included. */
  includeRisky: boolean;
  /** A browser that can submit a login form once. Only there when the scan has a browser. */
  capture?: SubmitCapture;
};
