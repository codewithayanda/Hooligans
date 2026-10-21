import { BlockList, isIP } from 'node:net';

export type AddressClass = 'loopback' | 'internal' | 'public' | 'invalid';

export type Decision = { allowed: true } | { allowed: false; reason: string };

/** What a scan may talk to. The origins are the app itself, confirmed hosts are read-only extras. */
export type Scope = {
  origins: readonly string[];
  confirmedHosts: readonly string[];
};

const ALLOWED: Decision = { allowed: true };

function refuse(reason: string): Decision {
  return { allowed: false, reason };
}

const LOOPBACK = new BlockList();
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK.addAddress('::1', 'ipv6');

const INTERNAL_V4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const INTERNAL_V6: readonly (readonly [string, number])[] = [
  ['::', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

const INTERNAL = new BlockList();
for (const [network, prefix] of INTERNAL_V4) INTERNAL.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of INTERNAL_V6) INTERNAL.addSubnet(network, prefix, 'ipv6');

const INTERNAL_SUFFIXES = [
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.private',
  '.home.arpa',
];

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/** An IPv4 address wearing an IPv6 coat is judged as the IPv4 address it is. */
function unmap(address: string): string {
  const lower = address.toLowerCase();

  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted?.[1]) return dotted[1];

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex?.[1] && hex[2]) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }

  return address;
}

export function classifyAddress(address: string): AddressClass {
  if (address.includes('%')) return 'internal';

  const plain = unmap(address);
  const family = isIP(plain);
  if (family === 0) return 'invalid';

  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (LOOPBACK.check(plain, type)) return 'loopback';
  if (INTERNAL.check(plain, type)) return 'internal';
  return 'public';
}

/** Lower case, no brackets around an IPv6 address, no trailing dot. */
export function normalizeHostname(hostname: string): string {
  const bare =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const lower = bare.toLowerCase();
  return lower.endsWith('.') ? lower.slice(0, -1) : lower;
}

export function isLoopbackName(hostname: string): boolean {
  return normalizeHostname(hostname) === 'localhost';
}

function describe(kind: AddressClass): string {
  if (kind === 'loopback') return 'this machine';
  if (kind === 'internal') return 'another machine on a private network';
  if (kind === 'public') return 'the public internet';
  return 'an address that cannot be used';
}

/** Names that are almost certainly machines on the user's own network. A best guess, not proof. */
function looksInternalName(host: string): boolean {
  return !host.includes('.') || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Decides whether Hooligans itself may send this request. */
export function decideRequest(url: URL, method: string, scope: Scope): Decision {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return refuse(`${url.protocol} is not an allowed scheme`);
  }
  if (url.username || url.password) {
    return refuse('Addresses with a username or password are not allowed');
  }
  if (!METHODS.has(method)) return refuse(`${method} is not an allowed method`);

  if (scope.origins.includes(url.origin)) return ALLOWED;

  const host = normalizeHostname(url.hostname);
  if (scope.confirmedHosts.includes(host)) {
    return method === 'GET' || method === 'HEAD'
      ? ALLOWED
      : refuse(`${host} is confirmed for reading only`);
  }

  return refuse(`${url.origin} is outside the app Hooligans was pointed at`);
}

/** Decides whether a connection may go to the address a name resolved to. */
export function decideAddress(hostname: string, address: string, scope: Scope): Decision {
  const host = normalizeHostname(hostname);
  const kind = classifyAddress(address);
  const appHosts = scope.origins.map((origin) => normalizeHostname(new URL(origin).hostname));

  if (appHosts.includes(host)) {
    return kind === 'loopback'
      ? ALLOWED
      : refuse(`${host} points at ${describe(kind)}, not at this machine`);
  }

  if (scope.confirmedHosts.includes(host)) {
    return kind === 'public'
      ? ALLOWED
      : refuse(`${host} points at ${describe(kind)}, not at the public internet`);
  }

  return refuse(`${host} is outside the app Hooligans was pointed at`);
}

/**
 * Decides whether the Scout's browser may make a request while it maps the app.
 * The public internet and other ports on this machine are fine. Other machines are not.
 */
export function decideBrowserRequest(url: URL, scope: Scope): Decision {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return refuse(`${url.protocol} requests are not allowed`);
  }
  if (scope.origins.includes(url.origin)) return ALLOWED;

  const host = normalizeHostname(url.hostname);
  if (host === 'localhost' || host.endsWith('.localhost')) return ALLOWED;

  const kind = classifyAddress(host);
  if (kind === 'loopback' || kind === 'public') return ALLOWED;
  if (kind === 'internal') return refuse(`${host} is another machine on your network`);

  return looksInternalName(host) ? refuse(`${host} looks like a machine on your network`) : ALLOWED;
}
