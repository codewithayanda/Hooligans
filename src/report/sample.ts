import type { Finding } from '../core/finding.js';
import type { Report } from '../core/report.js';
import { buildFixPrompt } from '../prompts/build.js';
import { maskSecret } from '../util/redact.js';
import { buildReport } from './build.js';

const TARGET = 'http://localhost:3000';
const STACK = { framework: 'nextjs', backends: ['supabase'] };

type Draft = Omit<Finding, 'fixPrompt'> & { problem: string; change: string; keep: string };

function finding(draft: Draft): Finding {
  const { problem, change, keep, ...rest } = draft;
  const recheck = { hooligan: rest.hooligan, url: TARGET };
  return { ...rest, fixPrompt: buildFixPrompt({ stack: STACK, problem, change, keep, recheck }) };
}

/** Built at run time, so no key-shaped text sits in the source. */
function fakePublicKey(): string {
  return ['eyJ' + 'a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)].join('.');
}

function sampleFindings(): Finding[] {
  const missingCsp = {
    hooligan: 'loudmouth',
    title: 'No Content-Security-Policy header',
    severity: 'medium',
    category: 'security',
    confidence: 'high',
    rootCause: 'loudmouth:header:content-security-policy',
    evidence: 'None of these pages sends a Content-Security-Policy header.',
    fix: 'Add a Content-Security-Policy header that only allows scripts from your own site.',
    problem: 'The app does not send a Content-Security-Policy header on its pages.',
    change: 'Add a Content-Security-Policy header that only allows scripts and styles from your own site.',
    keep: 'Every page must still load its own scripts and styles.',
  } as const;

  return [
    finding({
      id: 'door-rattler.open-table',
      hooligan: 'door-rattler',
      title: 'Anyone can read your orders table',
      severity: 'critical',
      category: 'security',
      confidence: 'high',
      rootCause: 'door-rattler:supabase:orders:read',
      affected: ['orders (Supabase table)'],
      evidence: `GET https://your-project.supabase.co/rest/v1/orders?limit=1 with the public key ${maskSecret(fakePublicKey())} returned 1 row. No login was used.`,
      fix: 'Turn on row level security for the orders table and add a policy so each user can only read their own rows.',
      problem:
        'The orders table in Supabase can be read by anyone who has the public key. A request with no login returned a row.',
      change:
        'Enable row level security on the orders table and add a policy so users can only read rows where user_id equals their own id. Check every other table the app reads from the browser in the same way.',
      keep: 'Signed-in users must still see their own orders.',
    }),
    finding({
      id: 'brute.no-rate-limit',
      hooligan: 'brute',
      title: 'Your login accepts unlimited attempts',
      severity: 'high',
      category: 'security',
      confidence: 'high',
      rootCause: 'brute:/api/login:no-rate-limit',
      affected: ['POST /api/login'],
      evidence:
        '30 wrong logins in 20 seconds on POST /api/login, using made-up users and random passwords. No 429 and no lockout.',
      fix: 'Limit login attempts per IP and per account, and answer with 429 and a Retry-After header.',
      problem: 'POST /api/login accepted 30 wrong logins in 20 seconds without slowing down or blocking.',
      change:
        'Add rate limiting to POST /api/login: at most 5 attempts per minute per IP, and return 429 with a Retry-After header.',
      keep: 'Normal logins must keep working.',
    }),
    finding({
      id: 'vandal.reflected-input',
      hooligan: 'vandal',
      title: 'The search page shows what you type without cleaning it',
      severity: 'high',
      category: 'security',
      confidence: 'medium',
      rootCause: 'vandal:/search:q:reflected',
      affected: ['/search?q='],
      evidence:
        'A harmless marker typed into the search box came back inside the page as raw HTML, not as text.',
      fix: 'Escape user input wherever it is shown, or use the text binding of your framework instead of inserting HTML.',
      problem: 'The search page puts the q parameter into the page as raw HTML.',
      change:
        'Escape the q parameter wherever it is shown, or render it as plain text instead of inserting it as HTML.',
      keep: 'Searching must still work and still show the term that was searched for.',
    }),
    finding({
      ...missingCsp,
      id: 'loudmouth.missing-csp',
      affected: ['/', '/pricing', '/login', '/signup'],
    }),
    finding({
      ...missingCsp,
      id: 'loudmouth.missing-csp',
      affected: ['/dashboard', '/settings', '/orders', '/orders/new', '/help', '/terms'],
    }),
    finding({
      id: 'pickpocket.public-source-map',
      hooligan: 'pickpocket',
      title: 'Your source maps are public, so anyone can read your original code',
      severity: 'medium',
      category: 'security',
      confidence: 'high',
      rootCause: 'pickpocket:source-map:/assets/index-4f2a9c.js.map',
      affected: ['/assets/index-4f2a9c.js.map'],
      evidence:
        'The file /assets/index-4f2a9c.js.map can be downloaded without a login. It contains your original source files.',
      fix: 'Stop publishing source maps in production, or serve them only to your own error tracker.',
      problem: 'The source map /assets/index-4f2a9c.js.map is publicly downloadable.',
      change:
        'Turn off production source maps in the build config, or upload them to the error tracker and do not serve them publicly.',
      keep: 'Local development and error reporting must keep working.',
    }),
    finding({
      id: 'fat-fingers.stack-trace',
      hooligan: 'fat-fingers',
      title: 'A very long name crashes signup and shows a stack trace',
      severity: 'medium',
      category: 'resilience',
      confidence: 'high',
      rootCause: 'fat-fingers:/api/signup:stack-trace',
      affected: ['POST /api/signup'],
      evidence:
        'A name of 10,000 characters returned a 500 error. The body started with "TypeError: Cannot read properties of undefined" and listed file paths from your server.',
      fix: 'Limit the length of the name and return a short, plain error instead of the stack trace.',
      problem: 'POST /api/signup crashes on a 10,000 character name and returns a stack trace.',
      change:
        'Validate the length of every signup field, return a 400 with a short message when it is too long, and never return stack traces to the browser.',
      keep: 'Normal signups must keep working.',
    }),
    finding({
      id: 'loudmouth.server-banner',
      hooligan: 'loudmouth',
      title: 'Your server announces what it runs on',
      severity: 'low',
      category: 'security',
      confidence: 'high',
      rootCause: 'loudmouth:header:x-powered-by',
      affected: ['/'],
      evidence: 'The X-Powered-By header says Express.',
      fix: 'Remove the X-Powered-By header.',
      problem: 'Responses carry an X-Powered-By header that names the server framework.',
      change: 'Remove the X-Powered-By header from every response.',
      keep: 'Nothing else should change.',
    }),
    finding({
      id: 'the-mob.slows-down',
      hooligan: 'the-mob',
      title: 'The orders page slows down after about 12 users',
      severity: 'medium',
      category: 'performance',
      confidence: 'low',
      rootCause: 'the-mob:/api/orders:slow',
      affected: ['GET /api/orders'],
      evidence:
        'The 95th percentile went from 180 ms to 2.4 s between 8 and 14 users. This was a dev server, so treat the numbers as relative.',
      fix: 'Look at the query behind GET /api/orders. An index or a smaller response usually helps.',
      problem: 'GET /api/orders gets much slower once about 12 users are on it at the same time.',
      change:
        'Look at the query behind GET /api/orders. Add an index for the columns it filters on, and return only the fields the page needs.',
      keep: 'The orders page must show the same data.',
    }),
  ];
}

export type SampleOptions = { runId: string; version: string; now?: Date };

/** A made-up report that goes through the same pipeline as a real one. */
export function buildSampleReport(options: SampleOptions): Report {
  const finished = options.now ?? new Date();
  const started = new Date(finished.getTime() - 94_000);

  return buildReport({
    tool: { name: 'hooligans', version: options.version },
    run: {
      id: options.runId,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      target: TARGET,
      mode: 'dev',
      status: 'complete',
      stagesRun: [1, 2, 3, 4],
      sample: true,
    },
    findings: sampleFindings(),
    ran: 7,
    skipped: [],
    notLookedAt: [
      'Anything behind a login. Hooligans has no saved login yet.',
      'Anything behind a button. The Scout only follows links.',
      'What your own server does with the requests it receives, such as calls to Stripe or OpenAI.',
      'Whether the database behind the app holds real customer data.',
    ],
    activity: {
      requestsSent: 412,
      requestsBlocked: 3,
      writes: 58,
      cleanupMarker: `hooligans-${options.runId}`,
    },
  });
}
