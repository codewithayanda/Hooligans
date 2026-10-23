import { describe, expect, it } from 'vitest';
import type { LoadLevel, LoadSummary } from '../../../../src/core/report.js';
import {
  countsAgainstScore,
  errorsUnderLoad,
  findSlowdown,
  slowsDown,
} from '../../../../src/hooligans/the-mob/findings.js';
import { expectWellFormed } from '../../../helpers/findings.js';
import { makeMap } from '../../../helpers/maps.js';

function level(users: number, p95Ms: number, errors = 0, requests = 20, timeouts = 0): LoadLevel {
  return { users, requests, errors, timeouts, pushedBack: 0, p50Ms: 100, p95Ms };
}

function summary(overrides: Partial<LoadSummary> = {}): LoadSummary {
  return {
    peakUsers: 5,
    levels: [level(2, 100), level(5, 300, 4, 20, 1)],
    stoppedBy: 'errors',
    breakAt: 5,
    weakSpot: 'GET /api/stats',
    recovered: true,
    routes: ['GET /', 'GET /api/stats'],
    ...overrides,
  };
}

const failing = level(5, 300, 4, 20, 1);
const before = level(2, 100);

describe('countsAgainstScore', () => {
  it('only counts failures at 10 users or fewer, on a production build', () => {
    expect(countsAgainstScore(makeMap({ mode: 'prod' }), 10)).toBe(true);
    expect(countsAgainstScore(makeMap({ mode: 'prod' }), 11)).toBe(false);
    expect(countsAgainstScore(makeMap({ mode: 'dev' }), 1)).toBe(false);
    expect(countsAgainstScore(makeMap({ mode: 'unknown' }), 1)).toBe(false);
  });
});

describe('errorsUnderLoad', () => {
  const map = makeMap({ mode: 'prod' });

  it('says which route failed, at how many users, and how far the app got', () => {
    const finding = errorsUnderLoad(map, summary(), failing, before);

    expect(finding).toMatchObject({
      id: 'the-mob.errors-under-load',
      category: 'resilience',
      severity: 'high',
      confidence: 'high',
      affected: ['GET /api/stats'],
      title: 'GET /api/stats returned errors when 5 people used the app at once',
    });
    expect(finding.evidence).toBe(
      '4 of 20 requests failed at 5 users (3 with a server error or a dropped connection and 1 timed out). It held up to 2 people. It answered normally again a few seconds after the crowd left.',
    );
    expectWellFormed(finding);
  });

  it('is only medium when it took more than 5 users', () => {
    const finding = errorsUnderLoad(map, summary(), level(8, 300, 4), before);

    expect(finding).toMatchObject({ severity: 'medium', confidence: 'high' });
  });

  it('costs nothing on a dev server, and says so', () => {
    const finding = errorsUnderLoad(makeMap({ mode: 'dev' }), summary(), failing, before);

    expect(finding.confidence).toBe('low');
    expect(finding.evidence).toContain('This was a dev server');
  });

  it('costs nothing when Hooligans cannot tell what the app runs on', () => {
    const finding = errorsUnderLoad(makeMap({ mode: 'unknown' }), summary(), failing, before);

    expect(finding.confidence).toBe('low');
    expect(finding.evidence).toContain('could not tell whether this is a production build');
  });

  it('costs nothing above 10 users, and says so', () => {
    const finding = errorsUnderLoad(map, summary(), level(15, 300, 4), before);

    expect(finding.confidence).toBe('low');
    expect(finding.evidence).toContain('above 10 users');
  });

  it('names the app when it does not know the route, and the first page as the place', () => {
    const finding = errorsUnderLoad(map, summary({ weakSpot: null }), failing, before);

    expect(finding.title).toBe('Your app returned errors when 5 people used it at once');
    expect(finding.affected).toEqual(['GET /']);
  });

  it('says so when it failed from the first step', () => {
    const finding = errorsUnderLoad(map, summary(), level(1, 300, 4), null);

    expect(finding.title).toContain('when 1 person used');
    expect(finding.evidence).toContain('It failed from the first step.');
  });

  it('says what happened after the crowd left', () => {
    const down = errorsUnderLoad(map, summary({ recovered: false }), failing, before);
    const unknown = errorsUnderLoad(map, summary({ recovered: null }), failing, before);

    expect(down.evidence).toContain('still not answering normally');
    expect(unknown.evidence).not.toContain('crowd left');
  });

  it('cuts an odd route name down to safe characters in the title and the prompt', () => {
    const finding = errorsUnderLoad(map, summary({ weakSpot: 'GET /api/x y<z>' }), failing, before);

    expect(finding.title).toContain('GET /api/x?y?z?');
    expect(finding.fixPrompt).not.toContain('<z>');
  });
});

describe('findSlowdown', () => {
  it('finds the step where the slowest typical answer jumped', () => {
    const levels = [
      level(1, 150),
      level(2, 160),
      level(5, 190),
      level(10, 380),
      level(15, 2400),
      level(25, 5200),
    ];

    expect(findSlowdown(levels)).toEqual({ from: levels[3], to: levels[4] });
  });

  it('is measured against the first step, and never below one and a half seconds', () => {
    const slow = [level(1, 1000), level(2, 4900), level(5, 5200)];

    expect(findSlowdown(slow)).toEqual({ from: slow[1], to: slow[2] });
    expect(findSlowdown([level(1, 100), level(2, 1400)])).toBeNull();
  });

  it('is null for a short list', () => {
    expect(findSlowdown([])).toBeNull();
    expect(findSlowdown([level(1, 9000)])).toBeNull();
  });
});

describe('slowsDown', () => {
  const from = level(10, 380);
  const to = level(15, 2400);

  it('is only worth a look, because speed on one machine is relative', () => {
    const finding = slowsDown(makeMap({ mode: 'prod' }), summary(), from, to);

    expect(finding).toMatchObject({
      id: 'the-mob.slows-down',
      category: 'performance',
      severity: 'medium',
      confidence: 'low',
      title: 'Your app slows down after about 10 users',
      affected: ['GET /', 'GET /api/stats'],
    });
    expect(finding.evidence).toBe(
      'The 95th percentile went from 380 ms at 10 users to 2400 ms at 15 users. The crowd and the app share one machine, so treat the numbers as relative.',
    );
    expectWellFormed(finding);
  });

  it('says so when it was a dev server', () => {
    const finding = slowsDown(makeMap({ mode: 'dev' }), summary(), from, to);

    expect(finding.evidence).toContain('This was a dev server, so treat the numbers as relative.');
  });

  it('still names a place when no routes were kept', () => {
    const finding = slowsDown(makeMap(), summary({ routes: [] }), from, to);

    expect(finding.affected).toEqual(['the pages and calls The Mob visited']);
  });
});
