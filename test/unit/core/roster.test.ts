import { describe, expect, it } from 'vitest';
import { HOOLIGANS_IN_V01, ROSTER, rosterEntry } from '../../../src/core/roster.js';
import { STAGE_NUMBERS } from '../../../src/core/stage.js';

describe('the roster', () => {
  it('has seven hooligans in version 0.1', () => {
    expect(HOOLIGANS_IN_V01).toBe(7);
  });

  it('gives every hooligan a unique id that works as a folder name', () => {
    const ids = ROSTER.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  });

  it('puts every hooligan in a real stage', () => {
    for (const entry of ROSTER) expect(STAGE_NUMBERS).toContain(entry.stage);
  });

  it('finds a hooligan by id', () => {
    expect(rosterEntry('the-mob')?.stage).toBe(4);
    expect(rosterEntry('nobody')).toBeUndefined();
  });
});
