import type {
  ModelInfo,
  RunRequest,
  RunResponse,
  RunResult,
  UsageResponse,
} from '../../../shared/contracts';
import { AppError, ValidationError } from '../../platform/errors';
import {
  addRunToUsage,
  CALL_TIMEOUT_MS,
  EMPTY_USAGE,
  MAX_TOKENS_PER_CALL,
  type UsageTotals,
} from './domain';
import type { ModelCatalog } from './model-catalog';
import type { LlmProvider } from './ports';

export interface RunService {
  models(): Promise<ModelInfo[]>;
  run(request: RunRequest): Promise<RunResponse>;
  usage(): UsageResponse;
}

interface Options {
  provider: Pick<LlmProvider, 'complete'>;
  catalog: ModelCatalog;
  timeoutMs?: number;
  now?: () => number;
}

export function createRunService({
  provider,
  catalog,
  timeoutMs = CALL_TIMEOUT_MS,
  now = Date.now,
}: Options): RunService {
  // In-memory tally of the ok calls since this service was created. Never persisted.
  const tallyStartedAt = new Date(now()).toISOString();
  let totals: UsageTotals = EMPTY_USAGE;

  async function runOne(modelId: string, prompt: string): Promise<RunResult> {
    const startedAt = now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AppError(`Timed out after ${timeoutMs / 1000} s`, 504));
      }, timeoutMs);
    });
    try {
      const completion = await Promise.race([
        provider.complete({
          modelId,
          prompt,
          maxTokens: MAX_TOKENS_PER_CALL,
          signal: controller.signal,
        }),
        timeout,
      ]);
      return { status: 'ok', modelId, latencyMs: now() - startedAt, ...completion };
    } catch (error) {
      // Only AppError messages are written to be shown; anything else stays generic.
      const message = error instanceof AppError ? error.message : 'Unexpected error';
      return { status: 'error', modelId, error: message, latencyMs: now() - startedAt };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    models: () => catalog.get(),

    async run({ prompt, modelIds }) {
      const known = new Set((await catalog.get()).map((model) => model.id));
      const unknown = modelIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new ValidationError(`Unknown model: ${unknown.join(', ')}`);
      }
      // Promise.all keeps the order of modelIds.
      const results = await Promise.all(modelIds.map((id) => runOne(id, prompt)));
      // Read and written in this one synchronous statement, so concurrent runs lose nothing.
      totals = addRunToUsage(totals, results);
      return { results };
    },

    usage: () => ({ ...totals, startedAt: tallyStartedAt }),
  };
}
