import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Report } from '../../../src/core/report.js';
import { renderHtml } from '../../../src/report/render.js';
import { buildSampleReport } from '../../../src/report/sample.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const esc = String.fromCharCode(27);

function sample(): Report {
  return buildSampleReport({ runId: 'test-run', version: '0.0.0', now: NOW });
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

describe('renderHtml', () => {
  const report = sample();
  const html = renderHtml(report);

  it('shows the score, the verdict and the sample banner', () => {
    expect(html).toContain(`aria-label="Hooligan score ${report.score.value} out of 100"`);
    expect(html).toContain(report.score.label);
    expect(html).toContain('This is a sample report');
  });

  it('shows every section', () => {
    for (const heading of [
      'Fix these first',
      'Everything else',
      'Worth a look',
      'What Hooligans did',
      'What it did not look at',
    ]) {
      expect(html).toContain(heading);
    }
  });

  it('makes no external requests', () => {
    expect(html).not.toMatch(/(?:src|href|action)=["']https?:/i);
    expect(html).not.toContain('@import');
  });

  it('has no inline style attributes', () => {
    expect(html).not.toMatch(/\sstyle=/i);
  });

  it('locks the page down with a policy whose hashes match the inline style and script', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

    expect(html).toContain("default-src 'none'");
    expect(html).toContain(`style-src 'sha256-${sha256(style)}'`);
    expect(html).toContain(`script-src 'sha256-${sha256(script)}'`);
  });

  it('leaves no template placeholders behind', () => {
    expect(html).not.toContain('{{');
  });

  it('gives every prompt a copy button', () => {
    const buttons = html.match(/data-target="/g)?.length ?? 0;
    const prompts = html.match(/<pre id="prompt-/g)?.length ?? 0;

    expect(buttons).toBeGreaterThan(0);
    expect(buttons).toBe(prompts);
  });

  it('escapes text that came from the app under test', () => {
    const hostile: Report = {
      ...report,
      findings: report.findings.map((finding, index) =>
        index === 0
          ? {
              ...finding,
              title: '<img src=x onerror=alert(1)>',
              evidence: `${esc}[31mred</pre><script>alert(1)</script>`,
            }
          : finding,
      ),
    };
    const output = renderHtml(hostile);

    expect(output).not.toContain('<img src=x');
    expect(output).not.toContain('<script>alert(1)');
    expect(output).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(output).not.toContain(esc);
  });

  it('does not let a tampered severity or verdict reach a class name', () => {
    const hostile: Report = {
      ...report,
      score: { ...report.score, verdict: '"><script>' as Report['score']['verdict'] },
      findings: report.findings.map((finding) => ({
        ...finding,
        severity: '"><script>' as typeof finding.severity,
      })),
    };
    const output = renderHtml(hostile);

    expect(output).not.toContain('"><script>');
  });
});
