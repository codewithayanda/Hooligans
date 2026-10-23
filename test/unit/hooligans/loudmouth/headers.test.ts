import { describe, expect, it } from 'vitest';
import type { AppMap } from '../../../../src/core/app-map.js';
import { checkHeaders, documents } from '../../../../src/hooligans/loudmouth/headers.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { loadMap, makeMap } from '../../../helpers/maps.js';

const bare = {
  url: 'http://localhost:3000/',
  status: 200,
  headers: { 'content-type': 'text/html' },
};

const ids = (findings: { id: string }[]): string[] => findings.map((finding) => finding.id);

describe('checkHeaders', () => {
  it('reports the headers the vulnerable site does not send', () => {
    expect(ids(checkHeaders(loadMap('vulnerable')))).toEqual([
      'loudmouth.missing-csp',
      'loudmouth.missing-frame-protection',
      'loudmouth.missing-nosniff',
      'loudmouth.server-banner',
    ]);
  });

  it('lists every page in one finding for each header', () => {
    const csp = checkHeaders(loadMap('vulnerable')).find(
      (finding) => finding.id === 'loudmouth.missing-csp',
    );

    expect(csp?.affected).toEqual(['/', '/login', '/pricing']);
    expect(csp?.evidence).toBe('None of these 3 pages send a Content-Security-Policy header.');
  });

  it('says it more simply for one page', () => {
    const csp = checkHeaders(makeMap({ pages: [bare] })).find(
      (finding) => finding.id === 'loudmouth.missing-csp',
    );

    expect(csp?.evidence).toBe('This page does not send a Content-Security-Policy header.');
  });

  it('finds nothing on the fixed site, or on a clean single page app', () => {
    expect(checkHeaders(loadMap('fixed'))).toEqual([]);
    expect(checkHeaders(loadMap('spa-with-login'))).toEqual([]);
  });

  it('counts frame-ancestors as protection against framing', () => {
    const page = {
      ...bare,
      headers: {
        'content-type': 'text/html',
        'content-security-policy': "frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
      },
    };

    expect(checkHeaders(makeMap({ pages: [page] }))).toEqual([]);
  });

  it('names what the X-Powered-By header says', () => {
    const banner = checkHeaders(loadMap('vulnerable')).find(
      (finding) => finding.id === 'loudmouth.server-banner',
    );

    expect(banner?.evidence).toBe('The X-Powered-By header says Express.');
  });

  it('ignores a failed page and a file, which are not pages to protect', () => {
    const json = {
      url: 'http://localhost:3000/api/x',
      status: 200,
      headers: { 'content-type': 'application/json' },
    };
    const missing = {
      url: 'http://localhost:3000/gone',
      status: 404,
      headers: { 'content-type': 'text/html' },
    };

    expect(checkHeaders(makeMap({ pages: [json, missing] }))).toEqual([]);
  });

  it('gives every finding a plain explanation and a prompt', () => {
    for (const finding of checkHeaders(loadMap('vulnerable'))) expectWellFormed(finding);
  });
});

describe('the fix, in the words of the stack', () => {
  function find(framework: string | undefined, id = 'loudmouth.missing-csp') {
    const stack: AppMap['stack'] = framework ? { framework, backends: [] } : { backends: [] };

    return checkHeaders(makeMap({ stack, pages: [bare] })).find((finding) => finding.id === id);
  }

  function promptFor(framework: string | undefined, id?: string): string {
    return find(framework, id)?.fixPrompt ?? '';
  }

  it('speaks Next.js to a Next.js app', () => {
    expect(promptFor('nextjs')).toContain('next.config.js');
  });

  it('speaks Express to an Express app', () => {
    expect(promptFor('express')).toContain('helmet');
  });

  it('tells a Vite app that its host sets the header', () => {
    expect(promptFor('vite')).toContain('where the built site is served');
  });

  it('stays general when the stack is not known', () => {
    expect(promptFor(undefined)).toContain('in your server or hosting settings');
  });

  it('tells an Angular app that its host sets the header, and how to ship the file', () => {
    const prompt = promptFor('angular');

    expect(prompt).toContain('Angular only builds your files');
    expect(prompt).toContain('assets list in angular.json');
    expect(prompt).toContain('_headers');
  });

  it('tells a Vite app where the file goes in its build', () => {
    expect(promptFor('vite')).toContain('public folder');
  });

  it('lists the common hosts for an app with no server of its own', () => {
    for (const framework of ['vite', 'angular', undefined]) {
      const prompt = promptFor(framework);

      expect(prompt).toContain('Netlify or Cloudflare Pages');
      expect(prompt).toContain('vercel.json');
      expect(prompt).toContain('GitHub Pages');
    }
  });

  it('keeps static hosts out of the advice for an app that has a server of its own', () => {
    for (const framework of ['nextjs', 'express']) {
      expect(promptFor(framework)).not.toContain('_headers');
      expect(find(framework)?.fix).not.toContain('Where you set it depends on your host');
    }
  });

  it('says plainly that GitHub Pages can only carry the policy, in a meta tag', () => {
    expect(promptFor('vite')).toContain('meta tag');
    expect(promptFor('vite', 'loudmouth.missing-nosniff')).toContain(
      'cannot set this header at all',
    );
  });

  it('puts the same advice in the plain explanation', () => {
    const fix = find('angular')?.fix ?? '';

    expect(fix).toContain('Where you set it depends on your host');
    expect(fix).toContain('GitHub Pages only takes a meta tag');
  });
});

describe('documents', () => {
  it('keeps pages with no content type, which are most likely pages', () => {
    const page = { url: 'http://localhost:3000/', status: 200, headers: {} };

    expect(documents(makeMap({ pages: [page] }))).toHaveLength(1);
  });
});
