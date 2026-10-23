import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import { cleanText } from '../../util/text.js';
import { examples, finish, joinWords, safeToken } from '../_shared/finding.js';

const HOOLIGAN = 'loudmouth';
const CSP = 'Content-Security-Policy';

export type CorsAnswer = { path: string; credentials: boolean };

/** How to set a header, in the words of the stack the Scout recognised. */
function howToSet(map: AppMap, header: string): string {
  switch (map.stack.framework) {
    case 'nextjs':
      return `In next.config.js, add the ${header} header in the headers() function, for every route.`;
    case 'express':
      return `Set the ${header} header on every response, for example with the helmet middleware or with res.setHeader before your routes.`;
    case 'vite':
      return `Vite only builds your files, so set the ${header} header where the built site is served.`;
    case 'angular':
      return `Angular only builds your files, so set the ${header} header where the built site is served.`;
    default:
      return `Set the ${header} header on every response, in your server or hosting settings.`;
  }
}

/** What to do with the file that Netlify and Cloudflare Pages read, in the build of each tool. */
function copyTip(framework: string | undefined): string {
  switch (framework) {
    case 'vite':
      return ' With Vite, put that file in the public folder so it is copied to the top of the build.';
    case 'angular':
      return ' With Angular, add that file to the assets list in angular.json so it is copied to the top of the build.';
    default:
      return '';
  }
}

/** Where the header goes on the common hosts. A scan only sees localhost, so it cannot know which. */
function onHosts(map: AppMap, header: string): string {
  const { framework } = map.stack;
  if (framework === 'nextjs' || framework === 'express') return '';

  const github =
    header === CSP
      ? 'GitHub Pages cannot set headers, but a meta tag with http-equiv="Content-Security-Policy" in index.html can carry the policy, without frame-ancestors.'
      : 'GitHub Pages cannot set this header at all, so a site hosted there needs another host, or a service in front of it such as Cloudflare.';

  return ` Where that is depends on the host. On Netlify or Cloudflare Pages, add a file named _headers to the folder that gets published, with the line /* and then the header on an indented line below it.${copyTip(framework)} On Vercel, add the header to the headers list in vercel.json. With your own server, such as nginx or Apache, add it to the server config. ${github}`;
}

/** The same advice in one line for the report, for apps with no server of their own. */
function hostsNote(map: AppMap, header: string): string {
  const { framework } = map.stack;
  if (framework === 'nextjs' || framework === 'express') return '';

  const github =
    header === CSP ? 'GitHub Pages only takes a meta tag' : 'GitHub Pages cannot set it at all';
  return ` Where you set it depends on your host: Netlify and Cloudflare Pages read a _headers file, Vercel reads vercel.json, and ${github}.`;
}

function lacks(count: number, what: string): string {
  return count === 1
    ? `This page does not send ${what}.`
    : `None of these ${count} pages send ${what}.`;
}

function cookieWords(names: readonly string[]): { subject: string; verb: string } {
  const list = joinWords(names.map((name) => safeToken(name)));
  return names.length === 1
    ? { subject: `The cookie ${list}`, verb: 'is' }
    : { subject: `The cookies ${list}`, verb: 'are' };
}

export function missingCsp(map: AppMap, paths: string[]): Finding {
  return finish(
    {
      id: 'loudmouth.missing-csp',
      hooligan: HOOLIGAN,
      title: 'No Content-Security-Policy header',
      severity: 'medium',
      category: 'security',
      confidence: 'high',
      rootCause: 'loudmouth:header:content-security-policy',
      affected: paths,
      evidence: lacks(paths.length, 'a Content-Security-Policy header'),
      fix: `Add a Content-Security-Policy header that only allows scripts from your own site. It limits the damage if someone manages to get a script onto one of your pages.${hostsNote(map, CSP)}`,
      problem: `The app does not send a Content-Security-Policy header on its pages${examples(paths)}.`,
      change: `${howToSet(map, CSP)} Start with a policy that only allows scripts and styles from your own site, and loosen it only where something breaks.${onHosts(map, CSP)}`,
      keep: 'Every page must still load its own scripts, styles and images.',
    },
    map,
  );
}

