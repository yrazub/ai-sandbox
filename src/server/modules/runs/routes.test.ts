import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockProvider } from '../../adapters/openrouter/mock-provider';
import { OpenRouterProvider } from '../../adapters/openrouter/openrouter-provider';
import { buildApp } from '../../app';
import { MAX_PROMPT_CHARS } from '../../../shared/contracts';
import type { Completion } from './ports';

let app: FastifyInstance;
afterEach(() => app.close());

function start(provider = new MockProvider()) {
  app = buildApp({ provider });
  return provider;
}

describe('GET /api/models', () => {
  it('returns the catalog, newest first', async () => {
    start();
    const response = await app.inject({ method: 'GET', url: '/api/models' });
    expect(response.statusCode).toBe(200);
    expect(response.json().models.map((m: { id: string }) => m.id)).toEqual([
      'mock/fast',
      'mock/smart',
      'mock/pricey',
    ]);
    expect(response.json().models[1]).toEqual({
      id: 'mock/smart',
      label: 'Mock: Smart',
      inputUsdPerMTok: 5,
      outputUsdPerMTok: 25,
    });
  });

  it('answers 503 when the list is unavailable', async () => {
    start(new MockProvider({ listError: new Error('down') }));
    const response = await app.inject({ method: 'GET', url: '/api/models' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'The model list is unavailable' });
  });
});

describe('POST /api/runs', () => {
  const run = (payload: unknown) => app.inject({ method: 'POST', url: '/api/runs', payload: payload as object });

  it('runs a valid request', async () => {
    start();
    const response = await run({ prompt: 'hello', modelIds: ['mock/smart', 'mock/fast'] });
    expect(response.statusCode).toBe(200);
    const { results } = response.json();
    expect(results.map((r: { modelId: string }) => r.modelId)).toEqual(['mock/smart', 'mock/fast']);
    expect(results[0]).toMatchObject({ status: 'ok', output: '[mock/smart] hello' });
  });

  it('answers 200 with an error result when a model fails', async () => {
    start(
      new MockProvider({
        respond: () => {
          throw new Error('boom');
        },
      }),
    );
    const response = await run({ prompt: 'hello', modelIds: ['mock/fast'] });
    expect(response.statusCode).toBe(200);
    expect(response.json().results[0]).toMatchObject({ status: 'error', error: 'Unexpected error' });
  });

  it.each([
    ['a blank prompt', { prompt: '   ', modelIds: ['mock/fast'] }],
    ['a missing prompt', { modelIds: ['mock/fast'] }],
    ['a prompt over the limit', { prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1), modelIds: ['mock/fast'] }],
    ['no models', { prompt: 'hi', modelIds: [] }],
    [
      'more than 6 models',
      { prompt: 'hi', modelIds: ['a/1', 'a/2', 'a/3', 'a/4', 'a/5', 'a/6', 'a/7'] },
    ],
    ['duplicate models', { prompt: 'hi', modelIds: ['mock/fast', 'mock/fast'] }],
    ['a model not in the list', { prompt: 'hi', modelIds: ['mock/fast', 'evil/model'] }],
  ])('answers 400 and calls no model for %s', async (_name, payload) => {
    const provider = start();
    const response = await run(payload);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: expect.any(String) });
    expect(provider.calls).toHaveLength(0);
  });

  it('accepts a prompt of exactly the limit', async () => {
    start();
    const response = await run({ prompt: 'x'.repeat(MAX_PROMPT_CHARS), modelIds: ['mock/fast'] });
    expect(response.statusCode).toBe(200);
  });

  it('answers 400 for malformed JSON', async () => {
    start();
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(response.statusCode).toBe(400);
  });

  it('answers 503 when the list is unavailable', async () => {
    const provider = start(new MockProvider({ listError: new Error('down') }));
    const response = await run({ prompt: 'hi', modelIds: ['mock/fast'] });
    expect(response.statusCode).toBe(503);
    expect(provider.calls).toHaveLength(0);
  });
});

