import { beforeAll, describe, expect, it } from 'vitest';
import { setColorEnabled } from '../../../src/cli/ui/color.js';
import { formatSummary } from '../../../src/cli/ui/summary.js';
import type { LoadLevel, LoadSummary, Report } from '../../../src/core/report.js';
import { buildReport } from '../../../src/report/build.js';
import { renderHtml } from '../../../src/report/render.js';
import { buildSampleReport } from '../../../src/report/sample.js';
import { describeLoad } from '../../../src/report/voice.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const esc = String.fromCharCode(27);

beforeAll(() => {
  setColorEnabled(false);
});

function level(users: number, p95Ms: number, errors = 0, requests = 20): LoadLevel {
  return { users, requests, errors, timeouts: 0, pushedBack: 0, p50Ms: 100, p95Ms };
}

function summary(overrides: Partial<LoadSummary> = {}): LoadSummary {
  return {
    peakUsers: 25,
    levels: [level(1, 150), level(25, 5200)],
    stoppedBy: 'finished',
    breakAt: null,
    weakSpot: null,
    recovered: null,
    routes: ['GET /'],
    ...overrides,
  };
}

function sample(): Report {
  return buildSampleReport({ runId: 'test-run', version: '0.0.0', now: NOW });
}

/** A report from a run in which The Mob did not take part. */
function withoutLoad(): Report {
  return buildReport({
    tool: { name: 'hooligans', version: '0.0.0' },
    run: sample().run,
    findings: [],
    ran: 1,
    skipped: [],
    notLookedAt: [],
    activity: { requestsSent: 0, requestsBlocked: 0, writes: 0, cleanupMarker: null },
  });
}

describe('describeLoad', () => {
  it('says the app held up, and how slow the top was', () => {
    expect(describeLoad(summary())).toBe(
      'The crowd grew to 25 users and the app held up. The slowest typical answer (95th percentile) at the top was 5200 ms.',
    );
  });

  it('says where the errors began, how far the app got and whether it came back', () => {
    const failing = summary({
      peakUsers: 5,
      levels: [level(2, 100), level(5, 300, 4)],
      stoppedBy: 'errors',
      breakAt: 5,
      weakSpot: 'GET /api/stats',
      recovered: true,
    });

    expect(describeLoad(failing)).toBe(
      'Errors began at 5 users: 4 of 20 requests failed, mostly on GET /api/stats. It held up to 2 users. It worked again a few seconds after the crowd left.',
    );
    expect(describeLoad({ ...failing, weakSpot: null, recovered: false })).toBe(
      'Errors began at 5 users: 4 of 20 requests failed. It held up to 2 users. It was still not answering normally a few seconds after the crowd left.',
    );
  });

  it('says so when it failed from the first step', () => {
    const failing = summary({ levels: [level(1, 100, 4)], stoppedBy: 'errors', breakAt: 1 });

    expect(describeLoad(failing)).toBe('Errors began at 1 user: 4 of 20 requests failed.');
  });

  it('says that a limit did its job, and that a used up budget ended the test', () => {
    expect(describeLoad(summary({ peakUsers: 3, stoppedBy: 'rate-limit' }))).toBe(
      'The app asked the crowd to slow down with a 429 at 3 users, so the test stopped there. That is a rate limit doing its job.',
    );
    expect(describeLoad(summary({ peakUsers: 10, stoppedBy: 'budget' }))).toBe(
      'The test stopped at 10 users, because the request budget for the scan ran out.',
    );
  });

  it('says one user in the singular, and shows only whole numbers', () => {
    expect(describeLoad(summary({ peakUsers: 1, levels: [level(1, 50)] }))).toContain(
      'The crowd grew to 1 user and the app held up.',
    );
    expect(describeLoad(summary({ peakUsers: Number.NaN, levels: [] }))).toBe(
      'The crowd grew to 0 users and the app held up.',
    );
  });
});

describe('the load section of the report', () => {
  it('shows a chart and a table of the steps', () => {
    const html = renderHtml(sample());

    expect(html).toContain('How it held up under load');
    expect(html).toContain('<svg class="chart"');
    expect(html).toContain('<table class="load-table">');
    expect(html).toContain('15 users');
    expect(html).toContain('2400 ms');
    expect(html).toContain('The crowd grew to 25 users and the app held up.');
  });

  it('colours a step by what happened at it', () => {
    const load = summary({
      levels: [level(1, 150), level(2, 2_000), level(5, 300, 4)],
      stoppedBy: 'errors',
      breakAt: 5,
    });
    const html = renderHtml({ ...sample(), load });

    expect(html).toContain('class="bar bar-ok"');
    expect(html).toContain('class="bar bar-slow"');
    expect(html).toContain('class="bar bar-errors"');
  });

  it('is left out when The Mob did not run', () => {
    expect(renderHtml(withoutLoad())).not.toContain('How it held up under load');
  });

  it('escapes the name of a route that came from the app', () => {
    const load = summary({ stoppedBy: 'errors', breakAt: 25, weakSpot: 'GET /search?q=a&b=<tag>' });
    const output = renderHtml({ ...sample(), load });

    expect(output).not.toContain('<tag>');
    expect(output).toContain('GET /search?q=a&amp;b=&lt;tag&gt;');
  });

  it('does not let a tampered number reach the page', () => {
    const load = summary({ levels: [{ ...level(1, 100), users: 'many' as unknown as number }] });
    const output = renderHtml({ ...sample(), load });

    expect(output).not.toContain('many users');
    expect(output).toContain('>0 users</text>');
  });

  it('draws nothing from a load summary that has no steps', () => {
    const output = renderHtml({ ...sample(), load: summary({ levels: [] }) });

    expect(output).not.toContain('How it held up under load');
  });

  it('adds no inline style attributes', () => {
    expect(renderHtml(sample())).not.toMatch(/\sstyle=/i);
  });
});

describe('the load line of the terminal summary', () => {
  it('shows what the crowd did', () => {
    const text = formatSummary(sample());

    expect(text).toContain('Load');
    expect(text).toContain('The crowd grew to 25 users and the app held up.');
  });

  it('strips escape sequences that came from the app under test', () => {
    const load = summary({ stoppedBy: 'errors', breakAt: 25, weakSpot: `${esc}[31mGET /x` });

    expect(formatSummary({ ...sample(), load })).not.toContain(esc);
  });

  it('has no load line when The Mob did not run', () => {
    expect(formatSummary(withoutLoad())).not.toContain('Load');
  });
});
