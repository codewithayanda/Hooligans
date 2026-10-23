import { randomBytes } from 'node:crypto';
import { cleanupMarker } from '../../util/workspace.js';

/** What one made-up person types. Everything carries the run marker, so the junk can be found. */
export type Values = { email: string; username: string; password: string; text: string };

/** The values for attempt number n. */
export type Maker = (n: number) => Values;

export function randomPassword(): string {
  return randomBytes(12).toString('base64url');
}

export function valuesFor(runId: string, password: () => string = randomPassword): Maker {
  const marker = cleanupMarker(runId);

  return (n) => ({
    email: `${marker}-${n}@hooligans.invalid`,
    username: `${marker}-${n}`,
    password: password(),
    text: marker,
  });
}
