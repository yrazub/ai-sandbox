// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelInfo, RunResult } from '../shared/contracts';
import { App } from './App';
import { formatRunTime } from './components/history-format';
import { HISTORY_KEY, type HistoryEntry } from './lib/history-storage';
import { createQueryClient } from './lib/query-client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MODELS: ModelInfo[] = [
  { id: 'anthropic/claude-opus-5.5', label: 'Anthropic: Claude Opus 5.5', inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
  { id: 'openai/gpt-6.1-terra', label: 'OpenAI: GPT-6.1 Terra', inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  { id: 'a/m5', label: 'A: Five', inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
];

const ok = (modelId: string, overrides: Partial<Extract<RunResult, { status: 'ok' }>> = {}): RunResult => ({
  status: 'ok',
  modelId,
  output: `answer from ${modelId}`,
  latencyMs: 2140,
  inputTokens: 120,
  outputTokens: 290,
  costUsd: 0.0021,
  ...overrides,
});

interface Stub {
  models?: () => Response | Promise<Response>;
  run?: (body: { prompt: string; modelIds: string[] }) => Response | Promise<Response>;
}

function stubFetch({ models = () => Response.json({ models: MODELS }), run }: Stub = {}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/models') return models();
    if (url === '/api/runs' && run) return run(JSON.parse(init?.body as string));
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function renderApp(strict = false) {
  const user = userEvent.setup();
  const app = (
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{app}</StrictMode> : app);
  return user;
}

const runButton = () => screen.getByRole('button', { name: /^run/i });

async function pick(user: ReturnType<typeof userEvent.setup>, ...labels: string[]) {
  await screen.findByLabelText('Search');
  for (const label of labels) {
    await user.click(screen.getByRole('checkbox', { name: new RegExp(`^${label}`) }));
  }
}

async function runOnce(user: ReturnType<typeof userEvent.setup>, prompt = 'Hello', ...labels: string[]) {
  await pick(user, ...(labels.length > 0 ? labels : ['A: Five']));
  const box = screen.getByLabelText('Prompt');
  await user.clear(box);
  await user.type(box, prompt);
  await user.click(runButton());
}

function entry(n: number, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `id-${n}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
    prompt: `prompt ${n}`,
    models: [{ id: 'a/m5', label: 'A: Five' }],
    results: [ok('a/m5')],
    ...over,
  };
}

const seed = (...entries: HistoryEntry[]) => localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
const stored = () => JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[];
const okRun = () => Response.json({ results: [ok('a/m5')] });

describe('recording runs', () => {
  it('stores a 200 run with prompt, ordered models with live labels, results and an ISO time (AC-1)', async () => {
    const results = [ok('openai/gpt-6.1-terra'), ok('anthropic/claude-opus-5.5')];
    stubFetch({ run: () => Response.json({ results }) });
    const user = renderApp();
    await runOnce(user, 'Compare', 'OpenAI', 'Anthropic');
    await waitFor(() => expect(stored()).toHaveLength(1));
    const [saved] = stored();
    expect(saved!.prompt).toBe('Compare');
    expect(saved!.models).toEqual([
      { id: 'openai/gpt-6.1-terra', label: 'OpenAI: GPT-6.1 Terra' },
      { id: 'anthropic/claude-opus-5.5', label: 'Anthropic: Claude Opus 5.5' },
    ]);
    expect(saved!.results).toEqual(results);
    expect(new Date(saved!.createdAt).toISOString()).toBe(saved!.createdAt);
  });

  it('stores an error result next to a successful one (AC-2)', async () => {
    const results: RunResult[] = [
      ok('openai/gpt-6.1-terra'),
      { status: 'error', modelId: 'a/m5', error: 'Timed out', latencyMs: 10 },
    ];
    stubFetch({ run: () => Response.json({ results }) });
    const user = renderApp();
    await runOnce(user, 'Hi', 'OpenAI', 'A: Five');
    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(stored()[0]!.results).toEqual(results);
  });

  it.each([
    ['a 400', () => Response.json({ error: 'bad' }, { status: 400 })],
    ['a 500', () => new Response('oops', { status: 500 })],
    ['a 200 with an unexpected body', () => Response.json({})],
    [
      'an unreachable server',
      () => {
        throw new TypeError('network');
      },
    ],
  ])('stores nothing after %s (AC-3)', async (_name, run) => {
    stubFetch({ run });
    const user = renderApp();
    await runOnce(user);
    await screen.findByRole('alert');
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it('stores exactly one entry per run, also in StrictMode (AC-4)', async () => {
    stubFetch({ run: okRun });
    const user = renderApp();
    await runOnce(user, 'One');
    await waitFor(() => expect(stored()).toHaveLength(1));
    await waitFor(() => expect(runButton()).toBeEnabled());
    await user.clear(screen.getByLabelText('Prompt'));
    await user.type(screen.getByLabelText('Prompt'), 'Two');
    await user.click(runButton());
    await waitFor(() => expect(stored()).toHaveLength(2));
  });

  it('stores one entry per run under StrictMode (AC-4)', async () => {
    stubFetch({ run: okRun });
    const user = renderApp(true);
    await runOnce(user, 'One');
    await waitFor(() => expect(stored()).toHaveLength(1));
    await screen.findByText('answer from a/m5');
    expect(stored()).toHaveLength(1);
  });
});

describe('the History list', () => {
  it('lists the seeded entries on mount (AC-5)', async () => {
    seed(entry(1), entry(2));
    stubFetch();
    renderApp();
    const list = screen.getByRole('list', { name: 'History' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('lists entries newest first (AC-6)', () => {
    seed(entry(1), entry(3), entry(2));
    stubFetch();
    renderApp();
    const rows = within(screen.getByRole('list', { name: 'History' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('prompt 3'),
      expect.stringContaining('prompt 2'),
      expect.stringContaining('prompt 1'),
    ]);
  });

  it('shows time, excerpt, labels and failed count (AC-7)', () => {
    const long = 'x'.repeat(120);
    const e = entry(1, {
      prompt: `${long}\nsecond line`,
      models: [
        { id: 'a/m5', label: 'A: Five' },
        { id: 'b/y', label: 'B: Why' },
      ],
      results: [ok('a/m5'), { status: 'error', modelId: 'b/y', error: 'boom', latencyMs: 1 }],
    });
    seed(e);
    stubFetch();
    renderApp();
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(formatRunTime(e.createdAt))).toBeInTheDocument();
    expect(within(row).getByText(`${'x'.repeat(100)}…`)).toBeInTheDocument();
    expect(row).toHaveTextContent('A: Five, B: Why');
    expect(within(row).getByText('1 failed')).toBeInTheDocument();
  });

  it('shows the summed cost, or n/a when a cost is missing (AC-40)', () => {
    seed(
      entry(1, {
        models: [
          { id: 'a/m5', label: 'A: Five' },
          { id: 'b/y', label: 'B: Why' },
        ],
        results: [ok('a/m5', { costUsd: 0.5 }), ok('b/y', { costUsd: 0.25 })],
      }),
      entry(2, { results: [ok('a/m5', { costUsd: null })] }),
    );
    stubFetch();
    renderApp();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('n/a');
    expect(rows[1]).toHaveTextContent('$0.7500');
  });

  it('shows the empty state and no Clear history button (AC-8)', () => {
    stubFetch();
    renderApp();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear history' })).not.toBeInTheDocument();
  });

  it('shows the count in the heading (AC-41)', () => {
    seed(entry(1), entry(2));
    stubFetch();
    renderApp();
    expect(screen.getByRole('heading', { name: 'History (2)' })).toBeInTheDocument();
  });

  it('shows the stored label, also when the model list fails (AC-33)', async () => {
    seed(entry(1, { models: [{ id: 'a/m5', label: 'Stored Label' }] }));
    stubFetch({ models: () => Response.json({ error: 'down' }, { status: 500 }) });
    renderApp();
    expect(screen.getByRole('listitem')).toHaveTextContent('Stored Label');
    await screen.findByText(/Request failed|down/);
    expect(screen.getByRole('listitem')).toHaveTextContent('Stored Label');
  });

  it('shows the stored label when it differs from the live list (AC-33)', async () => {
    seed(entry(1, { models: [{ id: 'a/m5', label: 'Old Name' }] }));
    stubFetch();
    renderApp();
    await screen.findByLabelText('Search');
    const row = within(screen.getByRole('list', { name: 'History' })).getByRole('listitem');
    expect(row).toHaveTextContent('Old Name');
    expect(row).not.toHaveTextContent('A: Five');
  });

  it('shows the empty state for an unparsable key without an alert (AC-28)', () => {
    localStorage.setItem(HISTORY_KEY, 'not json');
    stubFetch();
    renderApp();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('storage failures', () => {
  it('says history is unavailable when reading throws (AC-22)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    stubFetch();
    renderApp();
    expect(screen.getByText('History is unavailable in this browser')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'History' })).not.toBeInTheDocument();
  });

  it('still shows result cards when storage throws (AC-23)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    stubFetch({ run: okRun });
    const user = renderApp();
    await runOnce(user);
    expect(await screen.findByText('answer from a/m5')).toBeInTheDocument();
    expect(screen.getByText('History is unavailable in this browser')).toBeInTheDocument();
    expect(screen.queryByText('This run could not be saved to history')).not.toBeInTheDocument();
  });

  it('shows a notice on a quota error, keeps the cards, and clears it on the next run (AC-26)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    stubFetch({
      run: async () => {
        if (++calls === 2) await gate;
        return okRun();
      },
    });
    const user = renderApp();
    await runOnce(user);
    const notice = await screen.findByText('This run could not be saved to history');
    expect(notice).toHaveAttribute('role', 'status');
    expect(screen.getByText('answer from a/m5')).toBeInTheDocument();

    await waitFor(() => expect(runButton()).toBeEnabled());
    await user.click(runButton());
    await waitFor(() =>
      expect(screen.queryByText('This run could not be saved to history')).not.toBeInTheDocument(),
    );
    release();
    expect(await screen.findByText('This run could not be saved to history')).toBeInTheDocument();
  });
});
