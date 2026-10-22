import type { HooliganContext } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import { probe } from '../_shared/probe.js';
import { openFirebase } from './findings.js';

const DATABASE_HOST = /\.(?:firebaseio\.com|firebasedatabase\.app)$/;
const MAX_HOSTS = 3;

/** The top-level names of the database, or none when the answer is empty or not an object. */
function topLevelNames(body: string): string[] {
  try {
    const data: unknown = JSON.parse(body);
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.keys(data) : [];
  } catch {
    return [];
  }
}

/**
 * Asks a Realtime Database for the names at the top of the tree. Only an answer of 200 means
 * the rules let anyone read it, because a locked database answers 401 whatever it holds.
 */
export async function checkFirebase(context: HooliganContext, notes: string[]): Promise<Finding[]> {
  const hosts = context.map.externalHosts
    .filter((host) => DATABASE_HOST.test(host.toLowerCase()))
    .slice(0, MAX_HOSTS);
  const findings: Finding[] = [];

  for (const host of hosts) {
    if (!context.confirmedHosts.includes(host.toLowerCase())) {
      notes.push(`Door Rattler did not read ${host}, because you did not confirm it is your project.`);
      continue;
    }

    const response = await probe(context.http, `https://${host}/.json?shallow=true`, {
      maxBodyBytes: 64 * 1024,
    });
    if (!response || response.status !== 200) continue;

    findings.push(openFirebase(context.map, host, topLevelNames(response.body)));
  }

  if (context.map.stack.backends.includes('firebase')) {
    notes.push(
      'Door Rattler checks the rules of a Firebase Realtime Database only. Firestore and Firebase Storage rules are not checked yet.',
    );
  }

  return findings;
}
