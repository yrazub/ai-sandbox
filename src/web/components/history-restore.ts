import type { ModelInfo } from '../../shared/contracts';
import type { HistoryModel } from '../lib/history-storage';

/**
 * Which stored models a restore selects. Before the live list has loaded, every stored ID is kept;
 * afterwards, models the list no longer offers are left out and reported.
 */
export function restoreSelection(
  stored: HistoryModel[],
  live: ModelInfo[] | undefined,
): { selectedIds: string[]; leftOut: HistoryModel[] } {
  if (!live) return { selectedIds: stored.map((m) => m.id), leftOut: [] };
  const available = new Set(live.map((m) => m.id));
  return {
    selectedIds: stored.filter((m) => available.has(m.id)).map((m) => m.id),
    leftOut: stored.filter((m) => !available.has(m.id)),
  };
}
