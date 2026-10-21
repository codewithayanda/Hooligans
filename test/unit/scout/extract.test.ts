import { describe, expect, it } from 'vitest';
import {
  isRiskyRoute,
  maskSetCookie,
  parseRawPage,
  riskyRoutes,
  sanitizeHeaders,
  toCallInfo,
  toFormInfo,
} from '../../../src/scout/extract.js';
import { makeMap } from '../../helpers/maps.js';

const fakeKey = ['sk', 'live', 'x'.repeat(24)].join('_');

describe('parseRawPage', () => {
  it('keeps what a well behaved page returns', () => {
    const page = parseRawPage({
      links: [{ href: 'http://localhost:3000/a', text: 'A', download: false }],
      forms: [{ action: '/x', method: 'POST', fields: [{ name: 'email', type: 'email' }] }],
    });

    expect(page.links).toEqual([{ href: 'http://localhost:3000/a', text: 'A', download: false }]);
    expect(page.forms[0]?.fields).toEqual([{ name: 'email', type: 'email' }]);
  });

  it('does not trust a page that returns nonsense', () => {
    expect(parseRawPage('nonsense')).toEqual({ links: [], forms: [] });
    expect(
      parseRawPage({ links: [{ href: 5, text: {}, download: 'yes' }], forms: [] }).links,
    ).toEqual([{ href: '', text: '', download: false }]);
  });

  it('caps how much it takes', () => {
    const links = Array.from({ length: 1000 }, (_, index) => ({
      href: `http://localhost:3000/${index}`,
    }));

    expect(parseRawPage({ links, forms: [] }).links).toHaveLength(500);
  });

  it('drops fields without a name', () => {
    const page = parseRawPage({
      links: [],
      forms: [{ action: '', method: 'get', fields: [{ name: '' }, { name: 'q' }] }],
    });

    expect(page.forms[0]?.fields.map((field) => field.name)).toEqual(['q']);
  });
});

describe('toFormInfo', () => {
  const pageUrl = 'http://localhost:3000/login.html';

  it('resolves the action, upper-cases the method and removes repeated fields', () => {
    const form = toFormInfo(
      {
        action: '/api/login',
        method: 'post',
        fields: [
          { name: 'email', type: 'email' },
          { name: 'email', type: 'email' },
          { name: 'password', type: 'password' },
        ],
      },
      pageUrl,
    );

    expect(form).toEqual({
      page: pageUrl,
      action: 'http://localhost:3000/api/login',
      method: 'POST',
      fields: [
        { name: 'email', type: 'email' },
        { name: 'password', type: 'password' },
      ],
    });
  });

  it('uses the page itself when the form has no action', () => {
    expect(toFormInfo({ action: '', method: '', fields: [] }, pageUrl)?.action).toBe(pageUrl);
  });

  it('ignores a form that does not post to a web address', () => {
    expect(
      toFormInfo({ action: 'javascript:void(0)', method: 'post', fields: [] }, pageUrl),
    ).toBeNull();
  });

  it('hides a token in the action', () => {
    const form = toFormInfo({ action: '/x?token=abc123', method: 'post', fields: [] }, pageUrl);

    expect(form?.action).not.toContain('abc123');
  });
});

describe('toCallInfo', () => {
  it('notes whether the call carried credentials', () => {
    expect(toCallInfo('get', 'http://localhost:3000/a', 200, { Cookie: 'x=1' }).sentAuth).toBe(
      true,
    );
    expect(toCallInfo('get', 'http://localhost:3000/a', 200, { apikey: 'x' }).sentAuth).toBe(true);
    expect(toCallInfo('get', 'http://localhost:3000/a', 200, { accept: '*/*' }).sentAuth).toBe(
      false,
    );
  });

  it('upper-cases the method and hides a token in the address', () => {
    const call = toCallInfo('post', 'http://localhost:3000/a?token=abc123', 204, {});

    expect(call.method).toBe('POST');
    expect(call.url).not.toContain('abc123');
  });
});

describe('maskSetCookie', () => {
  it('keeps the name and the attributes and hides the value', () => {
    expect(maskSetCookie('session=abc123; Path=/; HttpOnly')).toBe(
      'session=[hidden]; Path=/; HttpOnly',
    );
  });
});

describe('sanitizeHeaders', () => {
  it('lower-cases names, drops credentials and hides cookie values', () => {
    const headers = sanitizeHeaders({
      'Content-Type': 'text/html',
      Authorization: 'Bearer abc',
      Cookie: 'a=b',
      'Set-Cookie': 'session=abc123; Path=/\nother=xyz; Secure',
    });

    expect(headers).toEqual({
      'content-type': 'text/html',
      'set-cookie': 'session=[hidden]; Path=/\nother=[hidden]; Secure',
    });
  });

  it('masks anything shaped like a secret', () => {
    expect(sanitizeHeaders({ 'x-debug': `key ${fakeKey}` })['x-debug']).not.toContain(fakeKey);
  });
});

describe('isRiskyRoute', () => {
  it.each([
    '/api/checkout',
    '/api/send-invite',
    '/api/sendInvite',
    '/api/chat',
    '/api/pay',
    '/api/payments/charge',
    '/api/generate-image',
    '/api/email-preferences',
  ])('flags %s', (path) => {
    expect(isRiskyRoute(path)).toBe(true);
  });

  it.each(['/payload', '/api/orders', '/api/products', '/chatter', '/'])(
    'does not flag %s',
    (path) => {
      expect(isRiskyRoute(path)).toBe(false);
    },
  );
});

describe('riskyRoutes', () => {
  it('lists the risky routes of calls and forms once, in order', () => {
    const map = makeMap({
      calls: [
        {
          method: 'POST',
          url: 'http://localhost:3000/api/send-invite',
          status: 200,
          sentAuth: true,
        },
        { method: 'GET', url: 'http://localhost:3000/api/products', status: 200, sentAuth: false },
        {
          method: 'POST',
          url: 'http://localhost:3000/api/checkout?x=1',
          status: 200,
          sentAuth: true,
        },
      ],
      forms: [
        {
          page: 'http://localhost:3000/cart',
          action: 'http://localhost:3000/api/checkout',
          method: 'POST',
          fields: [],
        },
      ],
    });

    expect(riskyRoutes(map)).toEqual(['/api/checkout', '/api/send-invite']);
  });
});
