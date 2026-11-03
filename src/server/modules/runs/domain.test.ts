import { describe, expect, it } from 'vitest';
import type { RunResult } from '../../../shared/contracts';
import { addRunToUsage, buildCatalog, EMPTY_USAGE, type UsageTotals } from './domain';
import type { ProviderModel } from './ports';

function model(overrides: Partial<ProviderModel> & { id: string }): ProviderModel {
  return {
    name: overrides.id,
    created: 1,
    promptUsdPerToken: 0.000001,
    completionUsdPerToken: 0.000002,
    ...overrides,
  };
}

describe('buildCatalog', () => {
  it('drops :batch variants', () => {
    const ids = buildCatalog([model({ id: 'a/m' }), model({ id: 'a/m:batch' })]).map((m) => m.id);
    expect(ids).toEqual(['a/m']);
  });

  it('drops models with a negative price', () => {
    const ids = buildCatalog([
      model({ id: 'a/ok' }),
      model({ id: 'openrouter/auto', promptUsdPerToken: -1, completionUsdPerToken: -1 }),
      model({ id: 'a/half', completionUsdPerToken: -1 }),
    ]).map((m) => m.id);
    expect(ids).toEqual(['a/ok']);
  });

  it('keeps free models', () => {
    const [free] = buildCatalog([
      model({ id: 'a/free:free', promptUsdPerToken: 0, completionUsdPerToken: 0 }),
    ]);
    expect(free).toMatchObject({ inputUsdPerMTok: 0, outputUsdPerMTok: 0 });
  });

  it('converts per-token prices to per-million without float noise', () => {
    const [opus] = buildCatalog([
      model({ id: 'a/opus', name: 'Opus', promptUsdPerToken: 0.000004, completionUsdPerToken: 0.00002 }),
    ]);
    expect(opus).toEqual({ id: 'a/opus', label: 'Opus', inputUsdPerMTok: 4, outputUsdPerMTok: 20 });
  });

  it('sorts newest first', () => {
    const ids = buildCatalog([
      model({ id: 'old', created: 1 }),
      model({ id: 'new', created: 3 }),
      model({ id: 'mid', created: 2 }),
    ]).map((m) => m.id);
    expect(ids).toEqual(['new', 'mid', 'old']);
  });
});

function okResult(overrides: Partial<Extract<RunResult, { status: 'ok' }>> = {}): RunResult {
  return {
    status: 'ok',
    modelId: 'a/m',
    output: 'x',
    latencyMs: 1,
    inputTokens: 10,
    outputTokens: 20,
    costUsd: 0.5,
    ...overrides,
  };
}

function errorResult(): RunResult {
  return { status: 'error', modelId: 'a/m', error: 'boom', latencyMs: 1 };
}

describe('addRunToUsage', () => {
  it('adds the tokens, costs and ok calls of two ok results', () => {
    const totals = addRunToUsage(EMPTY_USAGE, [
      okResult({ inputTokens: 10, outputTokens: 20, costUsd: 0.5 }),
      okResult({ inputTokens: 1, outputTokens: 2, costUsd: 0.25 }),
    ]);
    expect(totals).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      costUsd: 0.75,
      okCalls: 2,
      unpricedCalls: 0,
    });
  });

  it('adds nothing for an error result', () => {
    const totals = addRunToUsage(EMPTY_USAGE, [
      okResult({ inputTokens: 3, outputTokens: 4, costUsd: 0.5 }),
      errorResult(),
    ]);
    expect(totals).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      costUsd: 0.5,
      okCalls: 1,
      unpricedCalls: 0,
    });
    expect(addRunToUsage(EMPTY_USAGE, [errorResult()])).toEqual(EMPTY_USAGE);
  });

  it('counts an ok result without a cost as unpriced and leaves the cost alone', () => {
    const before: UsageTotals = {
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.5,
      okCalls: 1,
      unpricedCalls: 0,
    };
    const totals = addRunToUsage(before, [okResult({ inputTokens: 7, outputTokens: 8, costUsd: null })]);
    expect(totals).toEqual({
      inputTokens: 8,
      outputTokens: 9,
      costUsd: 0.5,
      okCalls: 2,
      unpricedCalls: 1,
    });
  });

  it('counts a free, empty ok result as a call but not as unpriced', () => {
    const before: UsageTotals = {
      inputTokens: 5,
      outputTokens: 6,
      costUsd: 0.5,
      okCalls: 1,
      unpricedCalls: 0,
    };
    const totals = addRunToUsage(before, [okResult({ inputTokens: 0, outputTokens: 0, costUsd: 0 })]);
    expect(totals).toEqual({
      inputTokens: 5,
      outputTokens: 6,
      costUsd: 0.5,
      okCalls: 2,
      unpricedCalls: 0,
    });
  });

  it('sums costs without rounding', () => {
    const totals = addRunToUsage(EMPTY_USAGE, [okResult({ costUsd: 0.1 }), okResult({ costUsd: 0.2 })]);
    expect(totals.costUsd).toBe(0.1 + 0.2);
    expect(totals.costUsd).not.toBe(0.3);
  });

  it('returns a new object and does not mutate the totals it was given', () => {
    const before: UsageTotals = {
      inputTokens: 1,
      outputTokens: 2,
      costUsd: 0.5,
      okCalls: 1,
      unpricedCalls: 0,
    };
    const snapshot = { ...before };
    const after = addRunToUsage(before, [okResult(), okResult({ costUsd: null })]);
    expect(before).toEqual(snapshot);
    expect(after).not.toBe(before);
    expect(EMPTY_USAGE).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0, okCalls: 0, unpricedCalls: 0 });
  });
});
