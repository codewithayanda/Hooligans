import { resolveWithDns, type Resolver } from './gate.js';
import {
  classifyAddress,
  decideBrowserRequest,
  normalizeHostname,
  type Decision,
  type Scope,
} from './policy.js';
import type { LogEntry, RequestLog } from './request-log.js';

export type BrowserGuardOptions = {
  scope: Scope;
  log: RequestLog;
  /** Looks up a hostname. Tests replace it so no real DNS is needed. */
  resolve?: Resolver;
};

/**
 * The rules for the Scout's browser. The policy decides by the address as written, and for a
 * name it also looks up where the name points, once per name, and refuses internal answers.
 */
export class BrowserGuard {
  private readonly scope: Scope;
  private readonly log: RequestLog;
  private readonly resolve: Resolver;
  private readonly names = new Map<string, Promise<Decision>>();
  private allowed = 0;
  private blocked = 0;

  constructor(options: BrowserGuardOptions) {
    this.scope = options.scope;
    this.log = options.log;
    this.resolve = options.resolve ?? resolveWithDns;
  }

  async decide(url: URL): Promise<Decision> {
    const lexical = decideBrowserRequest(url, this.scope);
    if (!lexical.allowed) return lexical;

    const host = normalizeHostname(url.hostname);
    const isName = classifyAddress(host) === 'invalid';
    const isLocal = host === 'localhost' || host.endsWith('.localhost');
    if (!isName || isLocal) return lexical;

    let verdict = this.names.get(host);
    if (!verdict) {
      verdict = this.lookup(host);
      this.names.set(host, verdict);
    }

    return verdict;
  }

  noteBlocked(method: string, url: string, reason: string): void {
    this.blocked += 1;
    this.write({ method, url, status: null, decision: 'blocked', reason, bytes: 0 });
  }

  noteResponse(method: string, url: string, status: number, bytes: number): void {
    this.allowed += 1;
    this.write({ method, url, status, decision: 'allowed', bytes });
  }

  /** How many browser requests were answered and how many were refused. */
  stats(): { allowed: number; blocked: number } {
    return { allowed: this.allowed, blocked: this.blocked };
  }

  private async lookup(host: string): Promise<Decision> {
    try {
      const records = await this.resolve(host);
      const internal = records.some((record) => classifyAddress(record.address) === 'internal');

      return internal
        ? { allowed: false, reason: `${host} points at another machine on your network` }
        : { allowed: true };
    } catch {
      return { allowed: true };
    }
  }

  private write(
    entry: Pick<LogEntry, 'method' | 'url' | 'status' | 'decision' | 'bytes'> & { reason?: string },
  ): void {
    this.log.write({
      ts: new Date().toISOString(),
      hooligan: 'scout',
      ms: 0,
      hop: 0,
      ...entry,
    });
  }
}
