import { promises as dns } from 'node:dns';
import {
  Agent as HttpAgent,
  request as httpRequest,
  type IncomingHttpHeaders,
  type RequestOptions,
} from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import type { HttpClient, HttpRequest, HttpResponse } from '../../core/context.js';
import { createRateLimiter, LIMITS, type RateLimiter } from '../caps.js';
import { decideAddress, decideRequest, normalizeHostname, type Scope } from './policy.js';
import type { LogEntry, RequestLog } from './request-log.js';

export type EgressErrorKind = 'blocked' | 'budget' | 'timeout' | 'network' | 'aborted';

export class EgressError extends Error {
  readonly kind: EgressErrorKind;

  constructor(kind: EgressErrorKind, message: string) {
    super(message);
    this.name = 'EgressError';
    this.kind = kind;
  }
}

export type Resolved = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<Resolved[]>;

const resolveWithDns: Resolver = async (hostname) => {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family }));
};

export type GateOptions = {
  scope: Scope;
  log: RequestLog;
  userAgent?: string;
  /** Looks up a hostname. Tests replace it so no real DNS is needed. */
  resolve?: Resolver;
  maxTotalRequests?: number;
  maxConcurrent?: number;
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
};

export type ClientOptions = {
  /** Spaces this client's requests evenly. */
  requestsPerSecond?: number;
  /** Logs this client's requests as counts per second, for load traffic. */
  aggregateLog?: boolean;
};

export type GateStats = { sent: number; blocked: number; writes: number };

type Raw = { status: number; headers: Record<string, string>; body: Buffer; truncated: boolean };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

const TLS_PROBLEMS = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function unbracket(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function lowerCaseKeys(headers: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) result[name.toLowerCase()] = value;
  return result;
}

function flatten(raw: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const key = name.toLowerCase();
    result[key] = Array.isArray(value) ? value.join(key === 'set-cookie' ? '\n' : ', ') : value;
  }

  return result;
}

/** Turns the body into text, undoing compression within the size limit. */
function decode(body: Buffer, encoding: string | undefined, limit: number): { text: string; truncated: boolean } {
  const name = (encoding ?? '').toLowerCase().trim();

  try {
    if (name === 'gzip') return { text: gunzipSync(body, { maxOutputLength: limit }).toString('utf8'), truncated: false };
    if (name === 'deflate') return { text: inflateSync(body, { maxOutputLength: limit }).toString('utf8'), truncated: false };
    if (name === 'br') return { text: brotliDecompressSync(body, { maxOutputLength: limit }).toString('utf8'), truncated: false };
  } catch {
    return { text: '', truncated: true };
  }

  return { text: body.toString('utf8'), truncated: false };
}

function describeError(error: unknown, url: URL): EgressError {
  if (error instanceof EgressError) return error;

  const code = (error as NodeJS.ErrnoException | null)?.code;
  const name = (error as Error | null)?.name;

  if (name === 'AbortError' || code === 'ABORT_ERR') {
    return new EgressError('aborted', 'The request was cancelled.');
  }
  if (code === 'ECONNREFUSED') {
    return new EgressError('network', `Nothing is listening at ${url.host}. Is the app running?`);
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new EgressError('network', `${url.hostname} could not be found.`);
  }
  if (code === 'ECONNRESET') {
    return new EgressError('network', `${url.host} closed the connection.`);
  }
  if (code && TLS_PROBLEMS.has(code)) {
    return new EgressError(
      'network',
      'The certificate is not trusted. Use http:// for a local dev server, or trust the certificate.',
    );
  }

  return new EgressError('network', error instanceof Error ? error.message : String(error));
}

/**
 * The one door. Every request Hooligans sends goes through here: the address is checked,
 * the connection goes to the address that was checked, every redirect is checked again,
 * and every request is logged.
 */
export class EgressGate {
  private readonly scope: Scope;
  private readonly log: RequestLog;
  private readonly resolve: Resolver;
  private readonly userAgent: string;
  private readonly maxTotalRequests: number;
  private readonly timeoutMs: number;
  private readonly maxBodyBytes: number;
  private readonly maxRedirects: number;
  private readonly httpAgent: HttpAgent;
  private readonly httpsAgent: HttpsAgent;
  private readonly abort = new AbortController();
  private readonly lookup: LookupFunction;
  private sent = 0;
  private blocked = 0;
  private writes = 0;
  private closed = false;

