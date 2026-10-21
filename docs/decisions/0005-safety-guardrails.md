# 0005: Safety and guardrails

Status: accepted, 2026-10-21

## Context

Hooligans sends hostile-looking traffic, so three things can go wrong:

- An accident. Localhost is not a sandbox: many apps talk to the same hosted backend as production, so a scan of localhost can write junk into real data or trigger real emails.
- A scan that wanders somewhere it should not, through redirects, internal addresses or hostname tricks.
- Misuse against a site the user does not own.

Guardrails in open source code are a speed bump, not a lock.

## Decision

The principle: Hooligans never does more than a stranger could do to the app.

1. Version 0.1 only tests apps on the user's own machine (localhost, 127.0.0.1 and [::1]). Anything else is refused. Remote targets come later, with an ownership check.
2. Every request goes through one gate in the code, not a local proxy. The gate resolves the hostname, checks the resolved address, connects to that exact address, re-checks every redirect and logs the request. A lint rule keeps network access out of everything else.
3. The Scout's browser may reach the public internet and other ports on the user's own machine, because a separate API port is common. It may never reach other machines on the user's network: private, link-local and metadata addresses. It runs in a clean profile with downloads blocked.
4. Stage 1 always runs. Stages 2 to 4 write junk data, so they only run after the user confirms that the database behind the app is a dev or test copy.
5. A secret that is found is masked and never used or tested. A service role key is never used. Probes of a third-party backend are read-only, use the public key the app already ships and need the user's confirmation. Brute uses made-up identities and random wrong passwords. There is no port scanning and no host discovery.
6. Payloads only prove reflection or error leaks. Nothing deletes or changes data, runs a command, reads a file or calls internal addresses.
7. The Mob ramps until the first break and then stops. Every stage has a circuit breaker and a budget. Defaults: the Scout 30 pages and 60 seconds, Fat Fingers and Vandal about 2 requests per second, Brute 30 attempts a minute and stopping at the first 429, The Mob up to 25 users for 30 seconds (raised with --load, ceiling 200), and 10 minutes and 20,000 requests for a whole scan.
8. Routes that look like they have side effects (checkout, pay, send, email, sms, invite, generate, chat, webhook) are skipped unless the user opts in.
9. Everything sent is logged per run, without secrets or request bodies. Anything typed into the app carries a hooligans-runId marker so it can be found and cleaned up. Reports mask secrets. There is no telemetry.

## Consequences

- The gate cannot see calls the app's own server makes, cannot know whether a database is production and cannot stop a fork from removing the guardrails. That is why Hooligans asks, skips risky routes and keeps its own power small.
- docs/safety.md should say this plainly.
