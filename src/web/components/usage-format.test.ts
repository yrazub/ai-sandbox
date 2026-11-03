import { describe, expect, it } from 'vitest';
import type { UsageResponse } from '../../shared/contracts';
import { formatSessionStart, formatTokenTotal, formatUnpricedSuffix, formatUsageLine } from './usage-format';

const STARTED_AT = '2026-11-03T14:02:00.000Z';

const usage = (over: Partial<UsageResponse> = {}): UsageResponse => ({
  inputTokens: 12000,
  outputTokens: 400,
  costUsd: 0.004,
  okCalls: 3,
  unpricedCalls: 0,
  startedAt: STARTED_AT,
  ...over,
});

describe('formatTokenTotal', () => {
  it('sums input and output tokens and groups them by thousands in the given locale (AC-11)', () => {
    const tally = { inputTokens: 12000, outputTokens: 400 };
    expect(formatTokenTotal(tally, 'en-US')).toBe('12,400');
    expect(formatTokenTotal(tally, 'fr-FR')).toBe(new Intl.NumberFormat('fr-FR').format(12400));
  });
});

describe('formatUnpricedSuffix', () => {
  it('names the count of calls without cost, and is empty at zero (AC-16)', () => {
    expect(formatUnpricedSuffix(2)).toBe(' (2 calls without cost)');
    expect(formatUnpricedSuffix(0)).toBe('');
  });
});

describe('formatSessionStart', () => {
  it('gives the start as a short local time of day in the given locale (AC-33)', () => {
    expect(formatSessionStart(STARTED_AT, 'en-GB')).toBe(
      new Intl.DateTimeFormat('en-GB', { timeStyle: 'short' }).format(new Date(STARTED_AT)),
    );
  });
});

describe('formatUsageLine', () => {
  it('uses the result cards cost rule after the token total (AC-12)', () => {
    expect(formatUsageLine(usage({ costUsd: 0 }), 'en-US')).toContain('· $0');
    expect(formatUsageLine(usage({ costUsd: 0.00005 }), 'en-US')).toContain('· <$0.0001');
    expect(formatUsageLine(usage({ costUsd: 0.004 }), 'en-US')).toContain('· $0.0040');
    expect(formatUsageLine(usage({ costUsd: 1.5 }), 'en-US')).toContain('· $1.50');
  });

  it('starts with the session start time (AC-33)', () => {
    const start = formatSessionStart(STARTED_AT, 'en-GB');
    expect(formatUsageLine(usage(), 'en-GB').startsWith(`Session since ${start}: `)).toBe(true);
  });

  it('appends the unpriced suffix directly after the cost (AC-16)', () => {
    expect(formatUsageLine(usage({ unpricedCalls: 2 }), 'en-US').endsWith('$0.0040 (2 calls without cost)')).toBe(true);
  });

  it('reads "0 tokens · $0" for an all-zero tally with no suffix (AC-17)', () => {
    const zero = usage({ inputTokens: 0, outputTokens: 0, costUsd: 0, okCalls: 0, unpricedCalls: 0 });
    expect(formatUsageLine(zero, 'en-US')).toBe(`Session since ${formatSessionStart(STARTED_AT, 'en-US')}: 0 tokens · $0`);
  });
});
