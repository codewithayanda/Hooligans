import { describe, expect, it } from 'vitest';
import { checkFirebase } from '../../../../src/hooligans/door-rattler/firebase.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp, type FakeRoute } from '../../../helpers/fake-http.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap } from '../../../helpers/maps.js';

const HOST = 'my-app-default-rtdb.firebaseio.com';

async function check(route: FakeRoute, host = HOST, confirmed: string[] = [host]) {
  const http = fakeHttp({ '/.json': route });
  const notes: string[] = [];
  const map = makeMap({ externalHosts: [host], stack: { backends: ['firebase'] } });
  const findings = await checkFirebase(
    makeContext(map, http, { confirmedHosts: confirmed }),
    notes,
  );

  return { findings, notes, http };
}

describe('checkFirebase', () => {
  it('reports a database that anyone can read as critical, with only its top-level names', async () => {
    const { findings } = await check({ body: '{"users":true,"orders":true}' });
    const [finding] = findings;

    expect(findings).toHaveLength(1);
    expect(finding).toMatchObject({
      id: 'door-rattler.open-firebase',
      severity: 'critical',
      confidence: 'high',
      affected: [`${HOST} (Firebase database)`],
    });
    expect(finding?.evidence).toBe(
      `GET https://${HOST}/.json?shallow=true returned 2 top-level entries (users and orders). No login was used.`,
    );
    for (const item of findings) expectWellFormed(item);
  });

  it('still reports a readable database that is empty, as high', async () => {
    const { findings } = await check({ body: 'null' });

    expect(findings[0]).toMatchObject({ severity: 'high' });
    expect(findings[0]?.evidence).toContain('It is empty right now.');
  });

  it('says nothing about a database that answers with a refusal', async () => {
    const { findings } = await check({ status: 401, body: '{"error":"Permission denied"}' });

    expect(findings).toEqual([]);
  });

  it('only reads, and only the top level', async () => {
    const { http } = await check({ body: '{}' });

    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      url: `https://${HOST}/.json?shallow=true`,
    });
  });

  it('does not read a database that was not confirmed, and says so', async () => {
    const { findings, notes, http } = await check({ body: '{"a":true}' }, HOST, []);

    expect(findings).toEqual([]);
    expect(http.requests).toEqual([]);
    expect(notes[0]).toBe(
      `Door Rattler did not read ${HOST}, because you did not confirm it is your project.`,
    );
  });

  it('knows the newer address of a Realtime Database', async () => {
    const host = 'my-db-default-rtdb.europe-west1.firebasedatabase.app';
    const { findings } = await check({ body: '{"a":true}' }, host);

    expect(findings).toHaveLength(1);
  });

  it('ignores other Firebase hosts', async () => {
    const { findings, http } = await check({ body: '{"a":true}' }, 'my-app.firebaseapp.com');

    expect(findings).toEqual([]);
    expect(http.requests).toEqual([]);
  });

  it('says that Firestore and Storage are not checked yet', async () => {
    const { notes } = await check({ status: 401, body: '{}' });

    expect(notes).toContain(
      'Door Rattler checks the rules of a Firebase Realtime Database only. Firestore and Firebase Storage rules are not checked yet.',
    );
  });
});
