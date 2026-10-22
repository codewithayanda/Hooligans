import type { Attempt } from '../_shared/fuzz.js';

export type Trace = { excerpt: string; hasPaths: boolean };

const TRACE_SIGNS: readonly RegExp[] = [
  /^\s*at\s+.*[\\/].*:\d+:\d+\)?\s*$/m,
  /Traceback \(most recent call last\)/,
  /^\s*at\s+[\w.$<>`+]+\([^\n]*\)/m,
  /\b(?:Fatal error|Parse error|Warning|Notice|Uncaught \w+): .{3,} in \S+\.php(?::\d+| on line \d+)/,
  /\.rb:\d+:in\s+[`']/,
  /Exception in thread "/,
];

const SOURCE_PATH = /(?:[A-Za-z]:\\|\/)[\w.\\/-]+\.(?:js|mjs|cjs|ts|py|rb|php|java|kt|cs|go|rs)\b/;

/** A stack trace shows near the top of an answer, so a very long page is not read to the end. */
const SCAN_LIMIT = 32 * 1024;

/** An error page in HTML puts its lines on break tags, so those become line breaks first. */
function asLines(body: string): string {
  return body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ');
}

/** Whether an answer holds a stack trace, with the start of it and whether it names your files. */
export function findTrace(body: string): Trace | null {
  const lines = asLines(body.slice(0, SCAN_LIMIT));
  if (!TRACE_SIGNS.some((sign) => sign.test(lines))) return null;

  const text = lines.replace(/\s+/g, ' ').trim();
  const excerpt = (text.split(' at ')[0] ?? text).slice(0, 110);

  return { excerpt, hasPaths: SOURCE_PATH.test(lines) };
}

export type Reaction =
  | { kind: 'fine' }
  | { kind: 'error'; status: number; trace: Trace | null }
  | { kind: 'leak'; trace: Trace }
  | { kind: 'hang' }
  | { kind: 'down' };

export type Trouble = Exclude<Reaction, { kind: 'fine' }>;

/** How the app took one request. A failure we cannot explain is not held against it. */
export function react(result: Attempt): Reaction {
  if (result.kind === 'hang') return { kind: 'hang' };
  if (result.kind === 'down') return { kind: 'down' };
  if (result.kind === 'failed') return { kind: 'fine' };

  const { status, body } = result.response;
  const trace = findTrace(body);

  if (status >= 500) return { kind: 'error', status, trace };
  return trace ? { kind: 'leak', trace } : { kind: 'fine' };
}
