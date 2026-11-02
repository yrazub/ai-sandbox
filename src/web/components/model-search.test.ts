import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '../../shared/contracts';
import { filterModels, formatUsdPerMTok, isExpensive } from './model-search';

const model = (id: string, label: string, out = 1): ModelInfo => ({
  id,
  label,
  inputUsdPerMTok: 1,
  outputUsdPerMTok: out,
});
const models = [
  model('anthropic/claude-opus-5.5', 'Anthropic: Claude Opus 5.5'),
  model('openai/gpt-6.1-terra', 'OpenAI: GPT-6.1 Terra'),
];

describe('filterModels', () => {
  it('matches the label, ignoring case', () => {
    expect(filterModels(models, 'OPUS').map((m) => m.id)).toEqual(['anthropic/claude-opus-5.5']);
  });

  it('matches the id', () => {
    expect(filterModels(models, 'openai/').map((m) => m.id)).toEqual(['openai/gpt-6.1-terra']);
  });

  it('returns everything for a blank query', () => {
    expect(filterModels(models, '  ')).toEqual(models);
  });
});

describe('isExpensive', () => {
  it('is true only above $30 per million output tokens', () => {
    expect(isExpensive(model('a', 'a', 30))).toBe(false);
    expect(isExpensive(model('a', 'a', 30.01))).toBe(true);
  });
});

describe('formatUsdPerMTok', () => {
  it.each([
    [0, '$0'],
    [4, '$4'],
    [20, '$20'],
    [0.05, '$0.05'],
    [0.5, '$0.5'],
    [1.25, '$1.25'],
    [75, '$75'],
  ])('formats %s as %s', (price, text) => {
    expect(formatUsdPerMTok(price)).toBe(text);
  });
});
