import { REPORT_SCHEMA_VERSION, type Report } from '../core/report.js';

export function serializeReport(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function parseReport(text: string): Report {
  const data: unknown = JSON.parse(text);
  const version = (data as { schemaVersion?: unknown } | null)?.schemaVersion;

  if (typeof data !== 'object' || version !== REPORT_SCHEMA_VERSION) {
    throw new Error(`This is not a Hooligans report (expected schema version ${REPORT_SCHEMA_VERSION}).`);
  }

  return data as Report;
}
