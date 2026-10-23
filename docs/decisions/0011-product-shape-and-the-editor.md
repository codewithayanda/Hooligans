# 0011: The product shape and the way to the editor

Status: accepted, 2026-10-23

## Context

Steps 1 to 7 built the engine: the Scout, the egress gate, seven hooligans, the score and the report, with a demo shop that proves each check both ways. Decision 0002 left the front door open.

Two things are now clear. The people Hooligans is for have never done QA, so a command line is a barrier for them. And a list of findings is where many tools stop, which is not enough for someone who does not know what the findings mean or how to check a fix. This record says what Hooligans is for those people, chooses the front door and sets the order of the work that remains.

## Decision

Purpose

- Hooligans is a guide that a builder runs on their own machine before deploying. It tests the running app the way a normal user, and a curious stranger, would, and shows the builder what they missed.
- Version 0.1 and everything in this plan test only an app on the user's own machine (0005). It is for builders testing their own apps, not for testing other people's.

What it is

A rehearsal that asks the questions a beginner does not know to ask, explains the answers in plain words and checks the fix afterwards. It rests on five principles.

1. Start with what a stranger can see. The first run is read-only and asks nothing. It shows what a stranger learns about the app from outside: the stack, the routes, key-shaped text in the scripts (masked), public source maps and what the server announces. It is built from what the Scout, Pickpocket and Loudmouth already find, and it comes first in the report and in the editor.
2. A crowd with a voice. The hooligans are characters, and the run is where they perform. See The voice.
3. Close the loop. A finding ends with a prompt to paste into the user's own AI tool, and the prompt already says how to re-check with `--only` (0006). After the fix, the report keeps a receipt: the earlier finding, the date and what the same check saw this time.
4. Teach as it goes. Every finding gets three plain lines: what happened, why it matters and what to ask your AI. After a few scans the user knows words such as CORS, rate limit and injection from their own app.
5. Rule-based and humble. No AI judges findings inside the engine, so a check gives the same answer twice. There is no account and no telemetry. Hooligans never says an app is safe and always says what it did not look at (0006).

The front door

- The front door is a VS Code extension, for VS Code and the editors built on it, such as Cursor and Windsurf. The command line stays: it is the engine, the CI tool and the way in for anyone who likes a terminal.
- The extension holds no scan logic. It starts the engine as a separate process, because a stall inside the extension host would freeze every extension in that window. The regex stall that once froze a scan shows how easily a stall happens. The two talk in JSON lines: progress and questions come out, answers and a stop message go in. No port is opened.
- Cancel is a message, not a signal, because on Windows a signal cannot ask a process to stop politely. It means what Ctrl+C means today: stop after the step in progress and still write the report.
- The database question is a native dialog, asked after the Scout has looked, because that is when a hosted backend can be seen and the question can be made louder. Stages 2 to 4 show as locked levels until the answer is yes (0005).
- Everything in 0005 holds. The extension passes on the address the user typed, and the engine still refuses anything that is not their own machine. It does not look for apps and sends nothing anywhere. It is switched off in an untrusted workspace, because it starts a process.
- Tests do not download a copy of VS Code, in the same spirit as playwright-core downloading no browser (0007). The VS Code part stays small, its logic is plain functions with unit tests, and anything that needs a real VS Code runs in CI only.
- A release is a `.vsix` file on the GitHub release, built and published from GitHub Actions and never from a developer machine (0007). New dev tools, such as the VS Code type definitions and the packaging tool, are checked for maintainers, install scripts and dependencies before they go in, as 0007 says.

Considered and not chosen

- A page on a local web server, opened in the browser. It would be the first thing in Hooligans that listens on a port, so any other page open in the browser could try to talk to it, and it gives editor users nothing the extension does not.
- A page that opens a terminal. A web page cannot start programs, and a helper that runs commands for any page is the kind of hole this tool exists to warn about.
- A desktop app. It means shipping a second runtime and downloaded binaries.
- A browser extension. It cannot send a crowd at volume (0002).

The voice

- Playful on the run screen, calm and plain in findings. The more serious the finding, the quieter the joke.
- A joke lands on the app's mistake, never on the person, and a joke never carries information.
- Quiet mode switches the jokes off. It changes no finding.
- Example lines: "Trying every door handle. Politely." "Typing with oven mitts on." "Nothing serious found. The hooligans got bored and went home. We still won't call it safe."

The step plan

The order is trust first: the engine is proved on real apps and released before any front door is built on top of it. Each step is one pull request with a "done when", and starts with its own short record, as steps 5 to 7 did, which may change the details here. Sizes are rough shares of the whole plan, out of 100. About 45 is done: the engine, the seven hooligans and the report, written but not yet proved on real apps.

