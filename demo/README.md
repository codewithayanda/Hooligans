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

Every hooligan gets a file in `src/routes` named after it, with the vulnerable and the fixed behaviour side by side. Right now that is Pickpocket (public files and keys) and Loudmouth (headers and cookies). The others arrive with their hooligans.

The pages in `public` are plain HTML. The page script renders the product list in the browser, posts a tracking call on load and tries to fetch a private address, so the Scout has a single-page app to map and the browser guard has something to block.

The fake keys are built when the server runs, so no key-shaped text sits in the source.
