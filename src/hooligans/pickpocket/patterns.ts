import type { Confidence, Severity } from '../../core/finding.js';
import { SECRET_SHAPES } from '../../util/redact.js';
import { jwtRole } from '../_shared/jwt.js';

export type SecretKind = {
  id: string;
  /** With its article, for example "a live Stripe secret key". */
  label: string;
  severity: Severity;
  confidence: Confidence;
  /** What to do about it, for the person reading the report. */
  fix: string;
};

export type SecretHit = { kind: SecretKind; value: string };

type Classifier = (value: string) => SecretKind | null;

function kind(
  id: string,
  label: string,
  severity: Severity,
  confidence: Confidence,
  fix: string,
): SecretKind {
  return { id, label, severity, confidence, fix };
}

const STRIPE_LIVE = kind(
  'stripe-secret-key',
  'a live Stripe secret key',
  'critical',
  'high',
  'Anyone who finds this key can charge cards, refund payments and read customer details. Roll the key in the Stripe dashboard (Developers, API keys), keep the new one on your server only, and use the publishable key in the browser.',
);

const STRIPE_TEST = kind(
  'stripe-test-key',
  'a Stripe test secret key',
  'medium',
  'high',
  'A test key cannot move real money, but it gives anyone access to your Stripe test account. Roll it in the Stripe dashboard and keep it on your server only.',
);

const AWS = kind(
  'aws-access-key',
  'an AWS access key',
  'high',
  'medium',
  'AWS keys should never be in code that reaches the browser. Deactivate this one in the AWS console (IAM, Security credentials) and create a new one for your server.',
);

const GITHUB = kind(
  'github-token',
  'a GitHub token',
  'high',
  'high',
  'A GitHub token can read and change your code. Revoke it at github.com/settings/tokens and create a new one for your server.',
);

const SLACK = kind(
  'slack-token',
  'a Slack token',
  'high',
  'high',
  'A Slack token lets anyone act as your app in your workspace. Revoke it in your Slack app settings and create a new one for your server.',
);

const GOOGLE = kind(
  'google-api-key',
  'a Google API key',
  'low',
  'low',
  'Google API keys are meant to sit in your front end, but they should be limited. In the Google Cloud console, restrict this key to your website address and to the APIs you use, so nobody else can run up your bill with it.',
);

const AI_KEY = kind(
  'ai-api-key',
  'an AI service API key',
  'high',
  'medium',
  "Anyone can use this key to send requests on your account and run up your bill. Revoke it in your provider's dashboard, create a new one, and call the API from your server so the key never reaches the browser.",
);

const PRIVATE_KEY = kind(
  'private-key',
  'a private key',
  'critical',
  'high',
  'A private key proves who you are. Treat it as stolen: replace the key pair, and keep the new private key out of anything you publish.',
);

const DATABASE_URL = kind(
  'database-url',
  'a database address with its password',
  'critical',
  'high',
  'Anyone who finds this can connect to your database. Change the database password now, keep the connection string on your server only, and never let the browser talk to the database directly.',
);

const SERVICE_ROLE = kind(
  'supabase-service-role-key',
  'a Supabase service_role key',
  'critical',
  'high',
  'The service_role key skips all of your Supabase security rules, so anyone with it can read and change every table. Create a new one in the Supabase dashboard (Project settings, API) and use it on your server only.',
);

const SUPABASE_SECRET = kind(
  'supabase-secret-key',
  'a Supabase secret key',
  'critical',
  'high',
  'A Supabase secret key skips all of your security rules, so anyone with it can read and change every table. Create a new one in the Supabase dashboard (Project settings, API keys) and use it on your server only.',
);

const SIGNED_TOKEN = kind(
  'signed-token',
  'a signed login token',
  'low',
  'low',
  'If this token belongs to a real user or service, anyone can use it until it expires. Revoke it if it is real, and keep tokens out of your code.',
);

