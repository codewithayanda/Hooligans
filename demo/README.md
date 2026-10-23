# Hooligans demo

A small shop that is weak on purpose. It exists so Hooligans has something to test against, and so every check can be proved both ways: it must find the problem in the vulnerable twin and stay quiet on the fixed one.

**Never deploy it.** It leaks fake keys, serves a fake `.env`, sends no security headers in its vulnerable mode and tries to reach private addresses from the page. It only listens on 127.0.0.1.

## Run it

```bash
npm run demo
```

| Twin | Address |
| --- | --- |
| Vulnerable | http://127.0.0.1:4001 |
| Fixed | http://127.0.0.1:4002 |

## What is in it

Every hooligan gets a file in `src/routes` named after it, with the vulnerable and the fixed behaviour side by side:

| Hooligan | What the vulnerable twin gets wrong | What the fixed twin does |
| --- | --- | --- |
| Pickpocket | A fake secret key in the script, a fake `.env`, a `.git` folder and a source map | Serves none of them |
| Loudmouth | No security headers, a wide open CORS policy and a readable session cookie | Sends the headers and a safe cookie |
| Door Rattler | A fake Supabase style table, a private route and a debug page that anyone can read | Answers with no rows or a 401, and has no debug page |
| Fat Fingers | A very long name crashes the contact form and shows a stack trace | Checks the length and answers with a short message |
| Vandal | The search page shows what you type as raw HTML and leaks a database error | Escapes the text |
| Brute | Login, signup, password reset and a login that sends JSON from a page script take every attempt | Answers 429 with a Retry-After header after 5 attempts a minute |
| The Mob | Three calls share a pool of 3 database connections and turn requests away when it is full | A pool of 8 connections, where a request waits its turn |

The pages in `public` are plain HTML. The page script renders the product list in the browser, posts a tracking call on load and tries to fetch a private address, so the Scout has a single-page app to map and the browser guard has something to block.

The fake keys are built when the server runs, so no key-shaped text sits in the source.
