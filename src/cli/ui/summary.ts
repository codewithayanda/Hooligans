import type { Severity } from '../../core/finding.js';
import type { Report, Verdict } from '../../core/report.js';
import { SEVERITY_LABEL, describeLoad, headline, hooliganName } from '../../report/voice.js';
import { cleanText } from '../../util/text.js';
import { bold, dim, green, red, yellow } from './color.js';

const TOP_COUNT = 5;

const VERDICT_PAINT: Readonly<Record<Verdict, (text: string) => string>> = {
  'nothing-serious': green,
  'almost-there': yellow,
  risky: red,
  'not-ready': red,
};

const SEVERITY_PAINT: Readonly<Record<Severity, (text: string) => string>> = {
  critical: red,
  high: red,
  medium: yellow,
  low: dim,
};

/** The terminal version of the report. Text from the app under test is cleaned first. */
export function formatSummary(report: Report, htmlPath?: string): string {
  const paintVerdict = VERDICT_PAINT[report.score.verdict] ?? dim;
  const lines: string[] = [];

  lines.push(
    `${bold(`Hooligan score ${report.score.value}/100`)}: ${paintVerdict(cleanText(report.score.label, 200))}`,
  );
  lines.push(headline(report));

  const top = report.findings.slice(0, TOP_COUNT);
  lines.push('');

  if (top.length === 0) {
    lines.push('No problems to fix from what ran.');
  } else {
    lines.push(bold('Fix these first'));
    top.forEach((finding, index) => {
      const label = (SEVERITY_LABEL[finding.severity] ?? 'Unknown').padEnd(8);
      const paintSeverity = SEVERITY_PAINT[finding.severity] ?? dim;
      const title = cleanText(finding.title, 200);
      lines.push(
        `  ${index + 1}. ${paintSeverity(label)} ${title} (${hooliganName(finding.hooligan)})`,
      );
    });
  }

  if (report.load) {
    lines.push('', bold('Load'), `  ${cleanText(describeLoad(report.load), 400)}`);
  }

  if (report.skipped.length > 0) {
    lines.push('', bold('Skipped'));
    for (const item of report.skipped.slice(0, 5)) {
      lines.push(`  ${hooliganName(item.id)}: ${cleanText(item.reason, 200)}`);
    }
    if (report.skipped.length > 5) lines.push(dim(`  and ${report.skipped.length - 5} more`));
  }

  if (report.notLookedAt.length > 0) {
    lines.push('', bold('Not looked at'));
    for (const item of report.notLookedAt.slice(0, 4)) lines.push(`  ${cleanText(item, 200)}`);
  }

  if (report.worthALook.length > 0) {
    lines.push('', dim(`${report.worthALook.length} more worth a look, in the report.`));
  }

  if (htmlPath) lines.push('', `Report: ${htmlPath}`);

  return lines.join('\n');
}