const OTHER = kind(
  'secret',
  'a secret',
  'high',
  'medium',
  'Treat it as leaked: create a new one, stop using this one and keep the new one on your server only.',
);

/** Some shapes also match harmless text, so those need a second look. */
function looksRandom(value: string): boolean {
  return value.length >= 32 && /\d/.test(value) && /[A-Za-z]/.test(value);
}

/** A Supabase anon key is public by design. A service_role key is not. */
function classifyJwt(value: string): SecretKind | null {
  const role = jwtRole(value);
  if (role === 'anon') return null;

  return role === 'service_role' ? SERVICE_ROLE : SIGNED_TOKEN;
}

function classifyDatabaseUrl(value: string): SecretKind | null {
  const password = /^[a-z0-9+]+:\/\/[^:@/]+:([^@]+)@/i.exec(value)?.[1] ?? '';
  const placeholder = /^(?:password|pass|secret|\*+|x+|<.*>|\$\{.*\}|\{\{.*\}\}|%s)$/i;

  return placeholder.test(password) ? null : DATABASE_URL;
}

const CLASSIFIERS: Readonly<Record<string, Classifier>> = {
  'Stripe secret key': (value) => (value.startsWith('sk_live_') ? STRIPE_LIVE : STRIPE_TEST),
  'AWS access key': (value) => (value.includes('EXAMPLE') ? null : AWS),
  'GitHub token': () => GITHUB,
  'Slack token': () => SLACK,
  'Google API key': () => GOOGLE,
  'OpenAI style key': (value) => (looksRandom(value) ? AI_KEY : null),
  'JSON web token': classifyJwt,
  'Private key': () => PRIVATE_KEY,
  'Supabase secret key': () => SUPABASE_SECRET,
  'Database URL with a password': classifyDatabaseUrl,
};

/** The names of the shapes that have an explicit classification, for the test that checks them. */
export const CLASSIFIED_SHAPES: readonly string[] = Object.keys(CLASSIFIERS);

/** Every secret in the text, once each. Nothing is returned for text that only looks like one. */
export function findSecrets(text: string): SecretHit[] {
  const hits = new Map<string, SecretHit>();

  for (const shape of SECRET_SHAPES) {
    const classify: Classifier = CLASSIFIERS[shape.name] ?? (() => OTHER);

    for (const match of text.matchAll(new RegExp(shape.pattern.source, 'g'))) {
      const value = match[0];
      if (hits.has(value)) continue;

      const found = classify(value);
      if (found) hits.set(value, { kind: found, value });
    }
  }

  return [...hits.values()];
}

const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/** The setting names in a file that looks like a .env file, or none when it does not. */
export function envNames(body: string): string[] {
  if (/^\s*</.test(body)) return [];

  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  const names = lines.flatMap((line) => {
    const name = ASSIGNMENT.exec(line)?.[1];
    return name ? [name] : [];
  });

  return names.length > 0 && names.length / lines.length >= 0.5 ? [...new Set(names)] : [];
}

export function looksLikeGitConfig(body: string): boolean {
  return !/^\s*</.test(body) && /^\s*\[core\]/m.test(body);
}

export function looksLikeGitHead(body: string): boolean {
  return /^(?:ref: refs\/heads\/[\w./-]+|[0-9a-f]{40})$/.test(body.trim());
}

/** Null when the text is not a source map. Otherwise whether it carries the original code. */
export function describeSourceMap(body: string): { hasCode: boolean | null } | null {
  const head = body.slice(0, 65_536);
  if (!/"version"\s*:\s*3/.test(head) || !/"sources"\s*:\s*\[/.test(head)) return null;

  try {
    const parsed = JSON.parse(body) as { sourcesContent?: unknown } | null;
    const content = parsed?.sourcesContent;
    const hasCode =
      Array.isArray(content) && content.some((item) => typeof item === 'string' && item !== '');
    return { hasCode };
  } catch {
    return { hasCode: null };
  }
}
