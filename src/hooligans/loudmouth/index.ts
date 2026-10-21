import type { HooliganContext } from '../../core/context.js';
import type { Hooligan, HooliganResult } from '../../core/hooligan.js';
import { identity } from '../_shared/identity.js';
import { checkCookies } from './cookies.js';
import { checkCors } from './cors.js';
import { checkHeaders, documents } from './headers.js';

async function run(context: HooliganContext): Promise<HooliganResult> {
  const { map } = context;
  const notLookedAt = [
    'Loudmouth checked CORS only on the pages and calls the Scout saw, not on every route your server has.',
  ];

  if (documents(map).length === 0) {
    notLookedAt.push('Loudmouth could not read the headers of any page, so it checked none.');
  }
  if (new URL(map.entry).protocol === 'http:') {
    notLookedAt.push(
      'Loudmouth did not check settings that only matter over https, such as Secure cookies and the Strict-Transport-Security header, because the app was scanned over plain http.',
    );
  }

  const findings = [...checkHeaders(map), ...checkCookies(map), ...(await checkCors(context))];
  return { findings, notLookedAt };
}

export const loudmouth: Hooligan = { ...identity('loudmouth'), sessions: 0, run };
