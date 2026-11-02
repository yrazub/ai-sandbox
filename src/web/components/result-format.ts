export function formatLatency(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** A missing cost is `n/a`, never `$0`: a zero cost is a real answer, a missing one is not. */
export function formatCost(costUsd: number | null): string {
  if (costUsd === null) return 'n/a';
  if (costUsd === 0) return '$0';
  if (costUsd < 0.0001) return '<$0.0001';
  return `$${costUsd >= 1 ? costUsd.toFixed(2) : costUsd.toFixed(4)}`;
}
