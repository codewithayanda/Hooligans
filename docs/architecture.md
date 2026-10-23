# Architecture

How the code is laid out, and how a scan moves through it. The decisions behind each part are in [decisions](decisions/).

## A scan, step by step

1. `hooligans scan` (src/cli) reads the flags, asks for the address when `--url` is missing and checks the options (core/config).
2. The scope check (guardrails/scope) accepts only an app on your own machine and fixes the origin.
3. The orchestrator (core/orchestrator) opens the request log and builds the browser guard and the egress gates. One gate serves the Scout. After consent a second gate serves the hooligans, and it also knows the hosts you confirmed. Everything writes to the same log.
4. The Scout (scout) opens the app in a real browser under the browser guard and follows links on the same origin. It writes the app map: pages, forms, calls, assets, cookies, leads, the stack and whether the app is a dev server.
5. Consent (guardrails/consent) decides which stages may run. Stage 1 always runs. Stages 2 to 4 need the database question answered yes.
6. The orchestrator runs the hooligans stage by stage, in roster order. Each gets the app map, a client, the caps, and a way to ask a question. Brute also gets a way to capture a login. A crash in one hooligan does not stop the others, and the scan budget (10 minutes, 20,000 requests) and Ctrl+C stop the loop.
7. Findings are merged by root cause, scored and ranked (scoring), and the report is written (report): a terminal summary, one self-contained HTML file and a versioned report.json. They go in `.hooligans/runs/<runId>/` together with the app map and the request log.

## The folders in src

| Folder | What is in it |
| --- | --- |
| core | The types every part shares (finding, app map, hooligan, context, report), the roster, the options and the orchestrator |
| guardrails | The scope check, the egress gate with its policy and request log, the browser guard, the caps and budget, and consent |
| scout | The browser pass that builds the app map, and the capture of a login form |
| hooligans | One folder for each hooligan with its findings and fix prompts, the registry, and shared helpers in _shared |
| load | What The Mob uses: statistics, a plan of the steps and the ramp |
| payloads | Typed lists of input that only detect, with a test that rejects destructive entries |
| prompts | The five part fix prompt and the wording for the stack |
| scoring | Merge by root cause, score, verdict and ranking, all pure functions |
| report | The report builder, the HTML, the JSON and the plain wording |
| cli | The commands (scan, report, list, doctor, login) and the terminal output |
| util | Small helpers: text, redaction, opening a file, the workspace |

## The seams

- The engine takes the consent question, the progress listener and the stop signal as inputs, so a front door other than the terminal can supply them.
- report.json is the source of truth. The HTML report and the terminal summary read the same report.
- A hooligan is a module with an id, a stage and a run function that returns findings and what it did not look at. The registry lists them in roster order, and each one keeps its findings in its own file.
- All network access is in guardrails/egress, and a lint rule bans it everywhere else.

## Adding a hooligan

1. Add it to the roster in core/roster.ts, with its stage and a one line job.
2. Create src/hooligans/ followed by its id, with an index.ts and a findings.ts, and add it to the registry.
3. Give the demo a twin: a file in demo/src/routes named after it, with the weak and the fixed behaviour side by side.
4. Write the tests. A wiring test fails when a hooligan is written but not registered, or has no findings file or no demo route.
5. Add it to docs/roster.md. A test fails when that page drifts from the roster.

## Tests

- test/unit: pure functions, and each hooligan against fixture maps and a fake HTTP client.
- test/integration: the Scout and every hooligan against the demo app. They need Edge or Chrome and are skipped without one, unless HOOLIGANS_REQUIRE_BROWSER is 1.
- test/e2e: the built command line.
- test/wiring.test.ts and test/unit/docs.test.ts keep the registry, the demo and the docs in step with the roster.

## The demo

The demo is a small shop that is weak on purpose, with a vulnerable and a fixed twin. Every check has to find the problem in one and stay quiet in the other. It is private and only listens on 127.0.0.1. See demo/README.md.
