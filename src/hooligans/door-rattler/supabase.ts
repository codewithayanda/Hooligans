import type { AppMap } from '../../core/app-map.js';
import type { HooliganContext, HttpClient } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import { parse, type AppFile } from '../_shared/files.js';
import { jwtRole } from '../_shared/jwt.js';
import { probe } from '../_shared/probe.js';
import { openTable } from './findings.js';
import { isSensitiveTable } from './sensitive.js';

const TABLE_PATH = /^\/rest\/v1\/([A-Za-z0-9_]{1,63})\/?$/;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const PUBLISHABLE_KEY = /sb_publishable_[A-Za-z0-9_-]{20,}/g;

const MAX_TABLES = 15;
const MAX_KEYS = 3;

export type SupabaseApi = { base: string; host: string; tables: string[] };

type Read = { rows: number; columns: string[] } | 'unauthorised' | null;

/** The Supabase APIs the page talks to, with the tables it asks for. Functions are left out. */
export function supabaseApis(map: AppMap): SupabaseApi[] {
  const byBase = new Map<string, Set<string>>();

  for (const call of map.calls) {
    const url = parse(call.url);
    const table = url ? TABLE_PATH.exec(url.pathname)?.[1] : undefined;
    if (!url || !table) continue;

    const tables = byBase.get(url.origin) ?? new Set<string>();
    tables.add(table);
    byBase.set(url.origin, tables);
  }

  return [...byBase].map(([base, tables]) => ({
    base,
    host: new URL(base).hostname,
    tables: [...tables].sort().slice(0, MAX_TABLES),
  }));
}

/** The keys that are public by design: an anon key, or a publishable key. Never a secret one. */
export function findPublicKeys(files: readonly AppFile[]): string[] {
  const keys = new Set<string>();

  for (const file of files) {
    for (const match of file.body.matchAll(JWT)) {
      if (jwtRole(match[0]) === 'anon') keys.add(match[0]);
    }
    for (const match of file.body.matchAll(PUBLISHABLE_KEY)) keys.add(match[0]);
  }

  return [...keys].slice(0, MAX_KEYS);
}

/** An anon key is a token and goes in both headers. A publishable key is not a token. */
export function keyHeaders(key: string): Record<string, string> {
  return key.startsWith('eyJ') ? { apikey: key, authorization: `Bearer ${key}` } : { apikey: key };
}

/** Asks for one row. What the row holds is never looked at, only whether it came back. */
async function readTable(
  http: HttpClient,
  api: SupabaseApi,
  table: string,
  key: string,
): Promise<Read> {
  const response = await probe(http, `${api.base}/rest/v1/${table}?select=*&limit=1`, {
    headers: keyHeaders(key),
    maxBodyBytes: 64 * 1024,
  });
  if (!response) return null;
  if (response.status === 401) return 'unauthorised';
  if (response.status !== 200) return null;

  try {
    const rows: unknown = JSON.parse(response.body);
    if (!Array.isArray(rows)) return null;

    const first: unknown = rows[0];
    const columns = typeof first === 'object' && first !== null ? Object.keys(first) : [];
    return { rows: rows.length, columns };
  } catch {
    return null;
  }
}

/**
 * Reads each table the app asks for with the public key the app already ships. A table counts
 * as open only when a row comes back: an empty answer looks the same as a protected table.
 */
export async function checkSupabase(
  context: HooliganContext,
  apis: readonly SupabaseApi[],
  keys: readonly string[],
  notes: string[],
): Promise<Finding[]> {
  const appOrigin = new URL(context.map.entry).origin;
  const findings: Finding[] = [];
  let silent = false;

  for (const api of apis) {
    if (api.base !== appOrigin && !context.confirmedHosts.includes(api.host.toLowerCase())) {
      notes.push(`Door Rattler did not read ${api.host}, because you did not confirm it is your project.`);
      continue;
    }

    if (keys.length === 0) {
      notes.push(
        'Door Rattler could not find the public Supabase key in your scripts, so it could not check your tables.',
      );
      break;
    }

    for (const table of api.tables) {
      for (const key of keys) {
        const read = await readTable(context.http, api, table, key);
        if (read === 'unauthorised') continue;

        if (read && read.rows > 0) {
          const sensitive = isSensitiveTable(table, read.columns);
          findings.push(
            openTable(context.map, { base: api.base, table, columns: read.columns, key, sensitive }),
          );
        } else if (read) {
          silent = true;
        }
        break;
      }
    }
  }

  if (silent) {
    notes.push(
      'A Supabase table that answered with no rows looks the same as a protected one, so it is not reported.',
    );
  }

  return findings;
}
