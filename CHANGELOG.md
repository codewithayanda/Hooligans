# Changelog

All notable changes to Hooligans are listed here. The format follows Keep a Changelog.

## [Unreleased]

### Added

- Project structure, tooling, CI and the decision records.
- Scoring (merge by root cause, tier caps, verdicts), fix prompt builders, and the report: a terminal summary, one self-contained HTML file and a versioned JSON file.
- `hooligans report --sample` shows a report with made-up findings, and `hooligans list` shows the roster.
- The guardrails: a scope check that only accepts an app on your own machine, the egress gate every request will go through, an audit log without secrets, budgets, a circuit breaker and the consent questions.
