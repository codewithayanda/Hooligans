import { describe, expect, it } from 'vitest';
import { gatherConsent } from '../../../src/guardrails/consent.js';

function asker(answer: boolean) {
  const asked: string[] = [];
  const ask = async (question: string): Promise<boolean> => {
    asked.push(question);
    return answer;
  };
  return { asked, ask };
}

const base = { allowHosts: [], hostedBackends: [] };

describe('gatherConsent', () => {
  it('runs every stage without asking when --yes is given', async () => {
    const { asked, ask } = asker(false);
    const result = await gatherConsent({ ...base, stages: [1, 2, 3, 4], yes: true, ask });

    expect(result.stagesToRun).toEqual([1, 2, 3, 4]);
    expect(result.skippedStages).toEqual([]);
    expect(result.databaseConfirmed).toBe('flag');
    expect(asked).toHaveLength(0);
  });

  it('runs stage 1 only when the user does not confirm a test database', async () => {
    const { asked, ask } = asker(false);
    const result = await gatherConsent({ ...base, stages: [1, 2, 3, 4], yes: false, ask });

    expect(result.stagesToRun).toEqual([1]);
    expect(result.skippedStages.map((skipped) => skipped.stage)).toEqual([2, 3, 4]);
    expect(result.skippedStages[0]?.reason).toContain('dev or test copy');
    expect(result.databaseConfirmed).toBe('no');
    expect(asked).toHaveLength(1);
  });

  it('runs every stage when the user confirms at the prompt', async () => {
    const { ask } = asker(true);
    const result = await gatherConsent({ ...base, stages: [1, 2, 3, 4], yes: false, ask });

    expect(result.stagesToRun).toEqual([1, 2, 3, 4]);
    expect(result.databaseConfirmed).toBe('prompt');
  });

  it('never asks about the database when only stage 1 is wanted', async () => {
    const { asked, ask } = asker(false);
    const result = await gatherConsent({ ...base, stages: [1], yes: false, ask });

    expect(result.stagesToRun).toEqual([1]);
    expect(asked).toHaveLength(0);
  });

  it('always runs stage 1, whatever was asked for', async () => {
    const { ask } = asker(false);
    const result = await gatherConsent({ ...base, stages: [2], yes: true, ask });

    expect(result.stagesToRun).toEqual([1, 2]);
  });

  it('asks about the database in everyday words', async () => {
    const { asked, ask } = asker(false);
    await gatherConsent({ ...base, stages: [1, 2], yes: false, ask });

    expect(asked[0]).toContain('made-up data');
    expect(asked[0]).toContain('test copy');
    expect(asked[0]).toContain('junk');
    expect(asked[0]).not.toContain('Stages 2 to 4');
  });

  it('names the hosted backend and says it could be production', async () => {
    const { asked, ask } = asker(false);
    await gatherConsent({
      stages: [1, 2],
      yes: false,
      allowHosts: [],
      hostedBackends: ['xyz.supabase.co'],
      ask,
    });

    expect(asked[0]).toContain('xyz.supabase.co');
    expect(asked[0]).toContain('production');
  });

  it('asks before Door Rattler reads a hosted backend', async () => {
    const { asked, ask } = asker(true);
    const result = await gatherConsent({
      stages: [1, 2],
      yes: true,
      allowHosts: [],
      hostedBackends: ['xyz.supabase.co'],
      ask,
    });

    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('Is that your project?');
    expect(result.confirmedHosts).toEqual(['xyz.supabase.co']);
  });

  it('does not ask again about a host confirmed with --allow-host', async () => {
    const { asked, ask } = asker(false);
    const result = await gatherConsent({
      stages: [1, 2],
      yes: true,
      allowHosts: ['XYZ.supabase.co.'],
      hostedBackends: ['xyz.supabase.co'],
      ask,
    });

    expect(asked).toHaveLength(0);
    expect(result.confirmedHosts).toEqual(['xyz.supabase.co']);
  });

  it('leaves a host unconfirmed when the answer is no', async () => {
    const { ask } = asker(false);
    const result = await gatherConsent({
      stages: [1, 2],
      yes: true,
      allowHosts: [],
      hostedBackends: ['xyz.supabase.co'],
      ask,
    });

    expect(result.confirmedHosts).toEqual([]);
  });

  it('does not ask about hosts when stage 2 will not run', async () => {
    const { asked, ask } = asker(false);
    await gatherConsent({
      stages: [1, 2],
      yes: false,
      allowHosts: [],
      hostedBackends: ['xyz.supabase.co'],
      ask,
    });

    expect(asked).toHaveLength(1);
  });
});
