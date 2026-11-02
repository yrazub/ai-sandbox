import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockProvider } from '../../adapters/openrouter/mock-provider';
import { OpenRouterProvider } from '../../adapters/openrouter/openrouter-provider';
import { buildApp } from '../../app';
import { MAX_PROMPT_CHARS } from '../../../shared/contracts';

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
