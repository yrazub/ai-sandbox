import { describe, expect, it } from 'vitest';
import type { RunResult } from '../../shared/contracts';
import { failedCount, formatModelLabels, formatRunTime, promptExcerpt, totalCost } from './history-format';

const ok = (costUsd: number | null): RunResult => ({
  status: 'ok',
  modelId: 'a',
  output: 'x',
  latencyMs: 1,
  inputTokens: 1,
  outputTokens: 1,
  costUsd,
});
const err: RunResult = { status: 'error', modelId: 'b', error: 'boom', latencyMs: 1 };

describe('promptExcerpt', () => {
  it('returns a short line as is', () => {
    expect(promptExcerpt('hello')).toBe('hello');
  });
  it('cuts a 101-character line to 100 plus an ellipsis', () => {
    expect(promptExcerpt('a'.repeat(101))).toBe(`${'a'.repeat(100)}…`);
  });
  it('adds no ellipsis to a 100-character line', () => {
    expect(promptExcerpt('a'.repeat(100))).toBe('a'.repeat(100));
  });
  it('adds no ellipsis when only a later line is long', () => {
    expect(promptExcerpt(`short\n${'a'.repeat(300)}`)).toBe('short');
  });
  it('skips leading blank lines and spaces', () => {
    expect(promptExcerpt('\n   \n   hi there  \nnext')).toBe('hi there');
  });
});

describe('failedCount', () => {
  it('counts error results', () => {
    expect(failedCount([ok(1), err, err])).toBe(2);
  });
});

describe('totalCost', () => {
  it('sums ok results', () => {
    expect(totalCost([ok(0.5), ok(0.25)])).toBe(0.75);
  });
  it('ignores error results', () => {
    expect(totalCost([ok(0.5), err])).toBe(0.5);
  });
  it('is null when any ok result has no cost', () => {
    expect(totalCost([ok(0.5), ok(null)])).toBeNull();
  });
  it('is null when every result is an error', () => {
    expect(totalCost([err, err])).toBeNull();
  });
  it('sums free models to 0', () => {
    expect(totalCost([ok(0), ok(0)])).toBe(0);
  });
});

describe('formatModelLabels', () => {
  it('joins with a comma and a space', () => {
    expect(formatModelLabels([{ label: 'A' }, { label: 'B' }])).toBe('A, B');
  });
});

describe('formatRunTime', () => {
  it('uses medium date and short time', () => {
    const iso = '2026-03-04T05:06:07.000Z';
    expect(formatRunTime(iso)).toBe(
      new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    );
  });
});
