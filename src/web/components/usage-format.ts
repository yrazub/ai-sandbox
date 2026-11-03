import type { UsageResponse } from '../../shared/contracts';
import { formatCost } from './result-format';

/** `locale` undefined means the browser locale. */
export function formatTokenTotal(
  usage: Pick<UsageResponse, 'inputTokens' | 'outputTokens'>,
  locale?: string,
): string {
  return new Intl.NumberFormat(locale).format(usage.inputTokens + usage.outputTokens);
}

export function formatUnpricedSuffix(unpricedCalls: number): string {
  return unpricedCalls >= 1 ? ` (${unpricedCalls} calls without cost)` : '';
}

export function formatSessionStart(startedAt: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(startedAt));
}

export function formatUsageLine(usage: UsageResponse, locale?: string): string {
  return `Session since ${formatSessionStart(usage.startedAt, locale)}: ${formatTokenTotal(usage, locale)} tokens · ${formatCost(usage.costUsd)}${formatUnpricedSuffix(usage.unpricedCalls)}`;
}
