# 0004: The Scout and logging in

Status: accepted, 2026-10-21

## Context

Almost every hooligan needs to know what the app contains: its pages, forms and API calls. Many apps are single-page apps, so the map needs a real browser. Many apps also sit behind a login, and completing signup and login automatically is fragile: hosted auth sends real email, and captchas, OAuth and MFA get in the way.

## Decision

A Scout builds an app map before any hooligan runs. Hooligans read the map and never crawl on their own.

- The Scout is read-only. It follows same-origin links, never submits a form, never clicks a button and skips links that look destructive. It is capped at about 30 pages, depth 3 and 60 seconds.
- The map holds pages with their headers, forms, network calls, assets, cookies, leads from robots.txt, the sitemap and any OpenAPI file, the external hosts the app talks to, the stack, whether it is a dev server or a production build, and a coverage summary.
- Dev servers are detected, and the report says that numbers from a dev server are relative.
- The Scout drives the Edge or Chrome that is already installed, through playwright-core, so nothing is downloaded.
- Logging in is done once, by hand. `hooligans login --as alice` opens a visible browser, the user signs in the usual way, and Hooligans saves the session (cookies and local storage) under .hooligans/sessions. No passwords are stored and there is no automatic signup. The folder carries its own .gitignore so nothing in it is committed.
- Sessions arrive in version 0.2, before Snooper. The Scout accepts an optional session from the start.

## Consequences

- The report always says what the Scout did not see: anything behind buttons or a login.
- Each hooligan can be tested with a fixture map and no browser.
- Sessions are secrets. The login command tells the user to use a throwaway test account on a dev or staging copy.
