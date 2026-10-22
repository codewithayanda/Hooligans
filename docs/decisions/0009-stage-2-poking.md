# 0009: How stage 2 pokes

Status: accepted, 2026-10-22

## Context

Door Rattler, Fat Fingers and Vandal are stage 2. Stage 1 only reads. Stage 2 asks for data the app may not mean to share and types odd values into forms, which can leave junk rows behind. A false alarm costs trust and an accident costs data, so the rule from 0005 applies in full: never do more than a stranger could do to the app, and ask before writing.

## Decision

Consent and limits

- Stage 2 only runs after the user says the database behind the app is a dev or test copy, with --yes or by answering yes when asked. Without that the whole stage is skipped and the report says so. A scan with no terminal answers no.
- A hosted backend that is not on the user's machine, such as a Supabase project or a Firebase database, is only read after the user confirms it is theirs, with --allow-host or by answering the question. A confirmed host gets GET and HEAD requests only.
- Fat Fingers and Vandal send about 2 requests a second, at most 60 requests each, and stop early when the app fails five requests in a row. Door Rattler only reads, at most 10 requests a second.
- Everything typed carries the marker hooligans-runId. When anything was written, the report names the marker so the junk can be found and cleared.

The input engine, shared by Fat Fingers and Vandal

- They only type into what the Scout saw: forms and search fields on the app itself, and the query string fields of pages and GET calls. At most 8 targets and 3 fields each. One field at a time gets the odd value and the others get ordinary ones. One problem is reported per field.
- Left alone, and said in the report: login and signup forms (Brute looks at those), file uploads, anything on another origin, the Supabase and Next.js internals, fields named like credentials (token, key, password), routes with risky words unless --include-risky is given, and routes that look destructive, always.
- A form is posted the way a browser would send it: urlencoded, with Origin and Referer, and redirects are not followed. Calls with a JSON body are not typed into, because the Scout does not see their fields yet. The report counts how many were left.
- An ordinary request goes first. A form that fails an ordinary request is left alone, because it would tell us nothing. A failure we cannot explain is not held against the app, and "the app stopped" is only reported when an ordinary request fails again right after.
- Payloads detect and nothing else. Fat Fingers types empty, spaces, 2,000 characters, emoji and accents, and for number fields negative, zero, 25 digits and letters. Vandal types an element that does not exist, to see whether it comes back as markup, and a stray quote, to see whether a database error comes back. Nothing runs a script, reads, changes or deletes data. A test rejects any payload that looks otherwise.

What each one reports

- Fat Fingers: a stack trace in an answer (medium), a server error (medium), no answer in time (medium, lower confidence) and the app stopping (high, lower confidence, because a dev server that restarts on file changes looks the same).
- Vandal: what was typed coming back as raw markup in a web page (high), and a database error message after a stray quote (high). Input that is stored and shown on a later page is not checked.
- Door Rattler reads with what any visitor has.
  - Supabase: the public key found in the app's scripts, which is an anon key or a publishable key. A service_role or secret key is never used. For each table the page asks for, it requests one row. It reports only when a row comes back, because an empty answer looks the same as a table protected by row level security. It keeps column names and never row values. A table whose name or columns sound private (users, orders, messages, user_id, email) is critical. Any other table is medium with low confidence, because many tables are public on purpose.
  - Firebase Realtime Database: one request for the top level names. An answer means anyone can read it, and a refusal means it is closed. Firestore and Storage rules are not checked yet, and the report says so.
  - Routes: GET routes with private sounding names that the page calls or the API docs list, asked again with no login. They are reported when they answer with JSON that holds data (high, medium confidence, because a name is only a hint). An error, an empty list and a lone number do not count.
  - Debug pages: a short fixed list (the Spring Boot env page, phpinfo, the Apache status page and the Flask console), judged by what the page says and not by the status code.

## Consequences

- Some real problems go unreported: calls with a JSON body, stored input, private data behind routes with ordinary names, Firestore and Storage rules, and a table that is open to a role other than the public one. The report lists these gaps.
- The pace and the caps mean stage 2 takes a minute or so on a small app. That is on purpose.
- The reality check on real apps decides which of these rules are too strict or too loose, and each change comes with a test.
