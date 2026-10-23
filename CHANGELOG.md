# Changelog

All notable changes to Hooligans are listed here. The format follows Keep a Changelog.

## [Unreleased]

### Added

- Project structure, tooling, CI and the decision records.
- Scoring (merge by root cause, tier caps, verdicts), fix prompt builders, and the report: a terminal summary, one self-contained HTML file and a versioned JSON file.
- `hooligans report --sample` shows a report with made-up findings, and `hooligans list` shows the roster.
- The demo app, a weak shop with a vulnerable and a fixed twin, starting with the Pickpocket and Loudmouth routes.
- The Scout: a read-only browser pass that maps pages, forms, calls, assets, cookies and leads, and works out the stack and whether the app is a dev server. `hooligans doctor` checks that it can run.
- The guardrails: a scope check that only accepts an app on your own machine, the egress gate every request will go through, an audit log without secrets, budgets, a circuit breaker and the consent questions.
- Pickpocket and Loudmouth, the first two hooligans, and `hooligans scan`: it maps the app, runs stage 1 and writes the report, the app map and the request log to `.hooligans/runs`. A report says how many of the seven hooligans ran.
- The registry, and a wiring test that fails when a hooligan is written but not registered.
- Stage 2, which only runs after you confirm with `--yes` (or by answering yes) that the database behind the app is a dev or test copy. Without that it is skipped and the report says so.
- Door Rattler reads what a stranger could read: a Supabase table behind the app's public key, a Firebase Realtime Database, routes with private sounding names that answer without a login, and a few well-known debug pages. It keeps column names and never row values.
- Fat Fingers types clumsy input into the forms and search fields the Scout saw, and reports stack traces, server errors, hangs and an app that stops answering. It leaves login forms, uploads and risky routes alone.
- Vandal types a harmless marker and a stray quote into the same fields, and reports input that comes back as raw markup and database errors that leak.
- The demo has a fake Supabase style table, a private route, a debug page, a crashing contact form and a search page, each with a vulnerable and a fixed twin.
- `--include-risky` and `--allow-host` now reach the hooligans. Everything typed carries the hooligans-runId marker, and the report names it when anything was written.
- Brute checks whether a login, a signup and a password reset push back after repeated wrong attempts, with made-up accounts and random passwords, at most 30 attempts a minute. It stops at the first 429 or other sign of a limit. A login that a single page app sends from JavaScript is learned by submitting its form once in a browser.
- The Mob sends a growing crowd of visitors, reading pages and calls only, and stops at the first step where requests fail or the app answers 429. The report shows a chart and a table of each step, and the terminal summary has a line about it. `--load` and `--duration` now set the size and the length of the run.
- The demo has a login with and without a limit, a signup, a password reset, a login that sends JSON from a page script, and a small pool of connections that gives way under a crowd in the vulnerable twin.

### Changed

- Pickpocket recognises a Supabase secret key, and the Scout recognises the newer address of a Firebase Realtime Database.

### Fixed

- The Scout no longer stalls on an app whose scripts carry a large inline source map, which is what an Angular dev server sends. Finding a Supabase or Firebase address in a script now takes time in proportion to the size of the script.
