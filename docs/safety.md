# Safety

Hooligans sends traffic that looks hostile, so this page says plainly what it does, what it never does and where it stops. The decisions behind it are in [0005](decisions/0005-safety-guardrails.md). To report a problem in Hooligans itself, see [SECURITY.md](../SECURITY.md).

## What it is for

Hooligans is a guide that a builder runs on their own machine before deploying. It tests the running app the way a normal user, and a curious stranger, would, and shows the builder what they missed. It is for apps you built or own. It is not a tool for testing other people's apps.

## The one rule

Hooligans never does more than a stranger could do to the app.

## What it does

- **It only tests an app on your own machine.** Version 0.1 refuses any address that is not localhost, 127.0.0.1 or [::1]. Other addresses need an ownership check, which does not exist yet.
- **It looks before it touches.** Stage 1 only reads and always runs. Stages 2 to 4 write junk data or put pressure on the app, so they only run after you say the database behind the app is a dev or test copy, with `--yes` or by answering yes. A scan with no terminal answers no.
- **Every request leaves through one door.** The egress gate resolves the host name, checks the address, connects to that exact address, re-checks every redirect and logs the request. A lint rule keeps network code out of everything else.
- **The browser follows the same rules.** The Scout's browser runs in a clean profile with downloads blocked. It may reach other ports on your own machine and the public internet, never other machines on your network.
- **It keeps to small limits.** The Scout visits at most 30 pages in 60 seconds. Fat Fingers and Vandal send about 2 requests a second and at most 60 requests each. Door Rattler sends at most 10 a second. Brute makes at most 30 attempts a minute in total. The Mob sends 25 users for 30 seconds unless you change that with `--load` and `--duration`, and never more than 200 users. A whole scan stops after 10 minutes or 20,000 requests. Every stage has a circuit breaker.
- **It skips routes that look risky.** Names such as checkout, pay, send, email, sms, invite, generate, chat and webhook are left alone unless you pass `--include-risky`, and routes that look destructive are always left alone.
- **It leaves a trail.** Everything sent is logged in `.hooligans/runs/<runId>/requests.jsonl`, without secrets or request bodies, and the crowd of The Mob as counts for each second. Anything typed into your app carries the marker `hooligans-<runId>`, and the report names it when anything was written.

## What it never does

- It never uses a secret it finds. Secrets are masked in the evidence, the report and the fix prompts, and a service role key is never used.
- It never scans ports or looks for other hosts. It talks to the address you gave, and to a hosted backend such as Supabase only after you confirm it is yours, with GET and HEAD requests.
- It never sends input that deletes or changes data, runs a command, reads a file or calls an internal address. The input only proves that text comes back as markup or that an error message leaks.
- It has no account and no telemetry. Results stay in the run folder on your machine.
- It never says an app is safe. It says what its checks found and what they did not look at.

## Cleaning up

After stages 2 to 4, search your database for `hooligans-` followed by the run id that the report names, and delete those rows. Use a dev or test copy of the database, so there is nothing real to protect and cleaning up is easy.

## Where it stops

- It cannot see calls your app's own server makes, so it cannot know what your server does with what Hooligans sends.
- It cannot know whether a database is production. That is why it asks, and why the question is louder when the Scout sees a hosted backend. If you answer yes about a production database, Hooligans will fill it with junk.
- It cannot see what sits behind localhost. A tunnel or a proxy can point localhost at another machine. That is why the limits, the question and the rule above matter, and why you should only test apps you own.
- WebSocket connections that a page opens are not intercepted yet.
- It cannot stop a copy of the code from removing these guardrails. Guardrails in open source code are a speed bump, not a lock.
- Brute only uses made-up accounts, so it cannot see a lockout that applies to real accounts.
- The numbers from The Mob are relative, because the crowd and the app share one machine.

Every report has a section that lists what Hooligans did not look at, and the README has a map of what is covered and what is not.
