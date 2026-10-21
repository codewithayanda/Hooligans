import type { Finding } from '../core/finding.js';
import { compareFindings } from './rank.js';

/** One root cause, one finding. The most serious copy leads and the places affected are merged. */
export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const group = groups.get(finding.rootCause);
    if (group) group.push(finding);
    else groups.set(finding.rootCause, [finding]);
  }

  const merged: Finding[] = [];
  for (const group of groups.values()) {
    const lead = [...group].sort(compareFindings)[0];
    if (!lead) continue;

    const affected = [...new Set(group.flatMap((finding) => finding.affected))].sort();
    merged.push({ ...lead, affected });
  }

  return merged;
}
