import { describe, expect, it } from 'vitest';
import { findTargets } from '../../../../src/hooligans/brute/targets.js';
import { makeMap, shopMap } from '../../../helpers/maps.js';

type Field = { name: string; type: string };

const email: Field = { name: 'email', type: 'email' };
const password: Field = { name: 'password', type: 'password' };

function form(action: string, fields: Field[], page = '/', method = 'POST') {
  return {
    page: `http://localhost:3000${page}`,
    action: `http://localhost:3000${action}`,
    method,
    fields,
  };
}

const page = (path: string) => ({ url: `http://localhost:3000${path}`, status: 200, headers: {} });

function kinds(map: ReturnType<typeof makeMap>, includeRisky = false): string[] {
  return findTargets(map, includeRisky).targets.map((target) => `${target.kind} ${target.path}`);
}

describe('findTargets', () => {
  it('finds the login form of the shop, and what to type into it', () => {
    const { targets, pages, risky } = findTargets(shopMap(), false);

    expect(targets).toEqual([
      {
        kind: 'login',
        url: 'http://localhost:3000/api/login',
        path: '/api/login',
        page: 'http://localhost:3000/login.html',
        body: {
          kind: 'form',
          fields: [
            { name: 'email', fill: 'email' },
            { name: 'password', fill: 'password' },
          ],
        },
        browserStatus: null,
      },
    ]);
    expect(pages).toEqual([]);
    expect(risky).toBe(0);
  });

  it('knows a signup form by two password fields, or by its name', () => {
    const map = makeMap({
      forms: [
        form('/api/register', [email, password, { name: 'again', type: 'password' }], '/join'),
        form('/api/signup', [email, password], '/signup.html'),
      ],
    });

    expect(kinds(map)).toEqual(['signup /api/register', 'signup /api/signup']);
  });

  it('knows a password reset form: an email and no password', () => {
    const map = makeMap({
      forms: [form('/api/forgot', [email], '/forgot.html'), form('/api/newsletter', [email], '/')],
    });

    expect(kinds(map)).toEqual(['reset /api/forgot']);
  });

  it('puts logins first, then signups, then resets, and keeps four', () => {
    const map = makeMap({
      forms: [
        form('/api/forgot', [email], '/forgot.html'),
        form('/api/signup', [email, password], '/signup.html'),
        form('/api/login', [email, password], '/login.html'),
        form('/api/login-2', [email, password], '/login.html'),
        form('/api/register', [email, password], '/join'),
      ],
    });

    expect(kinds(map)).toEqual([
      'login /api/login',
      'login /api/login-2',
      'signup /api/signup',
      'signup /api/register',
    ]);
  });

  it('fills each field by what it is, and leaves out what it cannot know', () => {
    const login = form(
      '/api/login',
      [
        email,
        { name: 'user', type: 'text' },
        password,
        { name: 'remember', type: 'checkbox' },
        { name: 'csrf', type: 'hidden' },
        { name: 'go', type: 'submit' },
      ],
      '/login.html',
    );
    const signup = form(
      '/api/signup',
      [email, { name: 'name', type: 'text' }, password],
      '/signup.html',
    );
    const [first, second] = findTargets(makeMap({ forms: [login, signup] }), false).targets;

    expect(first?.body).toEqual({
      kind: 'form',
      fields: [
        { name: 'email', fill: 'email' },
        { name: 'user', fill: 'username' },
        { name: 'password', fill: 'password' },
      ],
    });
    expect(second?.body).toEqual({
      kind: 'form',
      fields: [
        { name: 'email', fill: 'email' },
        { name: 'name', fill: 'text' },
        { name: 'password', fill: 'password' },
      ],
    });
  });

  it('leaves out other sites, uploads, the APIs of Supabase, forms that only read and destructive routes', () => {
    const map = makeMap({
      forms: [
        { ...form('/x', [email, password]), action: 'https://other.example/login' },
        form('/api/login', [password, { name: 'file', type: 'file' }]),
        form('/auth/v1/token', [email, password]),
        form('/api/login', [email, password], '/login.html', 'GET'),
        form('/api/logout-everywhere', [email, password]),
      ],
    });

    expect(kinds(map)).toEqual([]);
  });

  it('leaves out routes that look risky, unless they were asked for', () => {
    const map = makeMap({ forms: [form('/api/send-login', [email, password], '/login.html')] });

    expect(findTargets(map, false)).toMatchObject({ targets: [], risky: 1 });
    expect(kinds(map, true)).toEqual(['login /api/send-login']);
  });

  it('counts a route once, however many pages have the form', () => {
    const map = makeMap({
      forms: [
        form('/api/login', [email, password], '/login.html'),
        form('/api/login', [email, password], '/'),
      ],
    });

    expect(kinds(map)).toEqual(['login /api/login']);
  });
});

describe('findTargets, pages that need a browser', () => {
  it('finds a login page that has no form to read, and skips the pages that are covered', () => {
    const map = makeMap({
      forms: [form('/api/login', [email, password], '/login.html')],
      pages: [
        page('/login.html'),
        page('/app-login.html'),
        page('/blog-index'),
        page('/about'),
        { ...page('/login'), url: 'https://other.example/login' },
      ],
    });

    expect(findTargets(map, false).pages).toEqual(['http://localhost:3000/app-login.html']);
  });

  it('knows the login page of a single page app, whose form reads as a GET', () => {
    const map = makeMap({
      forms: [{ ...form('/login', [email, password], '/login'), method: 'GET' }],
      pages: [page('/login')],
    });
    const found = findTargets(map, false);

    expect(found.targets).toEqual([]);
    expect(found.pages).toEqual(['http://localhost:3000/login']);
  });

  it('keeps at most two pages', () => {
    const map = makeMap({ pages: [page('/login'), page('/signin'), page('/log-in')] });

    expect(findTargets(map, false).pages).toEqual([
      'http://localhost:3000/login',
      'http://localhost:3000/signin',
    ]);
  });
});
