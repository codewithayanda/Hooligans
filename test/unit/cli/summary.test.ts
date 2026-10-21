import { beforeAll, describe, expect, it } from 'vitest';
import { setColorEnabled } from '../../../src/cli/ui/color.js';
import { formatSummary } from '../../../src/cli/ui/summary.js';
import { buildSampleReport } from '../../../src/report/sample.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const esc = String.fromCharCode(27);

beforeAll(() => {
  setColorEnabled(false);
});

describe('formatSummary', () => {
  const report = buildSampleReport({ runId: 'test-run', version: '0.0.0', now: NOW });

  it('leads with the score and the verdict', () => {
    const text = formatSummary(report);

    expect(text).toContain('Hooligan score 42/100: Risky');
    expect(text).toContain('6 hooligans got through.');
  });

  it('lists the top five by severity and names the hooligan', () => {
    const text = formatSummary(report);

    expect(text).toContain('Fix these first');
    expect(text).toContain('1. Critical Anyone can read your orders table (Door Rattler)');
    expect(text).not.toContain('6. ');
  });

  it('says what was not looked at', () => {
    expect(formatSummary(report)).toContain('Not looked at');
  });

  it('prints the report path when it has one', () => {
    expect(formatSummary(report, '/tmp/report.html')).toContain('Report: /tmp/report.html');
  });

  it('strips escape sequences that came from the app under test', () => {
    const hostile = {
      ...report,
      findings: report.findings.map((finding, index) =>
        index === 0 ? { ...finding, title: `${esc}[2J${finding.title}` } : finding,
      ),
    };

    expect(formatSummary(hostile)).not.toContain(esc);
  });
});
