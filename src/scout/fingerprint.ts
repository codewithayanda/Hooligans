export type FingerprintInput = {
  /** Every URL the browser asked for. */
  urls: readonly string[];
  /** The response headers of the pages, lower case. */
  headers: readonly Record<string, string>[];
  /** The text of the app's own scripts. */
  scripts: readonly string[];
};

export type Fingerprint = {
  framework?: string;
  backends: string[];
  /** Hosts of hosted backends, such as a Supabase project. Consent asks about these. */
  backendHosts: string[];
  mode: 'dev' | 'prod' | 'unknown';
};

const DEV_PATHS: readonly RegExp[] = [
  /\/@vite\/client$/,
  /\/@react-refresh$/,
  /\/@id\//,
  /\/@fs\//,
  /\/node_modules\/\.vite\//,
  /\/_next\/webpack-hmr/,
  /\/_next\/static\/development\//,
  /\/_next\/static\/chunks\/[^/]*(?:hmr|turbopack)/i,
  /\/__webpack_hmr/,
  /\/sockjs-node\//,
  /\/webpack-dev-server/,
];

const VITE_ASSET = /^\/assets\/[\w.-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;

const PROD_PATHS: readonly RegExp[] = [
  /^\/_next\/static\/chunks\//,
  VITE_ASSET,
  /^\/static\/js\/main\.[0-9a-f]{8}\.js$/,
];

const SUPABASE_HOST = /(?:^|\.)supabase\.(?:co|in)$/;
const SUPABASE_PATH = /^\/(?:rest|auth|storage|functions)\/v1\//;
const FIREBASE_HOST =
  /(?:^|\.)(?:firebaseio\.com|firebasedatabase\.app|firebaseapp\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebasestorage\.googleapis\.com)$/;

/** What a hosted backend address ends in, the characters of its name, and how far back to read. */
type HostShape = { ending: RegExp; allowed: RegExp; reach: number };

const SUPABASE_IN_TEXT: HostShape = {
  ending: /\.supabase\.(?:co|in)(?![a-z0-9-]|\.[a-z0-9])/gi,
  allowed: /[a-z0-9-]/i,
  reach: 63,
};
const FIREBASE_IN_TEXT: HostShape = {
  ending: /\.(?:firebaseio\.com|firebasedatabase\.app|firebaseapp\.com)(?![a-z0-9-]|\.[a-z0-9])/gi,
  allowed: /[a-z0-9.-]/i,
  reach: 253,
};

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Finds each ending first and reads the name backwards from it. A pattern that starts with a long
 * run of name characters takes quadratic time on a big script, such as one with a source map.
 */
function hostsIn(text: string, shape: HostShape): string[] {
  const hosts: string[] = [];

  for (const match of text.matchAll(shape.ending)) {
    const dot = match.index;
    let start = dot;
    while (start > 0 && dot - start < shape.reach && shape.allowed.test(text.charAt(start - 1))) {
      start -= 1;
    }

    const name = text.slice(start, dot).replace(/^[.-]+/, '');
    if (name === '' || name.split('.').includes('')) continue;

    hosts.push(`${name}${match[0]}`.toLowerCase());
  }

  return hosts;
}

export function isBackendHost(host: string): boolean {
  const name = host.toLowerCase();
  return SUPABASE_HOST.test(name) || FIREBASE_HOST.test(name);
}

function frameworkOf(
  paths: readonly string[],
  headers: readonly Record<string, string>[],
): string | undefined {
  if (paths.some((path) => path.startsWith('/_next/'))) return 'nextjs';
  if (paths.some((path) => path.startsWith('/@vite/') || VITE_ASSET.test(path))) return 'vite';

  const powered = headers
    .map((entry) => entry['x-powered-by'] ?? '')
    .join(' ')
    .toLowerCase();
  return powered.includes('express') ? 'express' : undefined;
}

/** Works out the stack and whether this is a dev server, from what the browser saw. */
export function fingerprint(input: FingerprintInput): Fingerprint {
  const urls = input.urls.map(parse).filter((url): url is URL => url !== null);
  const paths = urls.map((url) => url.pathname);

  const dev = paths.some((path) => DEV_PATHS.some((pattern) => pattern.test(path)));
  const prod = paths.some((path) => PROD_PATHS.some((pattern) => pattern.test(path)));

  const hosts = new Set<string>();
  for (const url of urls) {
    const host = url.hostname.toLowerCase();
    if (isBackendHost(host)) hosts.add(host);
  }
  for (const script of input.scripts) {
    for (const shape of [SUPABASE_IN_TEXT, FIREBASE_IN_TEXT]) {
      for (const host of hostsIn(script, shape)) hosts.add(host);
    }
  }

  const backends = new Set<string>();
  for (const host of hosts) {
    if (SUPABASE_HOST.test(host)) backends.add('supabase');
    if (FIREBASE_HOST.test(host)) backends.add('firebase');
  }
  if (paths.some((path) => SUPABASE_PATH.test(path))) backends.add('supabase');

  const framework = frameworkOf(paths, input.headers);

  return {
    ...(framework ? { framework } : {}),
    backends: [...backends].sort(),
    backendHosts: [...hosts].filter((host) => host !== '').sort(),
    mode: dev ? 'dev' : prod ? 'prod' : 'unknown',
  };
}
