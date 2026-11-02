import { EXPENSIVE_OUTPUT_USD_PER_MTOK, type ModelInfo } from '../../shared/contracts';

export function filterModels(models: ModelInfo[], query: string): ModelInfo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return models;
  return models.filter(
    (model) => model.label.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle),
  );
}

export function isExpensive(model: ModelInfo): boolean {
  return model.outputUsdPerMTok > EXPENSIVE_OUTPUT_USD_PER_MTOK;
}

export function formatUsdPerMTok(price: number): string {
  const text = price >= 1 ? price.toFixed(2) : price.toFixed(3);
  return `$${text.replace(/\.?0+$/, '')}`;
}