describe('GET /api/usage', () => {
  const post = (payload: object) => app.inject({ method: 'POST', url: '/api/runs', payload });
  const usage = () => app.inject({ method: 'GET', url: '/api/usage' });
  const zero = { inputTokens: 0, outputTokens: 0, costUsd: 0, okCalls: 0, unpricedCalls: 0 };

  it('answers zeros and the start time for a fresh app', async () => {
    const before = Date.now();
    start();
    const response = await usage();
    const after = Date.now();
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(
      ['costUsd', 'inputTokens', 'okCalls', 'outputTokens', 'startedAt', 'unpricedCalls'].sort(),
    );
    expect(body).toMatchObject(zero);
    expect(Date.parse(body.startedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(body.startedAt)).toBeLessThanOrEqual(after);
  });

  it('forbids caching the 200', async () => {
    start();
    const response = await usage();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('calls no provider and answers the same body twice', async () => {
    const provider = start();
    const first = await usage();
    const second = await usage();
    expect(provider.calls).toHaveLength(0);
    expect(provider.listCalls).toBe(0);
    expect(second.json()).toEqual(first.json());
  });

  it('reports the ok results of a finished run', async () => {
    start();
    const run = await post({ prompt: 'hi', modelIds: ['mock/fast', 'mock/smart'] });
    expect(run.statusCode).toBe(200);
    expect((await usage()).json()).toMatchObject({
      inputTokens: 20,
      outputTokens: 40,
      costUsd: 0.0001 + 0.0001,
      okCalls: 2,
      unpricedCalls: 0,
    });
  });

  it('leaves out the model that failed in a 200 run', async () => {
    start(
      new MockProvider({
        respond: ({ modelId }) => {
          if (modelId === 'mock/smart') throw new Error('boom');
          return { output: 'ok', inputTokens: 7, outputTokens: 9, costUsd: 0.5 };
        },
      }),
    );
    const run = await post({ prompt: 'hi', modelIds: ['mock/fast', 'mock/smart'] });
    expect(run.statusCode).toBe(200);
    expect((await usage()).json()).toMatchObject({
      inputTokens: 7,
      outputTokens: 9,
      costUsd: 0.5,
      okCalls: 1,
      unpricedCalls: 0,
    });
  });

  describe('after a rejected run', () => {
    it.each([
      ['a blank prompt', { prompt: '   ', modelIds: ['mock/fast'] }],
      ['a missing prompt', { modelIds: ['mock/fast'] }],
      ['a prompt over the limit', { prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1), modelIds: ['mock/fast'] }],
      ['no models', { prompt: 'hi', modelIds: [] }],
      [
        'more than 6 models',
        { prompt: 'hi', modelIds: ['a/1', 'a/2', 'a/3', 'a/4', 'a/5', 'a/6', 'a/7'] },
      ],
      ['duplicate models', { prompt: 'hi', modelIds: ['mock/fast', 'mock/fast'] }],
      ['a model not in the list', { prompt: 'hi', modelIds: ['mock/fast', 'evil/model'] }],
    ])('keeps the tally at zero for 400 on %s', async (_name, payload) => {
      start();
      expect((await post(payload)).statusCode).toBe(400);
      expect((await usage()).json()).toMatchObject(zero);
    });

    it('keeps the tally at zero for malformed JSON', async () => {
      start();
      const response = await app.inject({
        method: 'POST',
        url: '/api/runs',
        headers: { 'content-type': 'application/json' },
        payload: '{nope',
      });
      expect(response.statusCode).toBe(400);
      expect((await usage()).json()).toMatchObject(zero);
    });

    it('keeps the tally at zero for 503 when the model list is unavailable', async () => {
      start(new MockProvider({ listError: new Error('down') }));
      expect((await post({ prompt: 'hi', modelIds: ['mock/fast'] })).statusCode).toBe(503);
      expect((await usage()).json()).toMatchObject(zero);
    });

    it('keeps what earlier runs added', async () => {
      start();
      await post({ prompt: 'hi', modelIds: ['mock/fast'] });
      const before = (await usage()).json();
      expect(before.okCalls).toBe(1);
      expect((await post({ prompt: '   ', modelIds: ['mock/fast'] })).statusCode).toBe(400);
      expect((await usage()).json()).toEqual(before);
    });
  });

  it('adds both runs when two overlap and finish in reverse order', async () => {
    const releases = new Map<string, (completion: Completion) => void>();
    const provider = start(
      new MockProvider({
        respond: ({ modelId }) =>
          new Promise<Completion>((resolve) => {
            releases.set(modelId, resolve);
          }),
      }),
    );
    const first = post({ prompt: 'a', modelIds: ['mock/fast'] });
    const second = post({ prompt: 'b', modelIds: ['mock/smart'] });
    await vi.waitFor(() => expect(provider.calls).toHaveLength(2));

    releases.get('mock/smart')?.({ output: 'b', inputTokens: 100, outputTokens: 200, costUsd: 0.25 });
    releases.get('mock/fast')?.({ output: 'a', inputTokens: 1, outputTokens: 2, costUsd: 0.5 });
    expect((await first).statusCode).toBe(200);
    expect((await second).statusCode).toBe(200);

    expect((await usage()).json()).toMatchObject({
      inputTokens: 101,
      outputTokens: 202,
      costUsd: 0.25 + 0.5,
      okCalls: 2,
      unpricedCalls: 0,
    });
  });

  it('counts an ok call without a cost as unpriced', async () => {
    start(
      new MockProvider({
        respond: () => ({ output: 'x', inputTokens: 4, outputTokens: 5, costUsd: null }),
      }),
    );
    await post({ prompt: 'hi', modelIds: ['mock/fast'] });
    expect((await usage()).json()).toMatchObject({
      inputTokens: 4,
      outputTokens: 5,
      costUsd: 0,
      okCalls: 1,
      unpricedCalls: 1,
    });
  });

  it('answers a generic 500 with no tally value when the tally breaks the contract', async () => {
    start(
      new MockProvider({
        respond: () => ({ output: 'x', inputTokens: -5, outputTokens: 7, costUsd: 0.5 }),
      }),
    );
    expect((await post({ prompt: 'hi', modelIds: ['mock/fast'] })).statusCode).toBe(200);
    const response = await usage();
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal server error' });
    expect(response.body).not.toMatch(/\d/);
  });

  it('keeps a separate tally for each app', async () => {
    start();
    await post({ prompt: 'hi', modelIds: ['mock/fast'] });
    const firstApp = app;
    const firstUsage = (await usage()).json();
    start();
    try {
      expect(firstUsage.okCalls).toBe(1);
      expect((await usage()).json()).toMatchObject(zero);
    } finally {
      await firstApp.close();
    }
  });
});

describe('without OPENROUTER_API_KEY', () => {
  const modelsBody = {
    data: [
      { id: 'a/one', name: 'A: One', created: 2, pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'a/two', name: 'A: Two', created: 1, pricing: { prompt: '0.000001', completion: '0.000002' } },
    ],
  };

  it('loads the list, then reports the missing key on every card', async () => {
    const calls: string[] = [];
    const stubFetch = (async (url: string) => {
      calls.push(url);
      return Response.json(modelsBody);
    }) as unknown as typeof fetch;
    app = buildApp({ provider: new OpenRouterProvider({ getApiKey: () => undefined, fetch: stubFetch }) });

    const models = await app.inject({ method: 'GET', url: '/api/models' });
    expect(models.statusCode).toBe(200);

    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { prompt: 'hi', modelIds: ['a/one', 'a/two'] },
    });
    expect(response.statusCode).toBe(200);
    for (const result of response.json().results) {
      expect(result).toMatchObject({ status: 'error', error: 'OPENROUTER_API_KEY is not set' });
    }
    expect(calls.every((url) => url.endsWith('/models'))).toBe(true);
  });

  it('never returns the key, even when the upstream echoes it', async () => {
    const key = 'sk-or-test-key-1234567890';
    const stubFetch = (async (url: string) =>
      url.endsWith('/models')
        ? Response.json(modelsBody)
        : Response.json({ error: { message: `Invalid key ${key}` } }, { status: 401 })) as unknown as typeof fetch;
    app = buildApp({ provider: new OpenRouterProvider({ getApiKey: () => key, fetch: stubFetch }) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { prompt: 'hi', modelIds: ['a/one'] },
    });
    expect(response.body).not.toContain(key);
    expect(response.json().results[0]).toMatchObject({ status: 'error' });
  });
});