  constructor(options: GateOptions) {
    this.scope = options.scope;
    this.log = options.log;
    this.resolve = options.resolve ?? resolveWithDns;
    this.userAgent = options.userAgent ?? 'Hooligans';
    this.maxTotalRequests = options.maxTotalRequests ?? LIMITS.scan.maxRequests;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxBodyBytes = options.maxBodyBytes ?? 5 * 1024 * 1024;
    this.maxRedirects = options.maxRedirects ?? 5;

    const maxSockets = options.maxConcurrent ?? LIMITS.mob.ceilingUsers;
    this.httpAgent = new HttpAgent({ keepAlive: true, maxSockets });
    this.httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets });
    this.lookup = this.buildLookup();
  }

  /** A client that labels its requests with the hooligan that sends them. */
  client(hooligan: string, options: ClientOptions = {}): HttpClient {
    const limiter =
      options.requestsPerSecond !== undefined ? createRateLimiter(options.requestsPerSecond) : undefined;
    const aggregate = options.aggregateLog === true;

    return { request: (request) => this.execute(hooligan, request, limiter, aggregate) };
  }

  stats(): GateStats {
    return { sent: this.sent, blocked: this.blocked, writes: this.writes };
  }

  /** Cancels anything in flight, closes connections and flushes the log. Safe to call twice. */
  close(): void {
    if (this.closed) return;

    this.closed = true;
    this.abort.abort();
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    this.log.close();
  }

  private async execute(
    hooligan: string,
    request: HttpRequest,
    limiter: RateLimiter | undefined,
    aggregate: boolean,
  ): Promise<HttpResponse> {
    if (this.closed) throw new EgressError('aborted', 'The gate is closed.');

    const follow = (request.redirect ?? 'follow') === 'follow';
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    const maxBytes = request.maxBodyBytes ?? this.maxBodyBytes;
    const signal = request.signal
      ? AbortSignal.any([request.signal, this.abort.signal])
      : this.abort.signal;
    const started = Date.now();
    const method: string = request.method;

    let url = this.parseUrl(hooligan, request.url, method, 0, '');

    for (let hop = 0; ; hop += 1) {
      const prefix = hop > 0 ? `Redirect to ${url.href} refused: ` : '';
      this.screen(hooligan, url, method, hop, prefix);

      if (this.sent >= this.maxTotalRequests) {
        throw new EgressError('budget', 'The request budget for this scan is used up.');
      }
      if (limiter) await limiter.take();

      this.sent += 1;
      if (!READS.has(method)) this.writes += 1;

      const hopStarted = Date.now();
      let raw: Raw;

      try {
        raw = await this.perform(url, method, request, maxBytes, timeoutMs, signal);
      } catch (error) {
        const failure = describeError(error, url);
        const decision = failure.kind === 'blocked' ? 'blocked' : 'failed';
        if (failure.kind === 'blocked') this.blocked += 1;

        this.note(
          { hooligan, method, url: url.href, status: null, bytes: 0, ms: Date.now() - hopStarted, decision, hop, reason: failure.message },
          false,
        );
        throw failure;
      }

      this.note(
        { hooligan, method, url: url.href, status: raw.status, bytes: raw.body.length, ms: Date.now() - hopStarted, decision: 'allowed', hop },
        aggregate,
      );

      const location = raw.headers['location'];
      const canFollow = follow && (method === 'GET' || method === 'HEAD');

      if (canFollow && REDIRECTS.has(raw.status) && location) {
        if (hop >= this.maxRedirects) throw new EgressError('network', 'Too many redirects.');
        url = this.parseUrl(hooligan, location, method, hop + 1, 'Redirect refused: ', url);
        continue;
      }

      const { text, truncated } = decode(raw.body, raw.headers['content-encoding'], maxBytes);

      return {
        status: raw.status,
        headers: raw.headers,
        body: text,
        durationMs: Date.now() - started,
        truncated: raw.truncated || truncated,
        url: url.href,
      };
    }
  }

  private parseUrl(
    hooligan: string,
    value: string,
    method: string,
    hop: number,
    prefix: string,
    base?: URL,
  ): URL {
    try {
      return new URL(value, base);
    } catch {
      throw this.refuse(hooligan, method, value, hop, `${prefix}That is not a valid URL.`);
    }
  }

  /** The scope check, plus a direct check when the host is already an IP address. */
  private screen(hooligan: string, url: URL, method: string, hop: number, prefix: string): void {
    const decision = decideRequest(url, method, this.scope);
    if (!decision.allowed) throw this.refuse(hooligan, method, url.href, hop, `${prefix}${decision.reason}`);

    const host = normalizeHostname(url.hostname);
    if (isIP(host) !== 0) {
      const address = decideAddress(host, host, this.scope);
      if (!address.allowed) throw this.refuse(hooligan, method, url.href, hop, `${prefix}${address.reason}`);
    }
  }

  /** Logs a refused request and returns the error to throw. */
  private refuse(hooligan: string, method: string, url: string, hop: number, reason: string): EgressError {
    this.blocked += 1;
    this.note({ hooligan, method, url, status: null, bytes: 0, ms: 0, decision: 'blocked', hop, reason }, false);
    return new EgressError('blocked', reason);
  }

  private note(entry: Omit<LogEntry, 'ts'>, aggregate: boolean): void {
    const full: LogEntry = { ts: new Date().toISOString(), ...entry };

    if (aggregate && entry.decision === 'allowed') this.log.writeAggregated(full);
    else this.log.write(full);
  }

  /** Resolves the name, keeps only the addresses the policy approves, and connects to those. */
  private buildLookup(): LookupFunction {
    return (hostname, options, callback) => {
      this.resolve(hostname).then(
        (records) => {
          const allowed = records.filter(
            (record) => decideAddress(hostname, record.address, this.scope).allowed,
          );
          const first = allowed[0];

          if (!first) {
            const sample = records[0];
            const verdict = sample ? decideAddress(hostname, sample.address, this.scope) : undefined;
            const reason = verdict && !verdict.allowed ? verdict.reason : `${hostname} did not resolve.`;
            callback(new EgressError('blocked', reason), '', 0);
            return;
          }

          if (options.all) {
            callback(null, allowed.map((record) => ({ address: record.address, family: record.family })));
          } else {
            callback(null, first.address, first.family);
          }
        },
        (error: unknown) => callback(error as NodeJS.ErrnoException, '', 0),
      );
    };
  }

  private perform(
    url: URL,
    method: string,
    request: HttpRequest,
    maxBytes: number,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<Raw> {
    return new Promise<Raw>((resolve, reject) => {
      const secure = url.protocol === 'https:';
      const body = request.body;
      const headers: Record<string, string> = {
        'user-agent': this.userAgent,
        accept: '*/*',
        'accept-encoding': 'identity',
        ...lowerCaseKeys(request.headers),
      };
      if (body !== undefined && headers['content-length'] === undefined) {
        headers['content-length'] = String(Buffer.byteLength(body));
      }

      const options: RequestOptions = {
        hostname: unbracket(url.hostname),
        port: url.port ? Number(url.port) : secure ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        agent: secure ? this.httpsAgent : this.httpAgent,
        lookup: this.lookup,
        signal,
      };

      const send = (secure ? httpsRequest : httpRequest) as typeof httpRequest;
      const outgoing = send(options, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        let settled = false;

        const finish = (): void => {
          if (settled) return;
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            headers: flatten(response.headers),
            body: Buffer.concat(chunks),
            truncated: truncated || !response.complete,
          });
        };

        response.on('data', (chunk: Buffer) => {
          if (truncated) return;

          size += chunk.length;
          if (size > maxBytes) {
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
            truncated = true;
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', finish);
        response.on('close', finish);
        response.on('error', (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
      });

      outgoing.setTimeout(timeoutMs, () => {
        outgoing.destroy(new EgressError('timeout', `No answer from ${url.host} within ${timeoutMs} ms.`));
      });
      outgoing.on('error', reject);

      if (body !== undefined) outgoing.write(body);
      outgoing.end();
    });
  }
}
