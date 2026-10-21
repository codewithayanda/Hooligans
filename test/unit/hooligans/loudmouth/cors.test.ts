import { describe, expect, it } from 'vitest';
import { checkCors, PROBE_ORIGIN } from '../../../../src/hooligans/loudmouth/cors.js';
import { makeContext } from '../../../helpers/context.js';
import { fakeHttp, type FakeRoute } from '../../../helpers/fake-http.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap } from '../../../helpers/maps.js';

const products = {
  method: 'GET',
  url: 'http://localhost:3000/api/products',
  status: 200,
  sentAuth: false,
};

function reflecting(credentials: boolean): FakeRoute {
  return (request) => ({
    headers: {
      'access-control-allow-origin': request.headers?.origin ?? '',
      ...(credentials ? { 'access-control-allow-credentials': 'true' } : {}),
    },
  });
}

function wildcard(credentials: boolean): FakeRoute {
  return {
    headers: {
      'access-control-allow-origin': '*',
      ...(credentials ? { 'access-control-allow-credentials': 'true' } : {}),
    },
  };
}

async function check(routes: Record<string, FakeRoute>, calls = [products]) {
  const http = fakeHttp(routes);
  const findings = await checkCors(makeContext(makeMap({ calls }), http));
  return { findings, http };
}

describe('checkCors', () => {
  it('flags an app that allows any origin together with cookies as high', async () => {
    const { findings } = await check({ '/': reflecting(true), '/api/products': reflecting(true) });

    expect(findings.map((finding) => finding.id)).toEqual(['loudmouth.cors-reflects-origin']);
    expect(findings[0]).toMatchObject({ severity: 'high', confidence: 'high' });
    expect(findings[0]?.affected).toEqual(['/', '/api/products']);
    expect(findings[0]?.evidence).toContain(PROBE_ORIGIN);
    expect(findings[0]?.evidence).toContain('allowing cookies');
  });

  it('takes it lightly when no cookies are involved', async () => {
    const { findings } = await check({ '/api/products': reflecting(false) });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'low', confidence: 'medium' });
  });

  it('flags a wildcard with cookies as a contradiction', async () => {
    const { findings } = await check({ '/': wildcard(true) });

    expect(findings.map((finding) => finding.id)).toEqual(['loudmouth.cors-wildcard']);
    expect(findings[0]).toMatchObject({ severity: 'low', confidence: 'high' });
  });

  it('is not sure about a plain wildcard, which is normal for a public API', async () => {
    const { findings } = await check({ '/api/products': wildcard(false) });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'low', confidence: 'low' });
  });

  it('says nothing when the app sends no CORS headers', async () => {
    const { findings } = await check({ '/': {}, '/api/products': {} });

    expect(findings).toEqual([]);
  });

  it('gives every finding a plain explanation and a prompt', async () => {
    const { findings } = await check({ '/': reflecting(true), '/api/products': wildcard(true) });

    expect(findings).toHaveLength(2);
    for (const finding of findings) expectWellFormed(finding);
  });

  it('only reads, with the made-up origin', async () => {
    const { http } = await check({ '/': reflecting(true) });

    expect(http.requests.length).toBeGreaterThan(0);
    for (const request of http.requests) {
      expect(request.method).toBe('GET');
      expect(request.headers?.origin).toBe(PROBE_ORIGIN);
      expect(request.redirect).toBe('manual');
      expect(request.body).toBeUndefined();
    }
  });

  it('skips routes that look like they have side effects', async () => {
    const checkout = { ...products, url: 'http://localhost:3000/api/checkout' };
    const { http } = await check({}, [products, checkout]);
    const paths = http.requests.map((request) => new URL(request.url).pathname);

    expect(paths).toContain('/api/products');
    expect(paths).not.toContain('/api/checkout');
  });

  it('only asks the app itself, and leaves out the query string', async () => {
    const other = { ...products, url: 'https://abcd.supabase.co/rest/v1/profiles' };
    const keyed = { ...products, url: 'http://localhost:3000/api/items?token=abc' };
    const { http } = await check({}, [other, keyed]);
    const urls = http.requests.map((request) => request.url);

    expect(urls).toContain('http://localhost:3000/api/items');
    expect(urls.some((url) => url.includes('supabase') || url.includes('?'))).toBe(false);
  });

  it('asks at most 8 routes', async () => {
    const calls = Array.from({ length: 20 }, (_, index) => ({
      ...products,
      url: `http://localhost:3000/api/item-${index}`,
    }));
    const { http } = await check({}, calls);

    expect(http.requests).toHaveLength(8);
  });

  it('carries on when nothing answers', async () => {
    const { findings } = await check({ '/': 'network-error', '/api/products': 'network-error' });

    expect(findings).toEqual([]);
  });
});
