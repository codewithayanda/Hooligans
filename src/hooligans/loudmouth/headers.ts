import type { AppMap, PageInfo } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import { missingCsp, missingFrameProtection, missingNosniff, serverBanner } from './findings.js';

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** The pages that are documents. Only they need page headers: not a failed page, not a file. */
export function documents(map: AppMap): PageInfo[] {
  return map.pages.filter((page) => {
    const type = page.headers['content-type'] ?? '';
    return page.status >= 200 && page.status < 400 && (type === '' || /html/i.test(type));
  });
}

/** What the pages say in their headers: one finding for each header, listing every page. */
export function checkHeaders(map: AppMap): Finding[] {
  const pages = documents(map);
  const findings: Finding[] = [];

  const without = (has: (headers: Record<string, string>) => boolean): string[] => [
    ...new Set(pages.filter((page) => !has(page.headers)).map((page) => pathOf(page.url))),
  ];

  const noCsp = without((headers) => headers['content-security-policy'] !== undefined);
  if (noCsp.length > 0) findings.push(missingCsp(map, noCsp));

  const noFrame = without(
    (headers) =>
      headers['x-frame-options'] !== undefined ||
      /frame-ancestors/i.test(headers['content-security-policy'] ?? ''),
  );
  if (noFrame.length > 0) findings.push(missingFrameProtection(map, noFrame));

  const noSniff = without((headers) => /nosniff/i.test(headers['x-content-type-options'] ?? ''));
  if (noSniff.length > 0) findings.push(missingNosniff(map, noSniff));

  const announcing = pages.filter((page) => page.headers['x-powered-by'] !== undefined);
  const value = announcing[0]?.headers['x-powered-by'];
  if (value !== undefined) {
    const paths = [...new Set(announcing.map((page) => pathOf(page.url)))];
    findings.push(serverBanner(map, paths, value));
  }

  return findings;
}
