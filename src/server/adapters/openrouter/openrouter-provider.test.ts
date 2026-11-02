import { describe, expect, it } from 'vitest';
import { OpenRouterProvider } from './openrouter-provider';

const KEY = 'sk-or-test-key-1234567890';

function provider(respond: (url: string, init?: RequestInit) => Response, key: string | null = KEY) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const stubFetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { requests, provider: new OpenRouterProvider({ getApiKey: () => key ?? undefined, fetch: stubFetch }) };
}

const request = (signal = new AbortController().signal) => ({
  modelId: 'a/m',
  prompt: 'hello',
  maxTokens: 1024,
  signal,
});

describe('OpenRouterProvider.complete', () => {
  it('maps text, tokens and cost', async () => {
    const { provider: p, requests } = provider(() =>
      Response.json({
        choices: [{ message: { content: 'Hi there' } }],
        usage: { prompt_tokens: 7, completion_tokens: 3, cost: 0.0021 },
      }),
    );
    expect(await p.complete(request())).toEqual({
      output: 'Hi there',
      inputTokens: 7,
      outputTokens: 3,
      costUsd: 0.0021,
    });
    const sent = JSON.parse(requests[0]?.init?.body as string);
    expect(sent).toEqual({
      model: 'a/m',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 1024,
    });
    expect((requests[0]?.init?.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });

  it('turns a missing cost into null, not zero', async () => {
    const { provider: p } = provider(() =>
      Response.json({
        choices: [{ message: { content: 'x' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    expect((await p.complete(request())).costUsd).toBeNull();
  });

  it('keeps a zero cost as zero', async () => {
    const { provider: p } = provider(() =>
      Response.json({
        choices: [{ message: { content: 'x' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 },
      }),
    );
    expect((await p.complete(request())).costUsd).toBe(0);
  });

  it('returns empty text when the model sends no content', async () => {
    const { provider: p } = provider(() =>
      Response.json({ choices: [{ message: { content: null } }], usage: { cost: 0.01 } }),
    );
    expect((await p.complete(request())).output).toBe('');
  });

  it('throws an error without the key on a non-2xx response', async () => {
    const { provider: p } = provider(() =>
      Response.json({ error: { message: `bad key ${KEY}` } }, { status: 401 }),
    );
    const error = await p.complete(request()).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).not.toContain(KEY);
  });

  it('throws on a 200 response that carries an error body', async () => {
    const { provider: p } = provider(() => Response.json({ error: { message: 'upstream failed' } }));
    await expect(p.complete(request())).rejects.toThrow('upstream failed');
  });

  it('throws a generic error when the response has an unexpected shape', async () => {
    const { provider: p } = provider(() => Response.json({ hello: 'world' }));
    await expect(p.complete(request())).rejects.toThrow('Unexpected response from OpenRouter');
  });

  it('throws a generic error when the network fails', async () => {
    const { provider: p } = provider(() => {
      throw new TypeError(`fetch failed for key ${KEY}`);
    });
    const error = await p.complete(request()).catch((e: Error) => e);
    expect((error as Error).message).toBe('Could not reach OpenRouter');
  });

  it('gives the AC-9 message and makes no request when the key is missing', async () => {
    const { provider: p, requests } = provider(() => Response.json({}), null);
    await expect(p.complete(request())).rejects.toThrow('OPENROUTER_API_KEY is not set');
    expect(requests).toHaveLength(0);
  });
});

describe('OpenRouterProvider.listModels', () => {
  it('maps entries and converts string prices to numbers', async () => {
    const { provider: p, requests } = provider(() =>
      Response.json({
        data: [
          { id: 'a/m', name: 'A: M', created: 5, pricing: { prompt: '0.000004', completion: '0.00002' } },
        ],
      }),
    );
    expect(await p.listModels()).toEqual([
      { id: 'a/m', name: 'A: M', created: 5, promptUsdPerToken: 0.000004, completionUsdPerToken: 0.00002 },
    ]);
    expect(requests[0]?.url).toMatch(/\/models$/);
  });

  it('sends no key to the public list', async () => {
    const { provider: p, requests } = provider(() => Response.json({ data: [] }));
    await p.listModels();
    expect(JSON.stringify(requests[0]?.init)).not.toContain(KEY);
  });

  it('skips a malformed entry instead of failing', async () => {
    const { provider: p } = provider(() =>
      Response.json({
        data: [
          { id: 'a/good', name: 'Good', created: 1, pricing: { prompt: '0', completion: '0' } },
          { id: 'a/no-pricing', name: 'Bad', created: 1 },
          { id: 'a/bad-price', name: 'Bad', created: 1, pricing: { prompt: 'abc', completion: '1' } },
          'garbage',
          null,
        ],
      }),
    );
    expect((await p.listModels()).map((m) => m.id)).toEqual(['a/good']);
  });

  it('throws when the list request fails', async () => {
    const { provider: p } = provider(() => new Response('nope', { status: 500 }));
    await expect(p.listModels()).rejects.toThrow('500');
  });
});
