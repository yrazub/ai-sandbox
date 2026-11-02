import { describe, expect, it } from 'vitest';
import { formatCost, formatLatency } from './result-format';

describe('formatCost', () => {
  it('shows n/a for a missing cost, never $0', () => {
    expect(formatCost(null)).toBe('n/a');
  });

  it('shows a real zero as $0', () => {
    expect(formatCost(0)).toBe('$0');
  });

  it.each([
    [0.0021, '$0.0021'],
    [0.00000123, '<$0.0001'],
    [1.5, '$1.50'],
  ])('formats %s as %s', (cost, text) => {
    expect(formatCost(cost)).toBe(text);
  });
});

describe('formatLatency', () => {
  it('shows seconds with one decimal', () => {
    expect(formatLatency(2140)).toBe('2.1 s');
  });
});
