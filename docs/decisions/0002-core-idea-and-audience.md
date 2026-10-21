# 0002: The core idea and who it is for

Status: accepted, 2026-10-21

## Context

More and more apps are built with AI coding tools by people who have never done QA or security testing. They do not know what to test, so their users become their first testers. Static code scanners already exist. Fewer tools play a running app the way real users, and badly behaved ones, would.

## Decision

Hooligans plays a running app like real and hostile users. It floods the app, throws scripts and injections at it, and checks the things real apps suffer from, such as missing rate limits and open data. It then rates the app and lists the gaps to close before launch, with a prompt for each gap that can be pasted into an AI coding tool.

It runs on the user's own machine, next to the app, with no hosting and no telemetry.

The first audience is people building with AI editors such as Cursor or Claude Code who run the app locally. People who only have a deployed URL come later, through another front door. The core stays independent of how it is started.

## Consequences

- A browser extension cannot flood an app or send injections at volume, so the command line tool is the engine. An extension, an editor plugin or an MCP server can be a front door over it later.
- Code scanning is not the headline. It may return as an optional extra.
- The project is open source, built to learn from, and meant to be useful to any vibe coder.
