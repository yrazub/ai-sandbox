import { z } from 'zod';
import {
  MAX_MODELS_PER_RUN,
  RunRequest,
  RunResult,
  type ModelInfo,
} from '../../shared/contracts';

export const HISTORY_KEY = 'ai-sandbox:history:v1';
export const MAX_HISTORY_ENTRIES = 50;

export const HistoryModel = z.object({ id: z.string().min(1), label: z.string().min(1) });
export type HistoryModel = z.infer<typeof HistoryModel>;

export const HistoryEntry = z
  .object({
    id: z.string().min(1),
    createdAt: z.iso.datetime(),
    prompt: RunRequest.shape.prompt,
    models: z
      .array(HistoryModel)
      .min(1)
      .max(MAX_MODELS_PER_RUN)
      .refine((m) => new Set(m.map((x) => x.id)).size === m.length, 'model ids must be unique'),
    results: z.array(RunResult),
  })
  .refine(
    (e) =>
      e.results.length === e.models.length && e.results.every((r, i) => r.modelId === e.models[i]!.id),
    'results must match models in order',
  );
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export type HistoryRead = { status: 'available'; entries: HistoryEntry[] } | { status: 'unavailable' };
export type SaveOutcome = 'saved' | 'not-saved' | 'unavailable';

type GetStorage = () => Storage;

export function browserStorage(): Storage {
  return window.localStorage;
}

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

/** Newest first, one entry per id (the newest), at most MAX_HISTORY_ENTRIES. */
function normalize(entries: HistoryEntry[]): HistoryEntry[] {
  const sorted = [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const entry of sorted) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out.slice(0, MAX_HISTORY_ENTRIES);
}

export function readHistory(getStorage: GetStorage = browserStorage): HistoryRead {
  let raw: string | null;
  try {
    raw = getStorage().getItem(HISTORY_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'available', entries: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'available', entries: [] };
  }
  if (!Array.isArray(parsed)) return { status: 'available', entries: [] };
  const valid: HistoryEntry[] = [];
  for (const item of parsed) {
    const result = HistoryEntry.safeParse(item);
    if (result.success) valid.push(result.data);
  }
  return { status: 'available', entries: normalize(valid) };
}

function currentEntries(getStorage: GetStorage): HistoryEntry[] {
  const read = readHistory(getStorage);
  return read.status === 'available' ? read.entries : [];
}

export function saveEntry(entry: HistoryEntry, getStorage: GetStorage = browserStorage): SaveOutcome {
  try {
    const storage = getStorage();
    let list = normalize([entry, ...currentEntries(getStorage).filter((e) => e.id !== entry.id)]);
    for (;;) {
      try {
        storage.setItem(HISTORY_KEY, JSON.stringify(list));
        return 'saved';
      } catch (e) {
        if (!isQuotaError(e)) return 'unavailable';
        if (list.length <= 1) return 'not-saved';
        // Drop the oldest entry that is not the new one (the list is newest first).
        const index = list.length - 1;
        list = list.filter((_, i) => i !== (list[index]!.id === entry.id ? index - 1 : index));
      }
    }
  } catch {
    return 'unavailable';
  }
}

export function deleteEntry(id: string, getStorage: GetStorage = browserStorage): 'saved' | 'unavailable' {
  try {
    const storage = getStorage();
    const list = currentEntries(getStorage).filter((e) => e.id !== id);
    storage.setItem(HISTORY_KEY, JSON.stringify(list));
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

export function clearHistory(getStorage: GetStorage = browserStorage): 'saved' | 'unavailable' {
  try {
    getStorage().setItem(HISTORY_KEY, JSON.stringify([]));
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

/** Pairs each model ID with its live label, or the ID itself when the list lacks it or its label is empty. */
export function modelLabels(modelIds: string[], models: ModelInfo[] | undefined): HistoryModel[] {
  return modelIds.map((id) => {
    const label = models?.find((m) => m.id === id)?.label;
    return { id, label: label ? label : id };
  });
}

export function buildHistoryEntry(input: {
  request: RunRequest;
  results: RunResult[];
  models: ModelInfo[] | undefined;
  id?: string;
  createdAt?: string;
}): HistoryEntry {
  const { request, results, models } = input;
  return {
    id: input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    prompt: request.prompt,
    models: modelLabels(request.modelIds, models),
    results,
  };
}
