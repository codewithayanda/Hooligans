# Changelog

All notable changes to Hooligans are listed here. The format follows Keep a Changelog.

## [Unreleased]

### Added

- Project structure, tooling, CI and the decision records.
- Scoring (merge by root cause, tier caps, verdicts), fix prompt builders, and the report: a terminal summary, one self-contained HTML file and a versioned JSON file.
- `hooligans report --sample` shows a report with made-up findings, and `hooligans list` shows the roster.
- The demo app, a weak shop with a vulnerable and a fixed twin, starting with the Pickpocket and Loudmouth routes.
- The Scout: a read-only browser pass that maps pages, forms, calls, assets, cookies and leads, and works out the stack and whether the app is a dev server. `hooligans doctor` checks that it can run.
- The guardrails: a scope check that only accepts an app on your own machine, the egress gate every request will go through, an audit log without secrets, budgets, a circuit breaker and the consent questions.
- Pickpocket and Loudmouth, the first two hooligans, and `hooligans scan`: it maps the app, runs stage 1 and writes the report, the app map and the request log to `.hooligans/runs`. A report says how many of the seven hooligans ran.
- The registry, and a wiring test that fails when a hooligan is written but not registered.
