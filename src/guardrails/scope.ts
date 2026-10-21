import { classifyAddress, isLoopbackName, normalizeHostname, type Scope } from './egress/policy.js';

export type TargetDecision =
  { allowed: true; url: URL; origin: string } | { allowed: false; reason: string };

const MAX_LENGTH = 2048;

const OWN_MACHINE_ONLY =
  'Version 0.1 only tests apps running on your own machine: use localhost, 127.0.0.1 or [::1]. Other addresses need an ownership check, which comes later.';

function refuse(reason: string): TargetDecision {
  return { allowed: false, reason };
}

/** The origin, with the host spelled the one canonical way, so comparisons are exact. */
function canonicalOrigin(url: URL, host: string): string {
  const hostPart = host.includes(':') ? `[${host}]` : host;
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${hostPart}${port}`;
}

/** Version 0.1 only accepts an app on this machine. Everything else is refused with a reason. */
export function checkTarget(input: string): TargetDecision {
  const text = input.trim();

  if (text === '') return refuse('Give me a URL, for example http://localhost:3000.');
  if (text.length > MAX_LENGTH) return refuse('That URL is too long.');
  if (!text.includes('://')) {
    return refuse('Put the scheme in front, for example http://localhost:3000.');
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return refuse('That is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return refuse(`Only http and https addresses work, not ${url.protocol}`);
  }
  if (url.username || url.password) {
    return refuse('Remove the username and password from the URL.');
  }

  const host = normalizeHostname(url.hostname);
  if (isLoopbackName(host) || classifyAddress(host) === 'loopback') {
    return { allowed: true, url, origin: canonicalOrigin(url, host) };
  }

  return refuse(OWN_MACHINE_ONLY);
}

/** The scope of a scan: the app itself, plus any third-party hosts the user confirmed. */
export function scopeFor(origin: string, confirmedHosts: readonly string[] = []): Scope {
  return { origins: [origin], confirmedHosts: confirmedHosts.map(normalizeHostname) };
}
