import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import { maskSecret } from '../../util/redact.js';
import { finish, joinWords, safeToken } from '../_shared/finding.js';

const HOOLIGAN = 'door-rattler';

export type OpenTable = {
  /** The address of the Supabase API, for example https://abcd.supabase.co. */
  base: string;
  table: string;
  columns: string[];
  /** The public key that was used. It is masked before it goes anywhere. */
  key: string;
  sensitive: boolean;
};

export type OpenRoute = { path: string; items: number | null; fields: string[] };

export type DebugHit = {
  path: string;
  title: string;
  /** What the page shows, as a phrase. */
  what: string;
  severity: 'high' | 'medium';
  fix: string;
};

function names(items: readonly string[]): string {
  const shown = items.slice(0, 5).map((item) => safeToken(item, 40));
  return items.length > 5 ? `${shown.join(', ')} and ${items.length - 5} more` : joinWords(shown);
}

/** One table that a stranger can read. Only the names of its columns are kept, never its rows. */
export function openTable(map: AppMap, found: OpenTable): Finding {
  const { base, columns, key, sensitive } = found;
  const table = safeToken(found.table, 63);
  const withColumns = columns.length > 0 ? ` with the columns ${names(columns)}` : '';

  return finish(
    {
      id: 'door-rattler.open-table',
      hooligan: HOOLIGAN,
      title: sensitive
        ? `Anyone can read your ${table} table`
        : `Your ${table} table can be read without a login`,
      severity: sensitive ? 'critical' : 'medium',
      category: 'security',
      confidence: sensitive ? 'high' : 'low',
      rootCause: `door-rattler:supabase:${table}:read`,
      affected: [`${table} (Supabase table)`],
      evidence: `GET ${base}/rest/v1/${table}?limit=1 with the public key ${maskSecret(key)} returned 1 row${withColumns}. No login was used.`,
      fix: sensitive
        ? `Turn on row level security for the ${table} table and add a policy so each user can only read their own rows.`
        : `If the ${table} table is public on purpose, this is fine. If not, turn on row level security for it and add a policy for who may read it.`,
      problem: `The ${table} table in Supabase can be read by anyone who has the public key. A request with no login returned a row.`,
      change: `Enable row level security on the ${table} table and add a policy so users can only read their own rows. Check every other table the app reads from the browser in the same way.`,
      keep: 'Signed-in users must still see their own data.',
    },
    map,
  );
}

/** A Realtime Database whose rules let anyone read it. Only the top-level names are kept. */
export function openFirebase(map: AppMap, host: string, top: string[]): Finding {
  const empty = top.length === 0;
  const what = empty
    ? 'was answered, so the rules allow anyone to read the database. It is empty right now.'
    : `returned ${top.length} top-level ${top.length === 1 ? 'entry' : 'entries'} (${names(top)}). No login was used.`;

  return finish(
    {
      id: 'door-rattler.open-firebase',
      hooligan: HOOLIGAN,
      title: 'Anyone can read your whole Firebase database',
      severity: empty ? 'high' : 'critical',
      category: 'security',
      confidence: 'high',
      rootCause: `door-rattler:firebase:${host}:read`,
      affected: [`${host} (Firebase database)`],
      evidence: `GET https://${host}/.json?shallow=true ${what}`,
      fix: 'Change the Realtime Database rules so only signed-in users can read what is theirs. A rule of ".read": true lets anyone read everything.',
      problem: `The Firebase Realtime Database at ${host} can be read by anyone, without a login.`,
      change:
        'Replace the open rules of the Realtime Database with rules that check the signed-in user, for example ".read": "auth != null" as a start and per-user paths where you can. Check the Firestore and Storage rules in the same way.',
      keep: 'Signed-in users must still read and write their own data.',
    },
    map,
  );
}

/** A route with a private sounding name that answers a request with no login. */
export function openRoute(map: AppMap, route: OpenRoute): Finding {
  const path = safeToken(route.path, 100);
  const shape =
    route.items === null
      ? `an object with the fields ${names(route.fields)}`
      : `${route.items} ${route.items === 1 ? 'item' : 'items'}${route.fields.length > 0 ? ` with the fields ${names(route.fields)}` : ''}`;

  return finish(
    {
      id: 'door-rattler.open-route',
      hooligan: HOOLIGAN,
      title: `Your ${path} route answers without a login`,
      severity: 'high',
      category: 'security',
      confidence: 'medium',
      rootCause: `door-rattler:route:${path}:open`,
      affected: [path],
      evidence: `GET ${route.path} with no login returned ${shape}. Its name suggests private data.`,
      fix: 'Check who is asking before the route answers. Return 401 when there is no valid login, and only return what that person may see. If the route is public on purpose, this is fine.',
      problem: `The route GET ${path} returned data to a request with no login, and its name suggests the data is private.`,
      change:
        'Add an authentication check to this route, and to every route that returns user data, so a request without a valid login gets a 401. Make sure each user can only get their own data.',
      keep: 'Signed-in users must still get their own data.',
    },
    map,
  );
}

/** A debug or status page that shows internals to anyone who asks. */
export function debugPage(map: AppMap, hit: DebugHit): Finding {
  const path = safeToken(hit.path, 100);

  return finish(
    {
      id: 'door-rattler.debug-page',
      hooligan: HOOLIGAN,
      title: hit.title,
      severity: hit.severity,
      category: 'security',
      confidence: 'high',
      rootCause: `door-rattler:debug:${path}`,
      affected: [path],
      evidence: `GET ${hit.path} answered with ${hit.what} to a request with no login.`,
      fix: hit.fix,
      problem: `The page ${path} shows ${hit.what} to anyone who asks, with no login.`,
      change: `${hit.fix} Check the other debug and status pages of your framework in the same way.`,
      keep: 'Nothing else should change.',
    },
    map,
  );
}
