import type { HooliganContext } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import type { Hooligan, HooliganResult } from '../../core/hooligan.js';
import { readAppFiles } from '../_shared/files.js';
import { identity } from '../_shared/identity.js';
import { checkFirebase } from './firebase.js';
import { checkDebugPages, checkOpenRoutes } from './open-routes.js';
import { checkSupabase, findPublicKeys, supabaseApis } from './supabase.js';

const READS_PER_SECOND = 10;

async function run(context: HooliganContext): Promise<HooliganResult> {
  const notes = [
    'Door Rattler only reads, with no login. It tries the Supabase tables and the private sounding routes your pages call or your API docs list, a few well-known debug pages and a Firebase Realtime Database. It does not guess other routes.',
  ];
  const findings: Finding[] = [];

  const apis = supabaseApis(context.map);
  if (apis.length > 0) {
    const { files } = await readAppFiles(context);
    findings.push(...(await checkSupabase(context, apis, findPublicKeys(files), notes)));
  }

  findings.push(...(await checkFirebase(context, notes)));
  findings.push(...(await checkOpenRoutes(context)));
  findings.push(...(await checkDebugPages(context)));

  return { findings, notLookedAt: notes };
}

export const doorRattler: Hooligan = {
  ...identity('door-rattler'),
  sessions: 0,
  requestsPerSecond: READS_PER_SECOND,
  run,
};
