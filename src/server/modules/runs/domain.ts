import type { ModelInfo } from '../../../shared/contracts';
import type { ProviderModel } from './ports';

export const MAX_TOKENS_PER_CALL = 1024;
export const CALL_TIMEOUT_MS = 60_000;
export const CATALOG_TTL_MS = 60 * 60 * 1000;

const PER_MILLION = 1_000_000;

function perMillion(usdPerToken: number): number {
  // toPrecision removes float noise such as 4.000000000000001.
  return Number((usdPerToken * PER_MILLION).toPrecision(12));
}

/** Half-price duplicates of models that are already listed. */
function isBatchVariant(model: ProviderModel): boolean {
  return model.id.endsWith(':batch');
}

/** Routers report -1 because they have no fixed price. */
function hasNoFixedPrice(model: ProviderModel): boolean {
  return model.promptUsdPerToken < 0 || model.completionUsdPerToken < 0;
}

/** Filters, converts to per-million prices and sorts newest first. Free models stay. */
export function buildCatalog(models: ProviderModel[]): ModelInfo[] {
  return models
    .filter((model) => !isBatchVariant(model) && !hasNoFixedPrice(model))
    .sort((a, b) => b.created - a.created)
    .map((model) => ({
      id: model.id,
      label: model.name,
      inputUsdPerMTok: perMillion(model.promptUsdPerToken),
      outputUsdPerMTok: perMillion(model.completionUsdPerToken),
    }));
}
