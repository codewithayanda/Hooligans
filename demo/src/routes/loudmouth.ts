import type { Mode, TwinModule } from '../shared/route.js';

const VULNERABLE_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-credentials': 'true',
  'x-powered-by': 'Express',
};

const FIXED_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

const SESSION_COOKIE: Readonly<Record<Mode, string>> = {
  vuln: 'session=demo-session-value; Path=/',
  fixed: 'session=demo-session-value; Path=/; HttpOnly; SameSite=Lax',
};

/** The Loudmouth twin: what the app says in its headers and cookies. */
export const loudmouth: TwinModule = {
  headers: (mode, path) => ({
    ...(mode === 'vuln' ? VULNERABLE_HEADERS : FIXED_HEADERS),
    ...(path === '/' ? { 'set-cookie': SESSION_COOKIE[mode] } : {}),
  }),
};
