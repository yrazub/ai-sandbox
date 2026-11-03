import { describe, expect, it } from 'vitest';
import type { ModelInfo, RunResult } from '../../shared/contracts';
import {
  HISTORY_KEY,
  HistoryEntry,
  buildHistoryEntry,
  clearHistory,
  deleteEntry,
  modelLabels,
  readHistory,
  saveEntry,
} from './history-storage';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const quota = () => new DOMException('full', 'QuotaExceededError');

const okResult = (modelId: string): RunResult => ({
  status: 'ok',
  modelId,
  output: 'hi',
  latencyMs: 100,
  inputTokens: 1,
  outputTokens: 2,
  costUsd: 0.01,
});

function entry(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `id-${n}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
    prompt: `prompt ${n}`,
    models: [{ id: 'a/m', label: 'M' }],
    results: [okResult('a/m')],
    ...over,
  };
}

function store(raw?: unknown) {
  const s = new MemoryStorage();
  if (raw !== undefined) s.setItem(HISTORY_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
  return s;
}
const get = (s: MemoryStorage) => () => s as unknown as Storage;
const stored = (s: MemoryStorage) => JSON.parse(s.getItem(HISTORY_KEY)!) as { id: string }[];
const ids = (r: ReturnType<typeof readHistory>) =>
  r.status === 'available' ? r.entries.map((e) => e.id) : null;

describe('readHistory', () => {
  it('reads a missing key as empty', () => {
    expect(readHistory(get(store()))).toEqual({ status: 'available', entries: [] });
  });

  it('returns entries newest first even when stored out of order', () => {
    const s = store([entry(1), entry(3), entry(2)]);
    expect(ids(readHistory(get(s)))).toEqual(['id-3', 'id-2', 'id-1']);
  });

  it('leaves out each invalid entry and keeps the valid ones', () => {
    const bad = [
      entry(10, { prompt: '   ' }),
      entry(11, { prompt: 'x'.repeat(20_001) }),
      entry(12, { models: [], results: [] }),
      entry(13, {
        models: Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, label: 'L' })),
        results: Array.from({ length: 7 }, (_, i) => okResult(`m${i}`)),
      }),
      entry(14, {
        models: [
          { id: 'a/m', label: 'M' },
          { id: 'a/m', label: 'M' },
        ],
        results: [okResult('a/m'), okResult('a/m')],
      }),
      entry(15, { results: [{ modelId: 'a/m', output: 'x' }] }),
      entry(16, {
        models: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        results: [okResult('b'), okResult('a')],
      }),
      entry(17, {
        models: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        results: [okResult('a')],
      }),
      entry(18, { createdAt: 'yesterday' }),
      entry(19, { id: '' }),
    ];
    const s = store([entry(1), ...bad, entry(2)]);
    expect(ids(readHistory(get(s)))).toEqual(['id-2', 'id-1']);
  });

  it('keeps the newest of a duplicate id', () => {
    const s = store([entry(1, { id: 'dup', prompt: 'old' }), entry(2, { id: 'dup', prompt: 'new' })]);
    const r = readHistory(get(s));
    expect(r.status === 'available' && r.entries.map((e) => e.prompt)).toEqual(['new']);
  });

  it('returns only the newest 50 of 60', () => {
    const s = store(Array.from({ length: 60 }, (_, i) => entry(i)));
    const r = readHistory(get(s));
    expect(r.status === 'available' && r.entries.length).toBe(50);
    expect(ids(r)![0]).toBe('id-59');
    expect(ids(r)!.at(-1)).toBe('id-10');
  });

  it.each(['not json', '{}', '42'])('reads %s as empty without throwing', (raw) => {
    expect(readHistory(get(store(raw)))).toEqual({ status: 'available', entries: [] });
  });

  it('reports unavailable when getItem throws', () => {
    const s = store();
    s.getItem = () => {
      throw new Error('denied');
    };
    expect(readHistory(get(s))).toEqual({ status: 'unavailable' });
  });

  it('reports unavailable when the storage getter throws', () => {
    expect(
      readHistory(() => {
        throw new Error('denied');
      }),
    ).toEqual({ status: 'unavailable' });
  });
});

describe('saveEntry', () => {
  it('keeps 50 entries and drops the oldest', () => {
    const s = store(Array.from({ length: 50 }, (_, i) => entry(i)));
    expect(saveEntry(entry(100) as HistoryEntry, get(s))).toBe('saved');
    const list = stored(s);
    expect(list.length).toBe(50);
    expect(list[0]!.id).toBe('id-100');
    expect(list.some((e) => e.id === 'id-0')).toBe(false);
  });

  it('writes only the new entry after an unparsable value', () => {
    const s = store('garbage');
    expect(saveEntry(entry(1) as HistoryEntry, get(s))).toBe('saved');
    expect(stored(s).map((e) => e.id)).toEqual(['id-1']);
  });

  it('keeps an entry another writer added after our last read', () => {
    const s = store([entry(1)]);
    readHistory(get(s));
    s.setItem(HISTORY_KEY, JSON.stringify([entry(2), entry(1)]));
    saveEntry(entry(3) as HistoryEntry, get(s));
    expect(stored(s).map((e) => e.id)).toEqual(['id-3', 'id-2', 'id-1']);
  });

  it('drops the oldest one at a time on a quota error', () => {
    const s = store([entry(1), entry(2), entry(3)]);
    let failures = 2;
    const real = s.setItem.bind(s);
    s.setItem = (k, v) => {
      if (failures-- > 0) throw quota();
      real(k, v);
    };
    expect(saveEntry(entry(4) as HistoryEntry, get(s))).toBe('saved');
    expect(stored(s).map((e) => e.id)).toEqual(['id-4', 'id-3']);
  });

  it('reports not-saved and leaves the stored value unchanged when it never fits', () => {
    const s = store([entry(1), entry(2)]);
    const before = s.getItem(HISTORY_KEY);
    s.setItem = () => {
      throw quota();
    };
    expect(saveEntry(entry(3) as HistoryEntry, get(s))).toBe('not-saved');
    expect(s.getItem(HISTORY_KEY)).toBe(before);
  });

  it('reports unavailable on a non-quota error', () => {
    const s = store();
    s.setItem = () => {
      throw new Error('denied');
    };
    expect(saveEntry(entry(1) as HistoryEntry, get(s))).toBe('unavailable');
  });
});

describe('deleteEntry and clearHistory', () => {
  it('removes only that id and keeps an entry another writer added', () => {
    const s = store([entry(1), entry(2)]);
    s.setItem(HISTORY_KEY, JSON.stringify([entry(3), entry(2), entry(1)]));
    expect(deleteEntry('id-2', get(s))).toBe('saved');
    expect(stored(s).map((e) => e.id)).toEqual(['id-3', 'id-1']);
  });

  it('reports unavailable when storage throws', () => {
    expect(
      deleteEntry('x', () => {
        throw new Error('denied');
      }),
    ).toBe('unavailable');
  });

  it('clearHistory writes an empty array', () => {
    const s = store([entry(1)]);
    expect(clearHistory(get(s))).toBe('saved');
    expect(stored(s)).toEqual([]);
  });
});

describe('buildHistoryEntry', () => {
  const models: ModelInfo[] = [
    { id: 'a/one', label: 'One', inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
    { id: 'b/two', label: 'Two', inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
  ];
  const results: RunResult[] = [
    okResult('b/two'),
    { status: 'error', modelId: 'a/one', error: 'boom', latencyMs: 5 },
    okResult('c/gone'),
  ];
  const request = { prompt: 'hello', modelIds: ['b/two', 'a/one', 'c/gone'] };

  it('keeps prompt, ordered models with labels, and results unchanged', () => {
    const built = buildHistoryEntry({ request, results: [results[0]!, results[1]!, results[2]!], models });
    expect(built.prompt).toBe('hello');
    expect(built.models).toEqual([
      { id: 'b/two', label: 'Two' },
      { id: 'a/one', label: 'One' },
      { id: 'c/gone', label: 'c/gone' },
    ]);
    expect(built.results).toEqual(results);
  });

  it('falls back to the id when the list is undefined or the label is empty', () => {
    const built = buildHistoryEntry({
      request: { prompt: 'p', modelIds: ['a/one'] },
      results: [okResult('a/one')],
      models: undefined,
    });
    expect(built.models).toEqual([{ id: 'a/one', label: 'a/one' }]);
    const empty = buildHistoryEntry({
      request: { prompt: 'p', modelIds: ['a/one'] },
      results: [okResult('a/one')],
      models: [{ ...models[0]!, label: '' }],
    });
    expect(empty.models[0]!.label).toBe('a/one');
  });

  it('makes an entry that passes HistoryEntry', () => {
    const built = buildHistoryEntry({ request, results, models });
    expect(HistoryEntry.safeParse(built).success).toBe(true);
  });
});

describe('modelLabels', () => {
  const live = [
    { id: 'a/one', label: 'A: One', inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
    { id: 'a/blank', label: '', inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
  ];

  it('uses the live label, and the ID when the model is missing, the label is empty or the list is absent', () => {
    expect(modelLabels(['a/one', 'a/blank', 'a/gone'], live)).toEqual([
      { id: 'a/one', label: 'A: One' },
      { id: 'a/blank', label: 'a/blank' },
      { id: 'a/gone', label: 'a/gone' },
    ]);
    expect(modelLabels(['a/one'], undefined)).toEqual([{ id: 'a/one', label: 'a/one' }]);
  });
});
