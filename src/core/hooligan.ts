import type { HooliganContext } from './context.js';
import type { Finding } from './finding.js';
import type { Stage } from './stage.js';

export type HooliganResult = {
  findings: Finding[];
  /** Plain sentences about what this hooligan did not or could not check. */
  notLookedAt?: string[];
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
  run(context: HooliganContext): Promise<HooliganResult>;
};
