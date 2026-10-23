# 0010: How stages 3 and 4 press

Status: accepted, 2026-10-22

## Context

Brute and The Mob are the two hooligans that put pressure on an app. Brute sends repeated wrong logins, and The Mob sends a growing crowd of visitors. Both can leave junk behind or slow the app down, and a scan runs on a machine the user may be working on. So the rules from 0005 apply in full: never do more than a stranger could, ask first, and stop at the first sign of trouble.

## Decision

Consent and limits

- Stages 3 and 4 need the same confirmation as stage 2: the user says the database behind the app is a dev or test copy, with --yes or by answering yes. Without it both are skipped and the report says why.
- Both only talk to the address the user gave. A login that sends its request somewhere else, such as another port or a service like Supabase Auth, Clerk or Firebase, is left alone, and the report says so.
- Brute sends at most 30 attempts a minute, in total. The Mob never goes past the number of users that --load allows (25 by default, 200 at most), and it only reads.
- Both stop at the first sign that the app is pushing back or giving way, and both stop when the budget for the whole scan runs out.
- Everything Brute types is made up and contains the hooligans-runId marker, so the junk can be found.

Brute

- It tries a login (30 wrong attempts), a signup and a password reset (10 each), and at most four routes. Each attempt uses a made-up person and a random password.
- It finds the routes in the forms the Scout saw. A login page whose form cannot be read, as in a single page app, is opened once in a browser that follows the Scout's rules. Made-up values are typed and the form is submitted once. The request that goes out is noted, and Brute repeats its shape through the gate. A plain request has to get the same status the browser got, or the route is not tested.
- It reports one thing: nothing pushed back. The app pushes back with a 429, a 423, a Retry-After header, words that say so (too many attempts, locked, captcha), a redirect to a challenge page, an answer that changes to a refusal, or answers that keep getting slower.
- A route whose first answer shows that the request never got as far as the password (403, 404, 405, a missing security token, a server error) is not tested, and the report lists it.
- A login that takes every attempt is high with medium confidence, because Brute only uses made-up accounts and cannot see a lockout that applies to real accounts. A signup or a reset that takes every attempt is low with low confidence, so it is listed as worth a look and costs nothing.

The Mob

- The crowd asks for the first page, up to six more pages and up to eight calls the pages make on their own. A call counts three times as much as a page, because that is where an app usually gives way. Routes that look risky or destructive are left out.
- Each route is asked for once, alone, first. A route that fails for a single visitor is left out.
- The crowd grows in steps (1, 2, 5, 10, 15, 25 and on up to the peak) over the length of --duration, with at least a second at each step. A user waits 0.2 to 0.6 seconds between requests.
- A step is a break when at least 3 requests and at least 5 in 100 failed: a server error, a timeout or a dropped connection. The Mob stops there. It also stops when the app answers 429 at least 3 times in a step, which is a limit working and not a failure. After a break it waits a few seconds and asks once whether the app is back.
- Only clear failures cost points: errors at 10 users or fewer, on a production build. Errors on a dev server, errors above 10 users and a build Hooligans cannot name are listed as worth a look. A slowdown is always worth a look, because speed on one machine is relative.
- The crowd is written to the request log as counts for each second, not a line for each request.
- The report shows a chart and a table of each step, and the terminal summary has a line about it.

## Consequences

- Brute cannot test a login that needs a token only a browser has, a login that another site handles, or a lockout that applies to real accounts. The report lists each of these.
- The numbers from The Mob are relative, because the crowd and the app share one machine. They show what gives way first, not how many real users the app can take.
- A full scan takes a few minutes. Brute is slow on purpose, at 30 attempts a minute, and The Mob runs for as long as --duration says.
- The reality check on real apps decides whether these limits and thresholds are too strict or too loose, and each change comes with a test.
