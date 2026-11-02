import type { ModelInfo } from '../../../shared/contracts';
import { UnavailableError } from '../../platform/errors';
import { buildCatalog, CATALOG_TTL_MS } from './domain';
import type { LlmProvider } from './ports';

export interface ModelCatalog {
  get(): Promise<ModelInfo[]>;
}

interface Options {
  provider: Pick<LlmProvider, 'listModels'>;
  ttlMs?: number;
  now?: () => number;
}

/** Keeps the model list in memory. A failed refresh keeps the last good list. */
export function createModelCatalog({
  provider,
  ttlMs = CATALOG_TTL_MS,
  now = Date.now,
}: Options): ModelCatalog {
  let models: ModelInfo[] | undefined;
  let loadedAt = 0;
  let inFlight: Promise<void> | undefined;

  async function refresh(): Promise<void> {
    try {
      models = buildCatalog(await provider.listModels());
      loadedAt = now();
    } catch {
      // Keep whatever list we have; with none, get() reports unavailable.
    }
  }

  return {
    async get() {
      const fresh = models !== undefined && now() - loadedAt < ttlMs;
      if (!fresh) {
        inFlight ??= refresh().finally(() => {
          inFlight = undefined;
        });
        await inFlight;
      }
      if (!models) throw new UnavailableError('The model list is unavailable');
      return models;
    },
  };
}
