# Development

## Requirements

Node 22.13 or newer (.nvmrc suggests 24) and npm.

## Setup

```bash
npm install
```

The project .npmrc installs from the public npm registry, skips install scripts and saves exact versions. After an install, `npm run check:lockfile` confirms that the lockfile only points at the public registry.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Compiles to dist and copies the report assets |
| `npm run typecheck` | Type checks src and test without emitting |
| `npm run lint` | ESLint, including the rule that keeps network access inside the egress gate |
| `npm test` | Runs the tests with Vitest |
| `npm run format` | Prettier on src, test and scripts |
| `npm run check:comment-style` | No em dashes, comment blocks of at most four lines |
| `npm run check:lockfile` | The lockfile only resolves from the public registry |
| `npm run check` | Lint, typecheck, build and test in one go |

After a build, `node dist/cli/index.js --help` lists the commands, and `node dist/cli/index.js report --sample --open` shows a sample report. `node dist/cli/index.js doctor` checks that Node, a browser and the workspace are ready.

`npm run demo` starts the demo app on 127.0.0.1: the vulnerable twin on port 4001 and the fixed twin on port 4002. The Scout tests start the Edge or Chrome that is already installed. They are skipped when no browser can start, unless HOOLIGANS_REQUIRE_BROWSER is 1, which CI sets.

## Conventions

- Conventional commit titles, squash merge, one pull request per roadmap step.
- Relative imports end in .js, even in TypeScript files.
- No em dashes, and comments of at most four lines.

## Releases

Releases are published from GitHub Actions with provenance. Nothing is published from a developer machine. The package stays private until the first release.