export function missingFrameProtection(map: AppMap, paths: string[]): Finding {
  return finish(
    {
      id: 'loudmouth.missing-frame-protection',
      hooligan: HOOLIGAN,
      title: 'Other sites can show your pages inside their own page',
      severity: 'medium',
      category: 'security',
      confidence: 'high',
      rootCause: 'loudmouth:header:frame-protection',
      affected: paths,
      evidence: lacks(paths.length, 'an X-Frame-Options header or a frame-ancestors rule'),
      fix: `Send X-Frame-Options: DENY, or a Content-Security-Policy with frame-ancestors 'none', so other sites cannot put your pages in a frame and trick visitors into clicking.${hostsNote(map, 'X-Frame-Options')}`,
      problem: `The app can be shown inside a frame on any other site, because it sends no X-Frame-Options header and no frame-ancestors rule${examples(paths)}.`,
      change: `${howToSet(map, 'X-Frame-Options')} Use DENY, or SAMEORIGIN if your own pages frame each other.${onHosts(map, 'X-Frame-Options')}`,
      keep: 'If a page is meant to be embedded on another site, allow only that site with frame-ancestors.',
    },
    map,
  );
}

export function missingNosniff(map: AppMap, paths: string[]): Finding {
  return finish(
    {
      id: 'loudmouth.missing-nosniff',
      hooligan: HOOLIGAN,
      title: 'Browsers are allowed to guess what your files are',
      severity: 'low',
      category: 'security',
      confidence: 'high',
      rootCause: 'loudmouth:header:x-content-type-options',
      affected: paths,
      evidence: lacks(paths.length, 'an X-Content-Type-Options header'),
      fix: `Send X-Content-Type-Options: nosniff so browsers trust the file type you declare instead of guessing it.${hostsNote(map, 'X-Content-Type-Options')}`,
      problem: `The app does not send an X-Content-Type-Options header${examples(paths)}.`,
      change: `${howToSet(map, 'X-Content-Type-Options')} Use the value nosniff.${onHosts(map, 'X-Content-Type-Options')}`,
      keep: 'Pages, scripts and styles must still load.',
    },
    map,
  );
}

export function serverBanner(map: AppMap, paths: string[], value: string): Finding {
  const change =
    map.stack.framework === 'express'
      ? 'Call app.disable("x-powered-by"), or use the helmet middleware, which removes the header.'
      : map.stack.framework === 'nextjs'
        ? 'Set poweredByHeader to false in next.config.js.'
        : 'Remove the X-Powered-By header from every response.';

  return finish(
    {
      id: 'loudmouth.server-banner',
      hooligan: HOOLIGAN,
      title: 'Your server announces what it runs on',
      severity: 'low',
      category: 'security',
      confidence: 'high',
      rootCause: 'loudmouth:header:x-powered-by',
      affected: paths,
      evidence: `The X-Powered-By header says ${cleanText(value, 40)}.`,
      fix: 'Remove the X-Powered-By header. It tells strangers which software to look up attacks for.',
      problem: 'Responses carry an X-Powered-By header that names the server framework.',
      change,
      keep: 'Nothing else should change.',
    },
    map,
  );
}

export function corsReflectsOrigin(
  map: AppMap,
  answers: readonly CorsAnswer[],
  probeOrigin: string,
): Finding {
  const credentials = answers.some((answer) => answer.credentials);
  const paths = answers.map((answer) => answer.path);
  const first = paths[0] ?? '/';

  return finish(
    {
      id: 'loudmouth.cors-reflects-origin',
      hooligan: HOOLIGAN,
      title: credentials
        ? 'Any website can read answers meant for your logged-in users'
        : 'Your app answers any website that asks, from a browser',
      severity: credentials ? 'high' : 'low',
      category: 'security',
      confidence: credentials ? 'high' : 'medium',
      rootCause: 'loudmouth:cors:reflects-origin',
      affected: paths,
      evidence: `GET ${first} with the made-up origin ${probeOrigin} came back allowing that origin${credentials ? ' and allowing cookies' : ''}.`,
      fix: credentials
        ? 'Only allow your own site, and any site you trust, in the CORS settings, and never echo back whatever origin asks. Otherwise a site you do not control can read answers meant for your logged-in users.'
        : 'List the sites you trust in the CORS settings instead of allowing every origin, unless this route is public on purpose.',
      problem: `The app accepts requests from any website origin${credentials ? ' and allows cookies with them' : ''}${examples(paths)}. A made-up origin was accepted.`,
      change:
        'Replace the CORS setting that allows every origin with a fixed list of the sites that should be allowed, such as your own front end. Only turn credentials on for sites on that list.',
      keep: 'Your own front end must still be able to call the API.',
    },
    map,
  );
}

