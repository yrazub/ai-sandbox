import { z } from 'zod';
import { ProviderError } from '../../platform/errors';
import type {
  Completion,
  CompletionRequest,
  LlmProvider,
  ProviderModel,
} from '../../modules/runs/ports';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MAX_ERROR_CHARS = 300;

const Price = z
  .union([z.string().min(1), z.number()])
  .transform(Number)
  .pipe(z.number().finite());

const ModelEntry = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  created: z.number(),
  pricing: z.object({ prompt: Price, completion: Price }),
});

const ModelsBody = z.object({ data: z.array(z.unknown()) });

const CompletionBody = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }) })).min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      cost: z.number().nullish(),
    })
    .optional(),
});

const ErrorBody = z.object({ error: z.object({ message: z.string() }) });

interface Options {
  /** Read on every call, so the server can boot without a key. */
  getApiKey: () => string | undefined;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export class OpenRouterProvider implements LlmProvider {
  private readonly getApiKey: () => string | undefined;
  private readonly fetch: typeof fetch;
  private readonly baseUrl: string;

  constructor({ getApiKey, fetch: fetchImpl = fetch, baseUrl = BASE_URL }: Options) {
    this.getApiKey = getApiKey;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
  }

  async listModels(): Promise<ProviderModel[]> {
    // The public list needs no key.
    const response = await this.send(`${this.baseUrl}/models`, { method: 'GET' });
    const body = ModelsBody.safeParse(await readJson(response));
    if (!response.ok || !body.success) {
      throw new ProviderError(`OpenRouter model list failed (${response.status})`);
    }
    const models: ProviderModel[] = [];
    for (const raw of body.data.data) {
      const entry = ModelEntry.safeParse(raw);
      if (!entry.success) continue; // a malformed entry is skipped, not fatal
      models.push({
        id: entry.data.id,
        name: entry.data.name,
        created: entry.data.created,
        promptUsdPerToken: entry.data.pricing.prompt,
        completionUsdPerToken: entry.data.pricing.completion,
      });
    }
    return models;
  }

  async complete({ modelId, prompt, maxTokens, signal }: CompletionRequest): Promise<Completion> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new ProviderError('OPENROUTER_API_KEY is not set');

    const response = await this.send(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
        signal,
      },
      apiKey,
    );
    const json = await readJson(response);

    if (!response.ok) {
      const message = ErrorBody.safeParse(json);
      throw new ProviderError(
        scrub(
          `OpenRouter returned ${response.status}${message.success ? `: ${message.data.error.message}` : ''}`,
          apiKey,
        ).slice(0, MAX_ERROR_CHARS),
      );
    }
    // OpenRouter can answer 200 with an error body when the upstream model fails.
    const failure = ErrorBody.safeParse(json);
    if (failure.success) {
      throw new ProviderError(scrub(failure.data.error.message, apiKey).slice(0, MAX_ERROR_CHARS));
    }
    const body = CompletionBody.safeParse(json);
    if (!body.success) throw new ProviderError('Unexpected response from OpenRouter');

    return {
      output: body.data.choices[0]?.message.content ?? '',
      inputTokens: body.data.usage?.prompt_tokens ?? 0,
      outputTokens: body.data.usage?.completion_tokens ?? 0,
      costUsd: body.data.usage?.cost ?? null,
    };
  }

  private async send(url: string, init: RequestInit, apiKey?: string): Promise<Response> {
    try {
      return await this.fetch(url, init);
    } catch {
      // Never forward the raw error: it can carry request details.
      throw new ProviderError(scrub('Could not reach OpenRouter', apiKey));
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function scrub(text: string, apiKey: string | undefined): string {
  return apiKey ? text.split(apiKey).join('[redacted]') : text;
}
