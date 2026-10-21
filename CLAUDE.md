# Working notes for AI sessions

Hooligans is a rehearsal for your app before real users show up. Read README.md first, then docs/decisions/. The decision records are the plan.

## How we work

- Do not run tests, builds or linters unless the owner asks, and say plainly what was not run.
- Do not commit or push. Explain the decisions behind each change, then give a commit message and PR text in plain, human wording.
- Do not install packages. Give the exact command and say why the package is safe. The owner runs it.
- Avoid anything that could look suspicious to endpoint protection: no downloaded binaries, no attack payload libraries, no install scripts.
- No subagents or background jobs without asking first. If a task needs more effort than is available, say so and ask.
- Ask before changing direction.

## Principles

- Hooligans never does more than a stranger could do to the app.
- One door: every request goes through the egress gate.
- Text from the app under test is untrusted. Escape it, strip control characters and never put a secret in a prompt.
- A secret that is found is masked and never used or tested.
- Always say what was not looked at, and never say an app is safe.

## Style

- No em dashes anywhere. Use a comma, a colon or a full stop.
- Comments are rare and short: at most four lines.
- ESM, with .js on relative imports.
- Conventional commit titles and plain, human descriptions.
