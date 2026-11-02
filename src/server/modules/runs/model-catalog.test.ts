import { describe, expect, it } from 'vitest';
import { MockProvider } from '../../adapters/openrouter/mock-provider';
import { UnavailableError } from '../../platform/errors';
import { createModelCatalog } from './model-catalog';

const HOUR = 60 * 60 * 1000;

function setup(provider = new MockProvider()) {
  let time = 0;
  const catalog = createModelCatalog({ provider, now: () => time });
  return { provider, catalog, advance: (ms: number) => (time += ms) };
}

describe('model catalog', () => {
  it('reuses the list inside one hour', async () => {
    const { provider, catalog, advance } = setup();
    await catalog.get();
    advance(HOUR - 1);
    await catalog.get();
    expect(provider.listCalls).toBe(1);
  });

  it('refreshes after one hour', async () => {
    const { provider, catalog, advance } = setup();
    await catalog.get();
    advance(HOUR);
    await catalog.get();
    expect(provider.listCalls).toBe(2);
  });

  it('shares one request between concurrent callers', async () => {
    const { provider, catalog } = setup();
    await Promise.all([catalog.get(), catalog.get(), catalog.get()]);
    expect(provider.listCalls).toBe(1);
  });

  it('keeps the last good list when a refresh fails', async () => {
    const { provider, catalog, advance } = setup();
    const first = await catalog.get();
    provider.failListing(new Error('down'));
    advance(HOUR);
    expect(await catalog.get()).toEqual(first);
  });

  it('reports unavailable when there is no list at all', async () => {
    const { catalog } = setup(new MockProvider({ listError: new Error('down') }));
    await expect(catalog.get()).rejects.toBeInstanceOf(UnavailableError);
  });

  it('retries on the next call after a failure with no list', async () => {
    const { provider, catalog } = setup(new MockProvider({ listError: new Error('down') }));
    await expect(catalog.get()).rejects.toThrow();
    provider.failListing(undefined);
    expect((await catalog.get()).length).toBeGreaterThan(0);
  });
});
