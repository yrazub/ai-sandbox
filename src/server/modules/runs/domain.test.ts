import { describe, expect, it } from 'vitest';
import { buildCatalog } from './domain';
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
