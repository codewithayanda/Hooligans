import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpResponse } from '../../../src/core/context.js';
import { EgressError, type EgressErrorKind } from '../../../src/guardrails/egress/gate.js';
import { isHtml, probe } from '../../../src/hooligans/_shared/probe.js';
import { fakeHttp } from '../../helpers/fake-http.js';

const URL_A = 'http://localhost:3000/a';

function failing(error: unknown): HttpClient {
  return {
    request: async () => {
      throw error;
    },
  };
}

function answer(contentType: string): HttpResponse {
  return {
    status: 200,
    headers: { 'content-type': contentType },
    body: '',
    durationMs: 1,
    truncated: false,
    url: URL_A,
  };
}

describe('probe', () => {
  it('returns the answer', async () => {
    const response = await probe(fakeHttp({ '/a': { body: 'hello' } }), URL_A);

    expect(response?.body).toBe('hello');
  });

  it('asks with a GET and passes the options on', async () => {
    const http = fakeHttp({ '/a': {} });
    await probe(http, URL_A, { headers: { origin: 'https://x.invalid' }, redirect: 'manual' });

    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      headers: { origin: 'https://x.invalid' },
      redirect: 'manual',
    });
  });

  it.each<EgressErrorKind>(['blocked', 'network', 'timeout'])(
    'gives null when the request ends as %s',
    async (kind) => {
      expect(await probe(failing(new EgressError(kind, 'no')), URL_A)).toBeNull();
    },
  );

  it('treats an unexpected error as no answer', async () => {
    expect(await probe(failing(new TypeError('odd')), URL_A)).toBeNull();
  });

  it.each<EgressErrorKind>(['budget', 'aborted'])(
    'passes on a %s error, so the whole scan can stop',
    async (kind) => {
      await expect(probe(failing(new EgressError(kind, 'stop')), URL_A)).rejects.toMatchObject({
        kind,
      });
    },
  );
});

describe('isHtml', () => {
  it('recognises a web page', () => {
    expect(isHtml(answer('text/html; charset=utf-8'))).toBe(true);
    expect(isHtml(answer('TEXT/HTML'))).toBe(true);
  });

  it('leaves files alone', () => {
    expect(isHtml(answer('text/plain'))).toBe(false);
    expect(isHtml(answer('application/json'))).toBe(false);
  });
});
