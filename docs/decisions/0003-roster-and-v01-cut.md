# 0003: The roster and the first version

Status: accepted, 2026-10-21

## Context

The idea needs a set of checks that are easy to explain, easy to test and pleasant to read about. Each check should have one job and one place in the code.

## Decision

Each check is a hooligan with one job. They run in four stages, from safest to most aggressive.

Stage 1, look only (safe against anything):

- Pickpocket looks through the app's public files for keys, secrets and a stray .env or .git folder.
- Loudmouth checks what the app says too loudly: missing security headers, open CORS and weak cookies.

Stage 2, poke (odd requests that leave junk data behind):

- Door Rattler tries the back doors: open Supabase or Firebase data, routes that answer without a login, admin and debug pages.
- Fat Fingers types clumsy input: empty, huge, emoji and negative numbers.
- Vandal sprays scripts and SQL into inputs to see what sticks.
- Snooper (version 0.2) checks whether one user can see another user's data.

Stage 3, pressure:

- Brute hammers login, signup and password reset to see whether anything slows it down.
- Double Tapper (0.2) fires the same action twice at once.
- Slowpoke (0.2) acts like a user on a slow connection.

Stage 4, flood:

- The Mob ramps up concurrent users and reports what breaks first.

Later: Wallet Drainer, which finds open endpoints that could run up a paid API bill.

Version 0.1 contains Pickpocket, Loudmouth, Door Rattler, Fat Fingers, Vandal, Brute and The Mob. None of them needs a login.

## Consequences

- Each hooligan is one folder in src/hooligans, with its findings and fix prompts inside it.
- Each hooligan has a vulnerable and a fixed twin in the demo app, so it is tested both for finding the problem and for staying quiet when there is none.
- A wiring test fails if a hooligan is written but not registered.
