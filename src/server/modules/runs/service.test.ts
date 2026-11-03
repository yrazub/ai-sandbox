import { describe, expect, it, vi } from 'vitest';
import { MockProvider } from '../../adapters/openrouter/mock-provider';
import { ProviderError, ValidationError } from '../../platform/errors';
import { createModelCatalog } from './model-catalog';
import type { Completion } from './ports';
import { createRunService } from './service';

function setup(provider: MockProvider, timeoutMs?: number) {
  const catalog = createModelCatalog({ provider });
  return createRunService({ provider, catalog, timeoutMs });
}

describe('run service', () => {
  it('returns one ok result per model', async () => {
    const provider = new MockProvider();
    const { results } = await setup(provider).run({
      prompt: 'hi',
      modelIds: ['mock/fast', 'mock/smart'],
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      status: 'ok',
      modelId: 'mock/fast',
      output: '[mock/fast] hi',
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.0001,
    });
  });

  it('keeps the selected order even when a later model answers first', async () => {
    const provider = new MockProvider({
      respond: async ({ modelId }) => {
        await new Promise((resolve) => setTimeout(resolve, modelId === 'mock/fast' ? 30 : 0));
        return { output: modelId, inputTokens: 1, outputTokens: 1, costUsd: null };
      },
    });
    const { results } = await setup(provider).run({
      prompt: 'hi',
      modelIds: ['mock/fast', 'mock/smart', 'mock/pricey'],
    });
    expect(results.map((r) => r.modelId)).toEqual(['mock/fast', 'mock/smart', 'mock/pricey']);
  });

  it('calls the models in parallel', async () => {
    let running = 0;
    let peak = 0;
    const provider = new MockProvider({
      respond: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 10));
        running -= 1;
        return { output: 'x', inputTokens: 1, outputTokens: 1, costUsd: null };
      },
    });
    await setup(provider).run({ prompt: 'hi', modelIds: ['mock/fast', 'mock/smart', 'mock/pricey'] });
    expect(peak).toBe(3);
  });

  it('lets the other models survive when one fails', async () => {
    const provider = new MockProvider({
      respond: ({ modelId }) => {
        if (modelId === 'mock/smart') throw new ProviderError('OpenRouter returned 429');
        return { output: 'fine', inputTokens: 1, outputTokens: 1, costUsd: 0.5 };
      },
    });
    const { results } = await setup(provider).run({
      prompt: 'hi',
      modelIds: ['mock/fast', 'mock/smart', 'mock/pricey'],
    });
    expect(results.map((r) => r.status)).toEqual(['ok', 'error', 'ok']);
    expect(results[1]).toMatchObject({ error: 'OpenRouter returned 429' });
  });

  it('hides the message of an unexpected error', async () => {
    const provider = new MockProvider({
      respond: () => {
        throw new Error('secret internals');
      },
    });
    const { results } = await setup(provider).run({ prompt: 'hi', modelIds: ['mock/fast'] });
    expect(results[0]).toMatchObject({ status: 'error', error: 'Unexpected error' });
  });

  it('turns a call that never answers into a timeout error', async () => {
    const provider = new MockProvider({
      respond: ({ modelId }) =>
        modelId === 'mock/fast'
          ? new Promise(() => {})
          : { output: 'fine', inputTokens: 1, outputTokens: 1, costUsd: null },
    });
    const { results } = await setup(provider, 20).run({
      prompt: 'hi',
      modelIds: ['mock/fast', 'mock/smart'],
    });
    expect(results[0]).toMatchObject({ status: 'error', error: 'Timed out after 0.02 s' });
    expect(results[1]).toMatchObject({ status: 'ok' });
  });

  it('aborts the call when it times out', async () => {
    const provider = new MockProvider({ respond: () => new Promise(() => {}) });
    await setup(provider, 10).run({ prompt: 'hi', modelIds: ['mock/fast'] });
    expect(provider.calls[0]?.signal.aborted).toBe(true);
  });

  it('calls no model when one is outside the list', async () => {
    const provider = new MockProvider();
    await expect(
      setup(provider).run({ prompt: 'hi', modelIds: ['mock/fast', 'evil/model'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(provider.calls).toHaveLength(0);
  });

  it('limits the answer length of every call', async () => {
    const provider = new MockProvider();
    await setup(provider).run({ prompt: 'hi', modelIds: ['mock/fast'] });
    expect(provider.calls[0]?.maxTokens).toBe(1024);
  });
});

describe('run service usage', () => {
  const zero = { inputTokens: 0, outputTokens: 0, costUsd: 0, okCalls: 0, unpricedCalls: 0 };

  /** A provider whose calls stay open until the test releases them by model id. */
  function deferredProvider() {
    const releases = new Map<string, (completion: Completion) => void>();
    const provider = new MockProvider({
      respond: ({ modelId }) =>
        new Promise<Completion>((resolve) => {
          releases.set(modelId, resolve);
        }),
    });
    return { provider, releases };
  }

  it('starts at zero, stamped with the time the service was created', () => {
    const fixedNow = Date.UTC(2026, 10, 3, 14, 2, 0);
    const provider = new MockProvider();
    const service = createRunService({
      provider,
      catalog: createModelCatalog({ provider }),
      now: () => fixedNow,
    });
    expect(service.usage()).toEqual({ ...zero, startedAt: new Date(fixedNow).toISOString() });
  });

  it('adds the ok results of a run', async () => {
    const service = setup(new MockProvider());
    await service.run({ prompt: 'hi', modelIds: ['mock/fast', 'mock/smart'] });
    expect(service.usage()).toMatchObject({
      inputTokens: 20,
      outputTokens: 40,
      costUsd: 0.0001 + 0.0001,
      okCalls: 2,
      unpricedCalls: 0,
    });
  });

  it('adds nothing for a model that times out', async () => {
    const provider = new MockProvider({
      respond: ({ modelId }) =>
        modelId === 'mock/fast'
          ? new Promise(() => {})
          : { output: 'fine', inputTokens: 3, outputTokens: 4, costUsd: 0.5 },
    });
    const service = setup(provider, 20);
    await service.run({ prompt: 'hi', modelIds: ['mock/fast', 'mock/smart'] });
    expect(service.usage()).toMatchObject({
      inputTokens: 3,
      outputTokens: 4,
      costUsd: 0.5,
      okCalls: 1,
      unpricedCalls: 0,
    });
  });

  it('adds nothing when the run is rejected for a model outside the list', async () => {
    const service = setup(new MockProvider());
    await expect(
      service.run({ prompt: 'hi', modelIds: ['mock/fast', 'evil/model'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(service.usage()).toMatchObject(zero);
  });

  it('adds nothing when the model list is unavailable', async () => {
    const service = setup(new MockProvider({ listError: new Error('down') }));
    await expect(service.run({ prompt: 'hi', modelIds: ['mock/fast'] })).rejects.toThrow();
    expect(service.usage()).toMatchObject(zero);
  });

  it('loses nothing when two runs overlap and finish in reverse order', async () => {
    const { provider, releases } = deferredProvider();
    const service = setup(provider);
    const first = service.run({ prompt: 'a', modelIds: ['mock/fast'] });
    const second = service.run({ prompt: 'b', modelIds: ['mock/smart'] });
    await vi.waitFor(() => expect(provider.calls).toHaveLength(2));

    releases.get('mock/smart')?.({ output: 'b', inputTokens: 100, outputTokens: 200, costUsd: 0.25 });
    await second;
    releases.get('mock/fast')?.({ output: 'a', inputTokens: 1, outputTokens: 2, costUsd: 0.5 });
    await first;

    expect(service.usage()).toMatchObject({
      inputTokens: 101,
      outputTokens: 202,
      costUsd: 0.25 + 0.5,
      okCalls: 2,
      unpricedCalls: 0,
    });
  });

  it('adds the results of a run whose promise the caller never awaits', async () => {
    const { provider, releases } = deferredProvider();
    const service = setup(provider);
    void service.run({ prompt: 'hi', modelIds: ['mock/fast'] });
    await vi.waitFor(() => expect(provider.calls).toHaveLength(1));
    expect(service.usage().okCalls).toBe(0);

    releases.get('mock/fast')?.({ output: 'x', inputTokens: 5, outputTokens: 6, costUsd: 0.5 });
    await vi.waitFor(() => expect(service.usage().okCalls).toBe(1));
    expect(service.usage()).toMatchObject({ inputTokens: 5, outputTokens: 6, costUsd: 0.5 });
  });
});
