import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMemoryLog,
  createRequestLog,
  type LogEntry,
} from '../../../src/guardrails/egress/request-log.js';

const fakeKey = ['sk', 'live', 'x'.repeat(24)].join('_');

let directory = '';

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = '';
});

function logPath(): string {
  directory = mkdtempSync(join(tmpdir(), 'hooligans-'));
  return join(directory, 'requests.jsonl');
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    ts: '2026-10-21T14:03:12.100Z',
    hooligan: 'loudmouth',
    method: 'GET',
    url: 'http://localhost:3000/page',
    status: 200,
    bytes: 100,
    ms: 12,
    decision: 'allowed',
    hop: 0,
    ...overrides,
  };
}

function lines(path: string): LogEntry[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as LogEntry);
}

describe('createRequestLog', () => {
  it('writes one JSON line per request', () => {
    const path = logPath();
    const log = createRequestLog(path);

    log.write(entry());
    log.write(entry({ url: 'http://localhost:3000/other', status: 404 }));

    expect(lines(path).map((line) => line.status)).toEqual([200, 404]);
  });

  it('hides sensitive query values and anything shaped like a secret', () => {
    const path = logPath();
    const log = createRequestLog(path);

    log.write(
      entry({
        url: `http://localhost:3000/x?token=${fakeKey}&q=ok`,
        decision: 'blocked',
        reason: `The key ${fakeKey} was in the way`,
      }),
    );

    const text = readFileSync(path, 'utf8');
    expect(text).not.toContain(fakeKey);
    expect(text).toContain('q=ok');
    expect(text).toContain('redacted');
  });

  it('writes the known fields only, never headers or bodies', () => {
    const path = logPath();
    const log = createRequestLog(path);
    const sneaky = {
      ...entry(),
      headers: { authorization: 'Bearer secret-value' },
      body: 'password=secret-value',
    } as LogEntry;

    log.write(sneaky);

    const text = readFileSync(path, 'utf8');
    expect(text).not.toContain('secret-value');
    expect(text).not.toContain('authorization');
  });

  it('collapses load traffic into one line per second, route and status', () => {
    const path = logPath();
    const log = createRequestLog(path);

    log.writeAggregated(entry({ url: 'http://localhost:3000/api?page=1' }));
    log.writeAggregated(entry({ url: 'http://localhost:3000/api?page=2' }));
    log.writeAggregated(entry({ url: 'http://localhost:3000/api?page=3' }));
    log.writeAggregated(entry({ url: 'http://localhost:3000/api', status: 500 }));
    log.close();

    const written = lines(path);
    expect(written).toHaveLength(2);

    const ok = written.find((line) => line.status === 200);
    expect(ok).toMatchObject({ url: 'http://localhost:3000/api', count: 3, bytes: 300, ms: 36, msMax: 12 });
  });

  it('starts a new line when the second changes', () => {
    const path = logPath();
    const log = createRequestLog(path);

    log.writeAggregated(entry({ ts: '2026-10-21T14:03:12.100Z' }));
    log.writeAggregated(entry({ ts: '2026-10-21T14:03:13.100Z' }));
    log.close();

    expect(lines(path)).toHaveLength(2);
  });
});

describe('createMemoryLog', () => {
  it('cleans entries the same way', () => {
    const log = createMemoryLog();

    log.write(entry({ url: `http://localhost:3000/x?token=${fakeKey}` }));

    expect(log.entries[0]?.url).not.toContain(fakeKey);
  });
});
