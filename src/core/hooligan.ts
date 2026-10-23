import type { HooliganContext } from './context.js';
import type { Finding } from './finding.js';
import type { LoadSummary } from './report.js';
import type { Stage } from './stage.js';

export type HooliganResult = {
  findings: Finding[];
  /** Plain sentences about what this hooligan did not or could not check. */
  notLookedAt?: string[];
  /** What The Mob saw, for the chart in the report. */
  load?: LoadSummary;
};

export type Hooligan = {
  /** Folder name, for example "door-rattler". */
  id: string;
  /** Display name, for example "Door Rattler". */
  name: string;
  stage: Stage;
  /** One line for `hooligans list` and the docs. */
  summary: string;
  /** How many saved logins it needs. Everything in version 0.1 needs none. */
  sessions: 0 | 1 | 2;
  /** The most requests a second this hooligan sends. Leave it out for no limit. */
  requestsPerSecond?: number;
  /** Logs this hooligan's requests as counts per second, for load traffic. */
  aggregateLog?: boolean;
  run(context: HooliganContext): Promise<HooliganResult>;
};
