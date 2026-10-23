# Hooligans

A rehearsal for your app before real users show up.

Hooligans plays your app the way real users, and a few badly behaved ones, will. Then it tells you in plain words what broke and what to fix before you launch.

## Why it exists

More and more apps are built with AI coding tools, and most of the people building them have never done QA or security testing. They do not know what to test, so their first testers end up being their users. Hooligans is here to close that gap.

## What it will do

You run Hooligans on your own machine, next to your app. It sends in a crowd of hooligans, each with one job:

- **Pickpocket** looks through your app's public files for keys, secrets and a stray `.env` or `.git` folder.
- **Loudmouth** checks what your app says too loudly: missing security headers, wide-open CORS and weak cookies.
- **Door Rattler** tries the back doors: open Supabase or Firebase data, API routes that answer without a login, and admin or debug pages.
- **Fat Fingers** types clumsy input: empty, huge, emoji and negative numbers.
- **Vandal** sprays scripts and SQL into every input to see what sticks.
- **Brute** hammers login, signup and password reset to see whether anything slows it down.
- **The Mob** ramps up a crowd of users and shows what breaks first.

When they are done you get a score out of 100, the biggest problems first, and a prompt for each problem that you can paste straight into Cursor, Claude Code or whatever AI tool built your app.

Hooligans never tells you an app is safe, because no scan can. It tells you what its checks found, and what they did not look at.

## What it covers, and what it does not

| You want to know | Checked by | Not checked yet |
| --- | --- | --- |
| Can a stranger see or take something they should not? | Pickpocket, Loudmouth, Door Rattler, Vandal, Brute | Anything behind a login, which comes in a later version. Apps that are not on your own machine |
| Does it hold up with many users? | The Mob | Writes under load. Real capacity numbers: the crowd and the app share one machine, so the numbers only show what gives way first |
| Does odd input break it? | Fat Fingers, Vandal | File uploads |
| How much data moves? | Only in part: The Mob counts requests, errors and response times | Payload size, bandwidth, uploads and WebSockets |

Hooligans plays the running app. It does not read your source code, and it cannot tell whether your app does what it should, such as a checkout that charges the right amount.

## Where it is today

Early. A scan already works from start to finish for all seven hooligans of the first version, against an app running on your own machine. Pickpocket and Loudmouth only look. Door Rattler, Fat Fingers and Vandal poke: they type into your forms and read what a stranger could read. Brute tries wrong logins with made-up accounts, at most 30 a minute, and The Mob sends a growing crowd of visitors to see what gives way first. Those five can leave junk data behind or slow your app down, so they ask first. A scan that skips them says so, for example "Nothing serious found so far, 2 of 7 hooligans ran".

To try it from a clone (it is not published yet):

```bash
npm install
npm run build
node dist/cli/index.js scan --url http://localhost:3000 --open
```

That run only looks. To let the other hooligans in as well, say that the database behind your app is a dev or test copy:

```bash
node dist/cli/index.js scan --url http://localhost:3000 --yes --open
```

Leave out `--url` and Hooligans asks which address your app is running on, in plain words.

A full scan takes a few minutes, because Brute is slow on purpose. `--load` sets the most users The Mob sends (25 by default) and `--duration` how long its run takes in seconds (30 by default).

It needs Microsoft Edge or Google Chrome, which it drives but never downloads. `node dist/cli/index.js doctor` checks that everything is ready.

## Where it is heading

1. **First version:** the seven hooligans above, started with one command against an app on your own machine (planned: `npx hooligans scan`, which asks for the address).
2. **Then a friendlier way in:** a VS Code extension, for VS Code and the editors built on it such as Cursor. It runs a scan from the editor, shows the crowd at work and opens the report in a tab. The command line stays. Before that comes a re-check loop that shows what changed since the last run and whether a fix worked.
3. **Next:** log in once by hand so the hooligans can reach everything behind your login, plus three more hooligans:
   - **Snooper** checks whether one user can see another user's data.
   - **Double Tapper** fires the same action twice at once, to catch double charges and duplicate rows.
   - **Slowpoke** acts like a user on a slow phone connection.
4. **Later:** **Wallet Drainer**, which finds open endpoints that could run up a paid-API bill, an MCP server so an AI coding tool can run the re-check itself, and a CI check.

The plan, and the reasons for it, are in the [decision records](docs/decisions/).

## Built with

TypeScript on Node.js, with Playwright driving a headless browser.

## Responsible use

Only point Hooligans at apps you own or have permission to test. This version only runs against an app on your own machine. [docs/safety.md](docs/safety.md) says what it does, what it never does and where it stops, [docs/roster.md](docs/roster.md) says what each hooligan looks at and leaves alone, and [docs/architecture.md](docs/architecture.md) shows how the code fits together.
