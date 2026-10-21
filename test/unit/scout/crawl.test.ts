import { describe, expect, it } from 'vitest';
import { classifyLink, looksDestructive, normalizeUrl } from '../../../src/scout/crawl.js';

const scope = { origins: ['http://localhost:3000'], confirmedHosts: [] };

function link(href: string, text = '', download = false) {
  return { href, text, download };
}

describe('classifyLink', () => {
  it('visits a page on the same origin', () => {
    const verdict = classifyLink(link('http://localhost:3000/about.html', 'About'), scope);

    expect(verdict.kind).toBe('visit');
    if (verdict.kind === 'visit') expect(verdict.url.pathname).toBe('/about.html');
  });

  it.each(['mailto:hello@example.com', 'tel:+27123456789', 'javascript:void(0)', 'not a url'])(
    'ignores %s',
    (href) => {
      expect(classifyLink(link(href), scope).kind).toBe('ignore');
    },
  );

  it.each([
    ['http://localhost:3000/logout', 'Log out'],
    ['http://localhost:3000/delete?id=1', 'Delete my data'],
    ['http://localhost:3000/account?action=delete', 'Settings'],
    ['http://localhost:3000/settings', 'Sign out'],
    ['http://localhost:3000/users/1/remove', ''],
    ['http://localhost:3000/billing/cancel-and-purge', ''],
  ])('skips %s because it looks destructive', (href, text) => {
    const verdict = classifyLink(link(href, text), scope);

    expect(verdict.kind).toBe('skip');
    if (verdict.kind === 'skip') expect(verdict.reason).toContain('destructive');
  });

  it('does not mistake clearance or removed for destructive', () => {
    expect(
      classifyLink(link('http://localhost:3000/clearance-sale', 'Clearance sale'), scope).kind,
    ).toBe('visit');
    expect(classifyLink(link('http://localhost:3000/removed-items'), scope).kind).toBe('visit');
  });

  it('skips another site and says which one', () => {
    const verdict = classifyLink(link('https://example.com/docs', 'Docs'), scope);

    expect(verdict.kind).toBe('skip');
    if (verdict.kind === 'skip') expect(verdict.reason).toContain('https://example.com');
  });

  it('skips a download link', () => {
    expect(classifyLink(link('http://localhost:3000/export', 'Export', true), scope).kind).toBe(
      'skip',
    );
  });

  it('skips an API route because it is not a page', () => {
    const verdict = classifyLink(link('http://localhost:3000/api/products'), scope);

    expect(verdict.kind).toBe('skip');
    if (verdict.kind === 'skip') expect(verdict.reason).toContain('API');
  });

  it.each(['/logo.png', '/app.js', '/styles.css', '/report.pdf'])(
    'ignores the static file %s',
    (path) => {
      expect(classifyLink(link(`http://localhost:3000${path}`), scope).kind).toBe('ignore');
    },
  );
});

describe('normalizeUrl', () => {
  it('drops the fragment and keeps the query', () => {
    expect(normalizeUrl(new URL('http://localhost:3000/a?x=1#top'))).toBe(
      'http://localhost:3000/a?x=1',
    );
  });
});

describe('looksDestructive', () => {
  it('reads the address and the words of the link', () => {
    expect(looksDestructive(new URL('http://localhost:3000/a'), 'Delete')).toBe(true);
    expect(looksDestructive(new URL('http://localhost:3000/a'), 'Read more')).toBe(false);
  });
});
