import type { AppMap, FormInfo } from '../../core/app-map.js';
import { looksDestructive } from '../../scout/crawl.js';
import { isRiskyRoute } from '../../scout/extract.js';
import { parse } from '../_shared/files.js';

export type Kind = 'login' | 'signup' | 'reset';

export type Fill = 'email' | 'username' | 'password' | 'text' | 'fixed';

export type FieldSpec = { name: string; fill: Fill; value?: string };

/** How the body of one attempt is built. A JSON body keeps its shape and swaps two placeholders. */
export type Body = { kind: 'form'; fields: FieldSpec[] } | { kind: 'json'; text: string };

export type Target = {
  kind: Kind;
  url: string;
  path: string;
  /** The page the form is on. It goes out as the Referer, the way a browser would send it. */
  page: string;
  body: Body;
  /** What a browser got for the same request, when the target was learned from one. */
  browserStatus: number | null;
};

export type Found = {
  targets: Target[];
  /** Pages that look like a login but have no form Brute can read. A browser has to try them. */
  pages: string[];
  /** Forms left alone because their route looks like it has side effects. */
  risky: number;
};

/** Routes tried at most. Most apps have a login, a signup and a reset, and a few have two logins. */
export const MAX_TARGETS = 4;
const MAX_PAGES = 2;
const ORDER: readonly Kind[] = ['login', 'signup', 'reset'];

const SIGNUP = /sign-?up|register|create-?(?:an-?)?account|join|new-?account/i;
const RESET = /forgot|reset|recover|lost-?password|password-?help/i;
const LOGIN_PAGE = /(?:^|[^a-z])(?:log-?in|sign-?in)(?:[^a-z]|$)/i;
const MANAGED_PATH = /^\/(?:rest|auth|storage|functions)\/v1\/|^\/_next\/|^\/@|^\/node_modules\//;

/** Fields whose value Hooligans cannot know, so they are not sent. */
const NO_VALUE = new Set([
  'hidden',
  'checkbox',
  'radio',
  'submit',
  'button',
  'image',
  'reset',
  'file',
  'select-one',
  'select-multiple',
]);

type Field = FormInfo['fields'][number];

/** What a form is for, judged by its fields and the words in its address and its page. */
function kindOf(fields: readonly Field[], where: string): Kind | null {
  const passwords = fields.filter((field) => field.type === 'password').length;
  const hasEmail = fields.some((field) => field.type === 'email' || /mail/i.test(field.name));

  if (passwords >= 2) return 'signup';
  if (passwords === 1) return SIGNUP.test(where) ? 'signup' : 'login';
  return hasEmail && RESET.test(where) ? 'reset' : null;
}

function fillOf(field: Field, kind: Kind): Fill {
  if (field.type === 'password') return 'password';
  if (field.type === 'email' || /mail/i.test(field.name)) return 'email';
  return kind === 'login' ? 'username' : 'text';
}

function specsFor(fields: readonly Field[], kind: Kind): FieldSpec[] {
  return fields
    .filter((field) => !NO_VALUE.has(field.type))
    .map((field) => ({ name: field.name, fill: fillOf(field, kind) }));
}

/**
 * The login, signup and password reset forms on the app itself, and the pages that look like a
 * login but have no form to read, such as the login page of a single-page app.
 */
export function findTargets(map: AppMap, includeRisky: boolean): Found {
  const origin = new URL(map.entry).origin;
  const found = new Map<string, Target>();
  const covered = new Set<string>();
  let risky = 0;

  for (const form of map.forms) {
    const action = parse(form.action);
    const page = parse(form.page);
    if (!action || !page || form.method !== 'POST') continue;
    if (action.origin !== origin || MANAGED_PATH.test(action.pathname)) continue;
    if (form.fields.some((field) => field.type === 'file') || looksDestructive(action, ''))
      continue;

    const kind = kindOf(form.fields, `${action.pathname} ${page.pathname}`);
    if (!kind) continue;

    if (isRiskyRoute(action.pathname) && !includeRisky) {
      risky += 1;
      continue;
    }

    const key = `${kind} ${action.pathname}`;
    if (found.has(key)) continue;

    covered.add(form.page);
    found.set(key, {
      kind,
      url: `${origin}${action.pathname}${action.search}`,
      path: action.pathname,
      page: form.page,
      body: { kind: 'form', fields: specsFor(form.fields, kind) },
      browserStatus: null,
    });
  }

  const targets = [...found.values()]
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .slice(0, MAX_TARGETS);

  const pages = [...new Set(map.pages.map((page) => page.url))]
    .filter((address) => {
      const url = parse(address);
      return (
        url !== null &&
        url.origin === origin &&
        LOGIN_PAGE.test(url.pathname) &&
        !covered.has(address)
      );
    })
    .slice(0, MAX_PAGES);

  return { targets, pages, risky };
}
