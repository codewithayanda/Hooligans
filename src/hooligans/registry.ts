import type { Hooligan } from '../core/hooligan.js';
import { doorRattler } from './door-rattler/index.js';
import { fatFingers } from './fat-fingers/index.js';
import { loudmouth } from './loudmouth/index.js';
import { pickpocket } from './pickpocket/index.js';
import { vandal } from './vandal/index.js';

/** Every hooligan that is built, in the order they run inside a stage. */
export const HOOLIGANS: readonly Hooligan[] = [
  pickpocket,
  loudmouth,
  doorRattler,
  fatFingers,
  vandal,
];
