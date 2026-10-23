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

describe('Angular', () => {
  it('recognises a production build by its hashed bundles', () => {
    const result = print([
      `${app}/`,
      `${app}/polyfills-FFHMD2TL.js`,
      `${app}/main-L6V6ZVEC.js`,
      `${app}/styles-5INURTSO.css`,
    ]);

    expect(result.framework).toBe('angular');
    expect(result.mode).toBe('prod');
  });

  it('recognises an older production build by its hashed bundles', () => {
    const result = print([`${app}/runtime.0123456789abcdef.js`, `${app}/main.fedcba9876543210.js`]);

    expect(result.framework).toBe('angular');
    expect(result.mode).toBe('prod');
  });

  it('calls a dev server Angular, not Vite, which it is built on', () => {
    const result = print([`${app}/@vite/client`, `${app}/main.js`, `${app}/chunk-ABCD1234.js`], {
      scripts: ['import { Component } from "@angular/core";'],
    });

    expect(result.framework).toBe('angular');
    expect(result.mode).toBe('dev');
  });

  it('recognises a classic dev server by its three bundles without a hash', () => {
    const result = print([`${app}/runtime.js`, `${app}/polyfills.js`, `${app}/main.js`]);

    expect(result.framework).toBe('angular');
    expect(result.mode).toBe('dev');
  });

  it('recognises the version attribute in a script when no file name gives it away', () => {
    const result = print([`${app}/bundle.js`], {
      scripts: ['host.setAttribute("ng-version", "19.2.1")'],
    });

    expect(result.framework).toBe('angular');
    expect(result.mode).toBe('unknown');
  });

  it('does not take a Vite app with a main.js for Angular', () => {
    const result = print([`${app}/@vite/client`, `${app}/main.js`]);

    expect(result.framework).toBe('vite');
  });

  it('does not take one hashed file name for Angular', () => {
    const result = print([`${app}/main.fedcba9876543210.js`]);

    expect(result.framework).toBeUndefined();
    expect(result.mode).toBe('prod');
  });

  it('keeps Next.js when its files show as well', () => {
    const result = print([`${app}/_next/static/chunks/main-abc123.js`], {
      scripts: ['ng-version'],
    });

    expect(result.framework).toBe('nextjs');
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

  it('finds the newer address of a Firebase Realtime Database', () => {
    const host = 'my-db-default-rtdb.europe-west1.firebasedatabase.app';
    const result = print([`${app}/`], { scripts: [`databaseURL: "https://${host}"`] });

    expect(result.backends).toEqual(['firebase']);
    expect(result.backendHosts).toEqual([host]);
  });

  it('only takes a host that ends where a backend host ends', () => {
    const text =
      'see https://docs.supabase.com, https://abcd.supabase.co.example.org/x and (ABCD.Supabase.CO).';
    const result = print([`${app}/`], { scripts: [text] });

    expect(result.backendHosts).toEqual(['abcd.supabase.co']);
  });

  it('reads a big script in a moment, even one with a long inline source map', () => {
    const sourceMap = 'Ab3'.repeat(40_000);
    const chain = 'a.'.repeat(15_000);
    const script = `${sourceMap}\n${chain}\n"https://xyz.supabase.co" "https://my-app.firebaseio.com"`;

    const started = performance.now();
    const result = print([`${app}/`], { scripts: [script] });

    expect(performance.now() - started).toBeLessThan(2_000);
    expect(result.backendHosts).toEqual(['my-app.firebaseio.com', 'xyz.supabase.co']);
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
    expect(isBackendHost('my-db.europe-west1.firebasedatabase.app')).toBe(true);
    expect(isBackendHost('example.com')).toBe(false);
  });
});
