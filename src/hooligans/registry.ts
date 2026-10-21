import type { Hooligan } from '../core/hooligan.js';
import { loudmouth } from './loudmouth/index.js';
import { pickpocket } from './pickpocket/index.js';

/** Every hooligan that is built, in the order they run inside a stage. */
export const HOOLIGANS: readonly Hooligan[] = [pickpocket, loudmouth];
