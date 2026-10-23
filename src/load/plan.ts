import type { RampPlan } from './ramp.js';

/** The steps of the ramp. They grow quickly at first, so a weak spot shows without a long wait. */
const LADDER: readonly number[] = [1, 2, 5, 10, 15, 25, 40, 60, 100, 150, 200];

export type Timing = {
  /** The shortest time spent at one step, so a short run still has something to measure. */
  minLevelMs: number;
  /** How long a user waits between two requests, somewhere between these two numbers. */
  thinkMs: readonly [number, number];
};

/** Every step of the ladder below the peak, and then the peak itself. */
export function levelsFor(maxUsers: number): number[] {
  const top = Math.max(1, Math.floor(maxUsers));
  return [...LADDER.filter((users) => users < top), top];
}

export function planFor(options: { maxUsers: number; seconds: number }, timing: Timing): RampPlan {
  const levels = levelsFor(options.maxUsers);
  const share = Math.round((Math.max(0, options.seconds) * 1000) / levels.length);

  return { levels, levelMs: Math.max(timing.minLevelMs, share), thinkMs: timing.thinkMs };
}