Step 8: Prove and release the engine (about 13)

- Run Hooligans against at least three real apps, running the way they run in development, and give each false alarm and miss a test or a written reason.
- Add the two parked fixes: recognise Angular, and header advice that fits the host (a `_headers` file on Netlify and Cloudflare Pages, `vercel.json`, a meta tag for the CSP, and a plain note that GitHub Pages cannot set headers).
- Write the coverage map for the README and `docs/roster.md`, with each hooligan's name and job taken from the registry (0006), and fill `docs/safety.md` and `docs/architecture.md`.
- Scanning with no address asks for one in plain words and explains the database question in everyday words. It does not look for apps (0005).
- Add the README screenshot, the sample report on GitHub Pages and the release workflow.
- Done when `npx hooligans scan` works from the published package on a clean machine, npm shows provenance and the friend test passes with the command line.

Step 9: The loop, the Stranger's View and the teaching lines (about 11)

- Keep run history in the run folders and show what changed since the last run: fixed, new, unchanged (0006).
- Keep a receipt after a re-check.
- Make the Stranger's View the first section of the report and the terminal summary.
- Put the three plain lines on every finding.
- Done when, in the demo, fixing one problem and re-running only that hooligan shows a receipt, a second full scan shows what changed, every finding has its three lines and the report opens on the Stranger's View.

Step 10: Engine seams for an editor (about 5)

- Add a mode where progress, the database question and the end of the run go out as JSON lines, and answers and a stop message come in the same way.
- A stop ends the run after the step in progress and still writes the report, on Windows too. The terminal output does not change.
- Done when a small test program, not VS Code, starts the engine as a child process, reads the events, answers the question and cancels a run halfway, on Ubuntu and Windows in CI.

Step 11: The extension shell (about 20)

- A command to scan, the address box, the database dialog, a run panel with Cancel and Retry, the report in a tab with Copy fix and Re-check this one, the score in the status bar, the locked levels and the `.vsix` release.
- Done when a friend installs the `.vsix` from the GitHub release, runs the scan, answers the dialog, cancels and re-runs, and reads the report in a tab, and the extension opens no port and holds no scan logic.

Step 12: Voice and animation (about 6)

- A character for each hooligan with lines for starting, finding something and finding nothing, the crowd shown at work on the run panel, and Quiet mode.
- A row of characters lighting up comes first. The floor plan of the app is only added if it turns out to be cheap.
- Done when Quiet mode removes every joke without changing a finding and the friend test passes with the extension.

How we will know it works

- The friend test: a friend who has never seen Hooligans, with Node and Edge or Chrome installed, gets one useful finding in five minutes with no help, while someone watches and says nothing. It runs after step 8 with the command line and after step 12 with the extension. Where the friend stalls is the next thing to fix.

Left out on purpose

- The next version's work: logging in once by hand and the checks that need it, Snooper, Double Tapper and Slowpoke. Snooper, one user reading another's data, is the most valuable next check, because it is a common serious mistake in apps built on hosted databases.
- An MCP front door, which would let the user's own AI tool run the re-check. The user would still be the one who says the database is a dev or test copy.
- The Marketplace and Open VSX listings, a browser page, an AI that judges findings inside the engine, and any badge or wording that could be read as safe.
- Testing an app that is not on the user's own machine. 0005 keeps remote targets for later, behind an ownership check, and this plan does not touch that.

## Consequences

- Little of the code so far changes. The engine already takes the consent question, the progress listener and the stop signal as inputs, report.json is the source of truth and each hooligan is its own module. The reworks are small: progress becomes structured events, the scan address becomes optional with a prompt, the report gains the Stranger's View and the teaching lines, and run history lands in the run folders.
- A receipt that says what the check saw this time needs each hooligan to report what it checked and found fine, not only what it found. That widens the hooligan contract and is settled in step 9.
- Data traffic, meaning how much data moves, large uploads or many writes at once, is covered only in part by The Mob's counts of requests, errors and response times. What it should mean is still open, and it may become a hooligan of its own in the next version.
- The extension is the least certain part. Before step 10 starts, confirm how an extension loads the engine (the engine is ESM, and extensions have traditionally loaded CommonJS), whether the engine goes inside the `.vsix` or is started with `npx`, how Cursor and Windsurf install extensions, and the current publishing steps.
- Two things ship from one repo, so the extension and the engine need versions that match.
- A good looking front door on top of unproven results could give false comfort. That is why the real-app check and the first friend test come before the extension.
- The estimate is a judgement, give or take 10. The shares for steps 11 and 12 are the shakiest, because nothing like them has been built here yet.
- 0002 said an editor plugin could be a front door later. This record chooses it. The README's "Where it is heading" still names a browser extension and an editor plugin, and is updated in step 8.
