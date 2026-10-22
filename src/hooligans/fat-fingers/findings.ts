import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import type { ClumsyInput } from '../../payloads/clumsy.js';
import { finish, safeToken } from '../_shared/finding.js';
import type { FuzzTarget } from '../_shared/fuzz.js';
import type { Trace, Trouble } from './reaction.js';

const HOOLIGAN = 'fat-fingers';

const KEEP = 'Normal use of the form must keep working.';

const VALIDATE =
  'Check every field before using it: its type, its length and its range. Return a 400 with a short plain message when something is wrong.';

export type Problem = { target: FuzzTarget; field: string; input: ClumsyInput; trouble: Trouble };

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function traceText(trace: Trace | null): string {
  if (!trace) return '';

  const paths = trace.hasPaths ? ' and listed file paths from your server' : '';
  return ` The answer started with "${trace.excerpt}"${paths}.`;
}

function handlerAdvice(map: AppMap): string {
  switch (map.stack.framework) {
    case 'express':
      return `${VALIDATE} Add an error handler with app.use((error, request, response, next) => ...) that answers with a short message and never sends error.stack to the browser.`;
    case 'nextjs':
      return `${VALIDATE} Do this in the route handler or server action, and do not return error.message or error.stack to the browser.`;
    default:
      return `${VALIDATE} Add one place that catches crashes and answers with a short message, so a stack trace never reaches the browser.`;
  }
}

/** One odd input that broke something, as a finding. */
export function problemFinding(map: AppMap, problem: Problem): Finding {
  const { trouble, input } = problem;
  const path = safeToken(problem.target.path, 100);
  const at = `${problem.target.method} ${path}`;
  const field = safeToken(problem.field, 40);
  const phrase = lowerFirst(input.says);
  const typed = `${input.says} typed into "${field}" of ${at}`;
  const scene = `When the "${field}" field of ${at} gets ${phrase}`;

  if (trouble.kind === 'error' || trouble.kind === 'leak') {
    const trace = trouble.trace;
    const shows = trace !== null;

    return finish(
      {
        id: shows ? 'fat-fingers.stack-trace' : 'fat-fingers.server-error',
        hooligan: HOOLIGAN,
        title: shows
          ? `${at} shows a stack trace when "${field}" gets ${phrase}`
          : `${at} crashes when "${field}" gets ${phrase}`,
        severity: 'medium',
        category: 'resilience',
        confidence: 'high',
        rootCause: `fat-fingers:${at}:${field}:${shows ? 'stack-trace' : 'server-error'}`,
        affected: [`${at} (${field})`],
        evidence:
          trouble.kind === 'error'
            ? `${typed} returned a ${trouble.status} error.${traceText(trace)}`
            : `${typed} made the app answer with what looks like a stack trace.${traceText(trace)}`,
        fix: shows
          ? 'Limit and check the input, and answer with a short plain error instead of the stack trace. A stack trace tells a stranger which files and libraries you use.'
          : 'Limit and check the input, and answer with a short plain error. A server error on odd input means a visitor can break the page by accident.',
        problem: `${scene}, ${trouble.kind === 'error' ? `the route crashes with a ${trouble.status} error` : 'the route answers with a stack trace'}${shows ? ' and shows details of your server' : ''}.`,
        change: handlerAdvice(map),
        keep: KEEP,
      },
      map,
    );
  }

  if (trouble.kind === 'hang') {
    return finish(
      {
        id: 'fat-fingers.hang',
        hooligan: HOOLIGAN,
        title: `${at} hangs when "${field}" gets ${phrase}`,
        severity: 'medium',
        category: 'resilience',
        confidence: 'medium',
        rootCause: `fat-fingers:${at}:${field}:hang`,
        affected: [`${at} (${field})`],
        evidence: `${typed} got no answer in time.`,
        fix: 'Check the input first and put a limit on how long a request may take, so one odd value cannot keep the app busy.',
        problem: `${scene}, the route stops answering.`,
        change:
          'Validate the input before doing any work with it, and set a timeout on the slow step so a request cannot keep the app busy for ever.',
        keep: KEEP,
      },
      map,
    );
  }

  return finish(
    {
      id: 'fat-fingers.app-down',
      hooligan: HOOLIGAN,
      title: `${at} knocked your app over when "${field}" got ${phrase}`,
      severity: 'high',
      category: 'resilience',
      confidence: 'medium',
      rootCause: `fat-fingers:${at}:${field}:app-down`,
      affected: [`${at} (${field})`],
      evidence: `${typed}, and straight afterwards the app stopped answering. An ordinary request failed too.`,
      fix: 'Find out why the app stopped, using the log from that moment, and make sure one bad request cannot stop the whole app. A dev server that restarts on file changes can look the same, so check that too.',
      problem: `${scene}, the whole app stops answering.`,
      change:
        'Look at the server log from the moment the app stopped. Check every field before using it, and catch errors so one bad request cannot stop the whole app.',
      keep: KEEP,
    },
    map,
  );
}
