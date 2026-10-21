# 0006: Score, report and command line

Status: accepted, 2026-10-21

## Context

A vibe coder needs a score, the biggest problems first, and something to paste into an AI tool. The score has to be reproducible, and it must never claim an app is safe.

## Decision

Findings. Every finding has an id, the hooligan that found it, a plain title, a severity, a category (security, resilience or performance), a confidence, a root cause used to merge duplicates, the places affected, evidence with secrets masked, a plain explanation and a fix prompt.

Severity. Critical means a stranger can read or change real data right now. High means a stranger could with some effort. Medium weakens a defence. Low is hygiene.

Score.

- It starts at 100 and loses 25, 10, 4 or 1 for each critical, high, medium or low finding.
- One root cause is one finding, so thirty pages missing the same header count once.
- Lows lose at most 10 points in total, mediums 30 and highs 50, so a pile of small problems never looks worse than one big one.
- Only high and medium confidence findings cost points. Low confidence ones are listed as worth a look.
- The score is reproducible. The Mob only costs points for clear failures (errors or timeouts at 10 users or fewer, never on a dev server). Latency and the break point are shown as relative information.

Verdict. 90 to 100 is "Nothing serious found", 70 to 89 is "Almost there", 40 to 69 is "Risky" and below 40 is "Not ready". One critical finding caps the verdict at "Risky". If some hooligans did not run, the verdict says so, for example "Nothing serious found so far, 3 of 7 hooligans ran". The top verdict is not "ready to launch" because that would be a claim of safety.

Ranking. The top five are ordered by severity, then confidence, then how many places are affected, then id, so the order never wobbles.

Fix prompts. Each has five parts: the stack, what was seen and where, the exact change, what not to break, and how to re-check with `hooligans scan --only <hooligan>`. There is one prompt per problem, plus a "copy top five" prompt. A prompt never contains a secret. The wording adapts only to stacks the Scout can name (Next.js, Vite, Express, Supabase and Firebase) and says so when it cannot tell.

Report. One run writes a terminal summary, one self-contained HTML file and a versioned report.json. The HTML makes no external requests, supports dark mode and has copy buttons, a chart for The Mob and honest sections for what Hooligans did and what it did not look at. A re-run shows the change since the last run. Text from the app under test is untrusted: the HTML escapes it and carries a locked-down content security policy, and the terminal summary strips control characters.

Command line.

- `hooligans scan --url <url>` with `--only`, `--stages`, `--yes`, `--allow-host`, `--include-risky`, `--load`, `--duration`, `--json`, `--fail-on` and `--open`.
- `hooligans report [--open]`, `hooligans login --as <name>` (0.2), `hooligans doctor` and `hooligans list`.
- Exit codes: 0 fine, 1 findings at or above `--fail-on`, 2 refused or bad input, 3 internal error, 130 interrupted.
- There is no config file in 0.1. Consent is per run, in flags, on purpose.

## Consequences

- Scoring is made of pure functions that can be proved with fixtures.
- The roster, the README and the docs can come from one source: the registry that `hooligans list` reads.
