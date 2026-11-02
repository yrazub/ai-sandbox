import type { RunResult } from '../../shared/contracts';

const EXCERPT_MAX_CHARS = 100;

export function formatRunTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** The first non-blank line, trimmed; "…" only when that line is over 100 characters. */
export function promptExcerpt(prompt: string): string {
  const line = prompt.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
  const chars = Array.from(line);
  if (chars.length <= EXCERPT_MAX_CHARS) return line;
  return `${chars.slice(0, EXCERPT_MAX_CHARS).join('')}…`;
}

export function failedCount(results: RunResult[]): number {
  return results.filter((r) => r.status === 'error').length;
}

/** Sum of the ok results; null when none is ok or any ok result has no cost. */
export function totalCost(results: RunResult[]): number | null {
  let total = 0;
  let anyOk = false;
  for (const r of results) {
    if (r.status !== 'ok') continue;
    if (r.costUsd === null) return null;
    anyOk = true;
    total += r.costUsd;
  }
  return anyOk ? total : null;
}

export function formatModelLabels(models: { label: string }[]): string {
  return models.map((m) => m.label).join(', ');
}
