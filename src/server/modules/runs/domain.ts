import type { ModelInfo, RunResult, UsageResponse } from '../../../shared/contracts';
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

export type UsageTotals = Omit<UsageResponse, 'startedAt'>;

export const EMPTY_USAGE: Readonly<UsageTotals> = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  okCalls: 0,
  unpricedCalls: 0,
};

/** Adds the ok results of one run to the totals. Error results add nothing. No rounding. */
export function addRunToUsage(totals: UsageTotals, results: RunResult[]): UsageTotals {
  let { inputTokens, outputTokens, costUsd, okCalls, unpricedCalls } = totals;
  for (const result of results) {
    if (result.status !== 'ok') continue;
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    okCalls += 1;
    if (result.costUsd === null) {
      unpricedCalls += 1;
    } else {
      costUsd += result.costUsd;
    }
  }
  return { inputTokens, outputTokens, costUsd, okCalls, unpricedCalls };
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
