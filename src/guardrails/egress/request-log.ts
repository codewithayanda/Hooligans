import { appendFileSync } from 'node:fs';
import { redactSecrets, redactUrl } from '../../util/redact.js';

/** One line of the audit trail. Headers and bodies are never part of it. */
export type LogEntry = {
  ts: string;
  hooligan: string;
  method: string;
  url: string;
  status: number | null;
  bytes: number;
  /** Milliseconds. In an aggregated line this is the total, and msMax is the slowest. */
  ms: number;
  decision: 'allowed' | 'blocked' | 'failed';
  reason?: string;
  hop: number;
  count?: number;
  msMax?: number;
};

export interface RequestLog {
  write(entry: LogEntry): void;
  /** For load traffic: collapses requests into one line per second, route and status. */
  writeAggregated(entry: LogEntry): void;
  close(): void;
}

/** Copies the known fields only, so nothing else can slip into the file by accident. */
function clean(entry: LogEntry): LogEntry {
  return {
    ts: entry.ts,
    hooligan: entry.hooligan,
    method: entry.method,
    url: redactUrl(entry.url),
    status: entry.status,
    bytes: entry.bytes,
    ms: entry.ms,
    decision: entry.decision,
    hop: entry.hop,
    ...(entry.reason ? { reason: redactSecrets(entry.reason) } : {}),
    ...(entry.count !== undefined ? { count: entry.count } : {}),
    ...(entry.msMax !== undefined ? { msMax: entry.msMax } : {}),
  };
}

function withoutQuery(url: string): string {
  return url.split('?')[0] ?? url;
}

function createBuckets(emit: (entry: LogEntry) => void) {
  const buckets = new Map<string, LogEntry>();
  let currentSecond = '';

  const flush = (): void => {
    for (const entry of buckets.values()) emit(entry);
    buckets.clear();
  };

  const add = (entry: LogEntry): void => {
    const second = entry.ts.slice(0, 19);
    if (second !== currentSecond) {
      flush();
      currentSecond = second;
    }

    const key = [entry.hooligan, entry.method, withoutQuery(entry.url), entry.status, entry.decision].join('|');
    const existing = buckets.get(key);

    if (existing) {
      existing.count = (existing.count ?? 1) + 1;
      existing.bytes += entry.bytes;
      existing.ms += entry.ms;
      existing.msMax = Math.max(existing.msMax ?? 0, entry.ms);
    } else {
      buckets.set(key, { ...entry, url: withoutQuery(entry.url), count: 1, msMax: entry.ms });
    }
  };

  return { add, flush };
}

/** Writes JSON lines to a file, one entry per line, as the requests happen. */
export function createRequestLog(path: string): RequestLog {
  const append = (entry: LogEntry): void => {
    appendFileSync(path, `${JSON.stringify(clean(entry))}\n`);
  };
  const buckets = createBuckets(append);

  return {
    write: append,
    writeAggregated: buckets.add,
    close: buckets.flush,
  };
}

/** Keeps entries in memory, cleaned the same way. For tests. */
export function createMemoryLog(): RequestLog & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const append = (entry: LogEntry): void => {
    entries.push(clean(entry));
  };
  const buckets = createBuckets(append);

  return {
    entries,
    write: append,
    writeAggregated: buckets.add,
    close: buckets.flush,
  };
}
