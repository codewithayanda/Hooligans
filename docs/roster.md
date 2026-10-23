# The roster

Every hooligan has one job. This page lists them all, built and planned. A test checks that each name and job below matches `src/core/roster.ts`, so the page cannot drift from the code, and `hooligans list` prints the same roster.

## Stages

A scan runs in four stages, in order. Stage 1 always runs. Stages 2 to 4 write junk data or put pressure on the app, so they only run after you confirm that the database behind the app is a dev or test copy.

| Stage | Name | What happens |
| --- | --- | --- |
| 1 | Look only | Reads what the app already shows. |
| 2 | Poke | Sends odd input through the app and leaves junk data behind. |
| 3 | Pressure | Tries login and signup again and again, within limits, to see whether anything pushes back. |
| 4 | Flood | Ramps up a crowd of users until something breaks. |

## The roster

| Hooligan | Stage | Since | Its job |
| --- | --- | --- | --- |
| Pickpocket | 1 | 0.1 | Looks through your public files for keys, secrets and a stray .env or .git folder. |
| Loudmouth | 1 | 0.1 | Checks what your app says too loudly: missing security headers, open CORS, weak cookies. |
| Door Rattler | 2 | 0.1 | Tries the back doors: open Supabase or Firebase data, routes that answer without a login. |
| Fat Fingers | 2 | 0.1 | Types clumsy input: empty, huge, emoji and negative numbers. |
| Vandal | 2 | 0.1 | Sprays scripts and SQL into inputs to see what sticks. |
| Snooper | 2 | 0.2 | Checks whether one user can see another user's data. |
| Wallet Drainer | 2 | later | Finds open endpoints that could run up a paid API bill. |
| Brute | 3 | 0.1 | Hammers login, signup and password reset to see whether anything slows it down. |
| Double Tapper | 3 | 0.2 | Fires the same action twice at once to catch double charges and duplicate rows. |
| Slowpoke | 3 | 0.2 | Acts like a user on a slow connection to see what hangs or times out. |
| The Mob | 4 | 0.1 | Ramps up a crowd of users and shows what breaks first. |

Version 0.1 has seven hooligans. The others are planned and not built yet.

## What each one looks at, and what it leaves alone

The reasons for each rule are in the decision records: 0008 for stage 1, 0009 for stage 2 and 0010 for stages 3 and 4. A report always lists what a scan did not look at.

Pickpocket (stage 1)

- Looks at the scripts, source maps and pages the app loads (at most 25 scripts and 10 pages), and a short fixed list of well-known paths: four .env files and the .git folder.
- Judges by content, not by status code. Many single page apps answer 200 to any path, so a .env or .git answer only counts when the body looks like that file.
- Masks every secret it finds and never uses or tests one. A Supabase anon key is public by design and is not reported. A Google API key is public by design too, so it is listed as worth a look. A service role key is critical.
- Leaves alone: file names it would have to guess.

Loudmouth (stage 1)

- Looks at the headers of the pages the Scout saw: Content-Security-Policy, protection against framing, X-Content-Type-Options and X-Powered-By. A header finding lists every page, so thirty pages without a header are one finding.
- Asks up to eight known routes for CORS with an origin that cannot exist, and reports an answer that echoes it back.
- Looks at cookies whose name says session.
- Leaves alone: Secure and HSTS on an http address, because they only matter over https. The report says so.

Door Rattler (stage 2)

- Reads what a stranger could: a Supabase table behind the public key in the app's scripts (one row for each table the page asks for, reporting column names and never values), a Firebase Realtime Database, routes with private sounding names asked again with no login, and a short list of well-known debug pages.
- Only reads a hosted backend such as Supabase after you confirm it is yours, with GET and HEAD requests.
- Leaves alone: Firestore and Storage rules, and a table that is open to a role other than the public one. The report lists these gaps.

Fat Fingers (stage 2)

- Types clumsy input into the forms and search fields the Scout saw: empty, spaces, 2,000 characters, emoji and accents, and for number fields negative, zero, 25 digits and letters. At most 8 targets and 3 fields each, about 2 requests a second.
- Reports a stack trace, a server error, no answer in time, and an app that stops answering.
- Leaves alone: login and signup forms (Brute looks at those), uploads, other origins, calls with a JSON body, fields named like credentials, routes with risky words unless you pass --include-risky, and routes that look destructive, always.

Vandal (stage 2)

- Types an element that does not exist, to see whether it comes back as markup, and a stray quote, to see whether a database error comes back. It detects and nothing else: no input runs a script or changes data.
- Uses the same input engine as Fat Fingers and leaves the same things alone.
- Leaves alone: input that is stored and shown on a later page.

Brute (stage 3)

- Tries a login (30 wrong attempts), a signup and a password reset (10 each), at most four routes and 30 attempts a minute in total, with made-up people and random passwords. It stops at the first sign that the app pushes back.
- Learns a login that a single page app sends from JavaScript by submitting its form once in a browser.
- Leaves alone: a login that another site handles, a login that needs a token only a browser has, and a lockout that applies to real accounts. The report lists each.

The Mob (stage 4)

- Sends a growing crowd of visitors that only read pages and calls: 25 users by default and 200 at most, set with --load and --duration. It stops at the first step where requests fail, or when the app starts answering 429, which means a limit is working.
- Leaves alone: anything that writes. The numbers are relative, because the crowd and the app share one machine, so they show what gives way first and not how many real users the app can take.
