/** The number that `fraction` of the sorted numbers do not pass, by nearest rank. Zero for none. */
export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;

  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(fraction * sorted.length)));
  return sorted[rank - 1] ?? 0;
}
