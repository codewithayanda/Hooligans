# 0008: What the first two hooligans report

Status: accepted, 2026-10-21

## Context

Pickpocket and Loudmouth are stage 1. They only read, so they run on every scan and they are the first thing a new user sees. A false alarm costs the most here, because it teaches people to ignore the report. Version 0.1 is judged on whether a first scan of someone's own app is mostly right.

## Decision

- Precision before coverage. A hooligan reports what it can show with evidence, and says what it did not look at. It does not guess.
- Every answer is judged by its content, not by its status code. Many single page apps answer 200 with the home page for any path, so a .env or .git answer only counts when the body looks like that file, and a web page never counts as a file.
- Pickpocket reads what the pages load (scripts, source maps and the pages themselves, at most 25 scripts and 10 pages) and a short fixed list of well-known paths: four .env files and the .git folder. It does not guess other file names.
- A secret is masked in the evidence and in the prompt, and is never used or tested. A Supabase anon key is public by design and is not reported. A Google API key is public by design too, so it is listed as worth a look, with the advice to restrict it. A service_role key is critical. Text that only looks like a secret is ignored: the AWS documentation example, a CSS class that starts with sk-, a placeholder database address.
- An exposed .env file is one finding. It names the settings and never shows their values.
- All the public source maps are one finding, because they have one fix.
- Loudmouth reads the headers of the pages the Scout saw. A header finding lists every page, so thirty pages without a header are one finding.
- CORS is judged by asking. Up to eight known routes get a request with an origin that cannot exist. An answer that echoes that origin back and allows cookies is high, because any website could then read answers meant for a logged-in user. A wildcard is only worth a look, because many public APIs use one on purpose.
- A cookie counts as a session cookie only when its name says session, because many apps put readable cookies in other places on purpose (Supabase, Clerk, CSRF tokens). The Secure flag and HSTS only matter over https, so they are not judged on an http address, and the report says so.
- Names and paths from the app that go into a prompt are cut down to a safe set of characters, so a hostile page cannot write instructions into the prompt.

## Consequences

- Some real problems go unreported: a session cookie with an unusual name, a CORS mistake on a route the Scout did not see. The report lists these gaps.
- The reality check on real apps decides which of these rules are too strict or too loose, and each change comes with a test.
