# 0007: Tooling, supply chain and release

Status: accepted, 2026-10-21

## Context

Hooligans is a security tool, so every dependency is attack surface. It should also be easy for one person to build, review and release.

## Decision

- TypeScript 6 on Node 22.13 or newer, as ESM, compiled with plain tsc. Relative imports end in .js. TypeScript 7 is not used for now: it ships native binaries and typescript-eslint does not support it yet.
- Tests use Vitest, linting uses ESLint with typescript-eslint, formatting uses Prettier. A lint rule bans network access outside the egress gate.
- The first release has three runtime dependencies: playwright-core (which downloads no browser), zod and commander. The egress gate is built on Node's own http and https modules, which accept the lookup hook that pinning needs, so undici is not needed. Each is added in the step that first needs it, and checked for maintainers, install scripts and dependencies before it goes in. No prompt library, no colour library and no git hooks: two prompts and a few lines of colour do not justify packages, and hooks need install scripts.
- The project .npmrc pins the public registry, skips install scripts, saves exact versions and enforces the Node version. A CI check fails if the lockfile resolves from anywhere else, because a private package feed would write its address into a public repository.
- CI runs lint, typecheck, build and tests on Linux and Windows with Node 22 and 24. Actions are pinned by commit SHA, permissions are read-only and Dependabot waits seven days before proposing new releases.
- Releases are published only from GitHub Actions, with npm trusted publishing and provenance, so no publishing token lives on a developer machine. The package stays private until the first release.
- Work goes through pull requests with squash merge, so the pull request title is the commit title and must be a conventional commit. Branch protection requires CI to pass.
- The licence is MIT.

## Consequences

- The report template and styles are not TypeScript, so a small script copies them into dist after tsc.
- Payload lists are typed TypeScript modules, so a unit test can reject any destructive entry.
- Each tool version is a decision that can be revisited in a pull request.
