import { beforeAll, describe, expect, it } from 'vitest';
import type { AppMap } from '../../src/core/app-map.js';
import { BrowserGuard } from '../../src/guardrails/egress/browser.js';
import { EgressGate } from '../../src/guardrails/egress/gate.js';
import { createMemoryLog } from '../../src/guardrails/egress/request-log.js';
import { scopeFor } from '../../src/guardrails/scope.js';
import { runScout } from '../../src/scout/scout.js';
import { shouldSkipBrowserTests } from '../helpers/browser.js';
import { startDemo, type Demo, type DemoOptions } from '../helpers/demo.js';

type Scanned = { demo: Demo; map: AppMap; log: ReturnType<typeof createMemoryLog> };

const skip = await shouldSkipBrowserTests('The Scout tests');
const describeScout = describe.skipIf(skip);

async function scan(options: DemoOptions): Promise<Scanned> {
  const demo = await startDemo(options);
  const scope = scopeFor(demo.origin);
  const log = createMemoryLog();
  const gate = new EgressGate({ scope, log });
  const guard = new BrowserGuard({ scope, log });

  try {
    const map = await runScout({
      entry: new URL(`${demo.origin}/`),
      scope,
      http: gate.client('scout'),
      guard,
    });
    return { demo, map, log };
  } finally {
    gate.close();
    await demo.close();
  }
}

describeScout('the Scout against the demo', () => {
  let vulnerable!: Scanned;
  let fixed!: Scanned;
  let dev!: Scanned;

  beforeAll(async () => {
    vulnerable = await scan({ mode: 'vuln' });
    fixed = await scan({ mode: 'fixed' });
    dev = await scan({ mode: 'vuln', devServer: true });
  }, 180_000);

  const urlsOf = (scanned: Scanned) => scanned.map.pages.map((page) => page.url);

  it('maps the pages, including links the page script adds', () => {
    const { demo } = vulnerable;

    expect(urlsOf(vulnerable)).toEqual(
      expect.arrayContaining([
        `${demo.origin}/`,
        `${demo.origin}/about.html`,
        `${demo.origin}/pricing.html`,
        `${demo.origin}/login.html`,
        `${demo.origin}/contact.html`,
        `${demo.origin}/products/1`,
        `${demo.origin}/products/2`,
      ]),
    );
  });

  it('stays on the app: nothing destructive, nothing hidden, nothing on another site', () => {
    const { demo } = vulnerable;

    expect(demo.hits('/logout')).toBe(0);
    expect(demo.hits('/delete')).toBe(0);
    expect(demo.hits('/admin/secret-page')).toBe(0);
    expect(demo.hits('/hidden-in-sitemap.html')).toBe(0);
    expect(urlsOf(vulnerable).every((url) => url.startsWith(demo.origin))).toBe(true);
  });

  it('says what it skipped and why', () => {
    const skipped = vulnerable.map.coverage.skipped.join('\n');

    expect(skipped).toContain('/logout');
    expect(skipped).toContain('/delete');
    expect(skipped).toContain('https://example.com');
  });

  it('never submits a form', () => {
    const { demo } = vulnerable;

    expect(demo.hits('/api/login')).toBe(0);
    expect(demo.hits('/api/contact')).toBe(0);
    expect(demo.hits('/search')).toBe(0);
  });

  it('records the forms and their fields', () => {
    const { demo, map } = vulnerable;
    const login = map.forms.find((form) => form.action === `${demo.origin}/api/login`);
    const contact = map.forms.find((form) => form.action === `${demo.origin}/api/contact`);

    expect(login?.method).toBe('POST');
    expect(login?.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['email', 'password', 'remember']),
    );
    expect(contact?.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['name', 'topic', 'message']),
    );
  });

  it('records the calls the page makes on its own', () => {
    const { demo, map } = vulnerable;

    expect(map.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', url: `${demo.origin}/api/products`, status: 200 }),
        expect.objectContaining({ method: 'POST', url: `${demo.origin}/api/track`, status: 204 }),
      ]),
    );
  });

  it('finds the script and the source map in the vulnerable twin only', () => {
    const script = `${vulnerable.demo.origin}/assets/index-4f2a9c1b.js`;

    expect(vulnerable.map.assets).toEqual(
      expect.arrayContaining([
        { url: script, kind: 'script' },
        { url: `${script}.map`, kind: 'sourcemap' },
      ]),
    );
    expect(fixed.map.assets.some((asset) => asset.kind === 'sourcemap')).toBe(false);
  });

  it('records the headers of the vulnerable twin and hides the cookie value', () => {
    const home = vulnerable.map.pages.find((page) => page.url === `${vulnerable.demo.origin}/`);

    expect(home?.headers['access-control-allow-origin']).toBe('*');
    expect(home?.headers['x-powered-by']).toBe('Express');
    expect(home?.headers['set-cookie']).toContain('[hidden]');
    expect(home?.headers['set-cookie']).not.toContain('demo-session-value');
  });

  it('records the headers of the fixed twin', () => {
    const home = fixed.map.pages.find((page) => page.url === `${fixed.demo.origin}/`);

    expect(home?.headers['content-security-policy']).toContain("default-src 'self'");
    expect(home?.headers['x-content-type-options']).toBe('nosniff');
    expect(home?.headers['x-powered-by']).toBeUndefined();
  });

  it('records the cookie flags of both twins', () => {
    expect(vulnerable.map.cookies).toEqual([
      expect.objectContaining({ name: 'session', secure: false, httpOnly: false }),
    ]);
    expect(fixed.map.cookies).toEqual([
      expect.objectContaining({ name: 'session', httpOnly: true, sameSite: 'Lax' }),
    ]);
  });

  it('notes the places it did not visit as leads', () => {
    const { demo, map } = vulnerable;
    const leads = map.leads.map((lead) => lead.url);

    expect(leads).toEqual(
      expect.arrayContaining([
        `${demo.origin}/admin/`,
        `${demo.origin}/delete`,
        `${demo.origin}/hidden-in-sitemap.html`,
        `${demo.origin}/api/products`,
      ]),
    );
  });

  it('blocks a page that tries to reach another machine, and logs it', () => {
    const blocked = vulnerable.log.entries.filter(
      (entry) => entry.decision === 'blocked' && entry.url.includes('10.255.255.1'),
    );

    expect(blocked.length).toBeGreaterThan(0);
    expect(vulnerable.map.externalHosts).not.toContain('10.255.255.1');
  });

  it('works out the stack and the mode', () => {
    expect(vulnerable.map.stack.framework).toBe('vite');
    expect(vulnerable.map.mode).toBe('prod');
    expect(dev.map.mode).toBe('dev');
  });

  it('counts what it covered', () => {
    const { map } = vulnerable;

    expect(map.coverage.pages).toBe(map.pages.length);
    expect(map.coverage.forms).toBe(map.forms.length);
    expect(map.coverage.calls).toBe(map.calls.length);
  });
});