export function corsWildcard(map: AppMap, answers: readonly CorsAnswer[]): Finding {
  const credentials = answers.some((answer) => answer.credentials);
  const paths = answers.map((answer) => answer.path);
  const first = paths[0] ?? '/';

  return finish(
    {
      id: 'loudmouth.cors-wildcard',
      hooligan: HOOLIGAN,
      title: credentials
        ? 'Your CORS settings welcome every website and also claim to allow cookies'
        : 'Any website can call your API from a browser',
      severity: 'low',
      category: 'security',
      confidence: credentials ? 'high' : 'low',
      rootCause: 'loudmouth:cors:wildcard',
      affected: paths,
      evidence: `GET ${first} sends Access-Control-Allow-Origin: *${credentials ? ' together with Access-Control-Allow-Credentials: true, a mix browsers refuse to honour' : ''}.`,
      fix: credentials
        ? 'List the sites you trust instead of *. Browsers ignore cookies when the answer says *, so this setting either does nothing or hides a mistake.'
        : 'This is fine for an API that is public on purpose. If it is only meant for your own front end, list your own site instead of *.',
      problem: `The app answers every origin with Access-Control-Allow-Origin: *${credentials ? ' and also sets Access-Control-Allow-Credentials: true' : ''}${examples(paths)}.`,
      change:
        'Replace * in the CORS settings with the list of sites that should be allowed, such as your own front end, unless the route is public on purpose.',
      keep: 'Your own front end must still be able to call the API.',
    },
    map,
  );
}

export function cookieReadable(map: AppMap, names: string[]): Finding {
  const { subject, verb } = cookieWords(names);

  return finish(
    {
      id: 'loudmouth.cookie-readable-by-scripts',
      hooligan: HOOLIGAN,
      title: 'Your session cookie can be read by scripts on the page',
      severity: 'medium',
      category: 'security',
      confidence: 'high',
      rootCause: 'loudmouth:cookie:http-only',
      affected: names.map((name) => `${safeToken(name)} (cookie)`),
      evidence: `${subject} ${verb} not marked HttpOnly, so any script running on your page can read ${names.length === 1 ? 'it' : 'them'}.`,
      fix: 'Mark the session cookie HttpOnly so scripts cannot read it. If someone ever manages to run a script on your page, they could otherwise take over the session.',
      problem: `${subject} ${verb} not marked HttpOnly, so scripts on the page can read ${names.length === 1 ? 'it' : 'them'}.`,
      change:
        'Set the HttpOnly flag on the session cookie where it is created. Your session or auth library usually has an option for it.',
      keep: 'Login must keep working. If your own front end reads this cookie on purpose, move that data somewhere else first.',
    },
    map,
  );
}

export function cookieNotSecure(map: AppMap, names: string[]): Finding {
  const { subject, verb } = cookieWords(names);

  return finish(
    {
      id: 'loudmouth.cookie-not-secure',
      hooligan: HOOLIGAN,
      title: 'Your session cookie is also sent over plain http',
      severity: 'medium',
      category: 'security',
      confidence: 'high',
      rootCause: 'loudmouth:cookie:secure',
      affected: names.map((name) => `${safeToken(name)} (cookie)`),
      evidence: `${subject} ${verb} not marked Secure, so the browser also sends ${names.length === 1 ? 'it' : 'them'} over unencrypted http.`,
      fix: 'Mark the session cookie Secure so the browser only sends it over https.',
      problem: `${subject} ${verb} not marked Secure, so the browser can send ${names.length === 1 ? 'it' : 'them'} over plain http.`,
      change:
        'Set the Secure flag on the session cookie where it is created, and redirect http to https.',
      keep: 'Login must keep working on https.',
    },
    map,
  );
}
