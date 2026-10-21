import { describe, expect, it } from 'vitest';
import { fingerprint, isBackendHost } from '../../../src/scout/fingerprint.js';

const app = 'http://localhost:3000';

function print(
  urls: string[],
  options: { headers?: Record<string, string>[]; scripts?: string[] } = {},
) {
  return fingerprint({ urls, headers: options.headers ?? [], scripts: options.scripts ?? [] });
}

describe('framework and mode', () => {
  it('recognises a Vite production build by its hashed assets', () => {
    const result = print([`${app}/`, `${app}/assets/index-4f2a9c1b.js`]);

    expect(result.framework).toBe('vite');
    expect(result.mode).toBe('prod');
  });

  it('recognises a Vite dev server by its client script', () => {
    const result = print([`${app}/@vite/client`, `${app}/assets/index-4f2a9c1b.js`]);

    expect(result.framework).toBe('vite');
    expect(result.mode).toBe('dev');
  });

  it('recognises a Next.js production build', () => {
    const result = print([`${app}/_next/static/chunks/main-abc123.js`]);

    expect(result.framework).toBe('nextjs');
    expect(result.mode).toBe('prod');
  });

  it('recognises a Next.js dev server', () => {
    const result = print([`${app}/_next/static/development/_buildManifest.js`]);

    expect(result.framework).toBe('nextjs');
    expect(result.mode).toBe('dev');
  });

  it('reads Express from the header when nothing else is known', () => {
    const result = print([`${app}/`], { headers: [{ 'x-powered-by': 'Express' }] });

    expect(result.framework).toBe('express');
    expect(result.mode).toBe('unknown');
  });

  it('prefers the front end framework over the server one', () => {
    const result = print([`${app}/assets/index-4f2a9c1b.js`], {
      headers: [{ 'x-powered-by': 'Express' }],
    });

    expect(result.framework).toBe('vite');
  });

  it('says nothing when it cannot tell', () => {
    const result = print([`${app}/`]);

    expect(result.framework).toBeUndefined();
    expect(result.mode).toBe('unknown');
    expect(result.backends).toEqual([]);
  });

  it('ignores text that is not a URL', () => {
    expect(print(['not a url']).mode).toBe('unknown');
  });
});

describe('hosted backends', () => {
  it('finds Supabase from a request host', () => {
    const result = print(['https://abcd.supabase.co/rest/v1/orders']);

    expect(result.backends).toEqual(['supabase']);
    expect(result.backendHosts).toEqual(['abcd.supabase.co']);
  });

  it('finds Supabase from the text of a script', () => {
    const result = print([`${app}/`], {
      scripts: ['createClient("https://xyz.supabase.co", key)'],
    });

    expect(result.backends).toEqual(['supabase']);
    expect(result.backendHosts).toEqual(['xyz.supabase.co']);
  });

  it('finds Supabase from the path alone, with no host to name', () => {
    const result = print([`${app}/rest/v1/orders`]);

    expect(result.backends).toEqual(['supabase']);
    expect(result.backendHosts).toEqual([]);
  });

  it('finds Firebase from the text of a script', () => {
    const result = print([`${app}/`], {
      scripts: ['databaseURL: "https://my-app.firebaseio.com"'],
    });

    expect(result.backends).toEqual(['firebase']);
    expect(result.backendHosts).toEqual(['my-app.firebaseio.com']);
  });

  it('lists several backends in order', () => {
    const result = print(['https://abcd.supabase.co/x', 'https://my-app.firebaseio.com/y']);

    expect(result.backends).toEqual(['firebase', 'supabase']);
  });
});

describe('isBackendHost', () => {
  it('knows the hosted backends it looks for', () => {
    expect(isBackendHost('abcd.supabase.co')).toBe(true);
    expect(isBackendHost('FIREBASEIO.COM')).toBe(true);
    expect(isBackendHost('example.com')).toBe(false);
  });
});
