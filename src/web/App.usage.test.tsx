// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelInfo, RunResult, UsageResponse } from '../shared/contracts';
import { App } from './App';
import { formatSessionStart, formatTokenTotal } from './components/usage-format';
import { HISTORY_KEY } from './lib/history-storage';
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

const STARTED_AT = '2026-11-03T14:02:00.000Z';

const tally = (over: Partial<UsageResponse> = {}): UsageResponse => ({
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  okCalls: 0,
  unpricedCalls: 0,
  startedAt: STARTED_AT,
  ...over,
});

interface Stub {
  models?: () => Response | Promise<Response>;
  run?: (body: { prompt: string; modelIds: string[] }) => Response | Promise<Response>;
  usage?: () => Response | Promise<Response>;
}

function stubFetch({ models = () => Response.json({ models: MODELS }), run, usage = () => Response.json(tally()) }: Stub = {}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/models') return models();
    if (url === '/api/usage') return usage();
    if (url === '/api/runs' && run) return run(JSON.parse(init?.body as string));
    throw new Error(`Unexpected request: ${url}`);
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  const count = (url: string) => fn.mock.calls.filter(([called]) => called === url).length;
  return { fn, count };
}

function renderApp() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  return user;
}

const runButton = () => screen.getByRole('button', { name: /^run/i });
const footer = () => screen.getByRole('contentinfo');

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

/** Waits until the footer has left the loading text, then returns its paragraph text. */
async function loadedText() {
  await waitFor(() => expect(footer()).not.toHaveTextContent('Session: loading…'));
  return footer().textContent;
}

function expectNoLiveRegion(el: HTMLElement) {
  expect(el).not.toHaveAttribute('role');
  expect(el.querySelector('[role], [aria-live]')).toBeNull();
  expect(within(el).queryByRole('alert')).not.toBeInTheDocument();
  expect(within(el).queryByRole('status')).not.toBeInTheDocument();
}

describe('session footer', () => {
  it('shows the token total and the cost of the loaded tally (AC-10)', async () => {
    const usage = tally({ inputTokens: 12000, outputTokens: 400, costUsd: 0.004, okCalls: 2 });
    stubFetch({ usage: () => Response.json(usage) });
    renderApp();

    await waitFor(() => expect(footer()).toHaveTextContent(`${formatTokenTotal(usage)} tokens · $0.0040`));
    expect(footer()).not.toHaveTextContent('calls without cost');
  });

  it('is the contentinfo landmark, outside and after main (AC-13)', async () => {
    stubFetch();
    renderApp();
    await screen.findByLabelText('Search');

    const main = screen.getByRole('main');
    expect(main).not.toContainElement(footer());
    expect(main.compareDocumentPosition(footer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('adds the calls without cost after the cost (AC-16)', async () => {
    stubFetch({
      usage: () => Response.json(tally({ inputTokens: 12000, outputTokens: 400, costUsd: 0.004, okCalls: 3, unpricedCalls: 2 })),
    });
    renderApp();

    expect(await loadedText()).toMatch(/\$0\.0040 \(2 calls without cost\)$/);
  });

  it('shows "0 tokens · $0" for a zero tally (AC-17)', async () => {
    stubFetch();
    renderApp();

    expect(await loadedText()).toBe(`Session since ${formatSessionStart(STARTED_AT)}: 0 tokens · $0`);
  });

  it('starts with the session start time (AC-33)', async () => {
    stubFetch({ usage: () => Response.json(tally({ inputTokens: 5, okCalls: 1 })) });
    renderApp();

    const text = await loadedText();
    expect(text?.startsWith(`Session since ${formatSessionStart(STARTED_AT)}: `)).toBe(true);
  });

  it('shows "Session: loading…" while the first request is in flight, requested once on mount (AC-18)', async () => {
    const { count } = stubFetch({ usage: () => new Promise<Response>(() => {}) });
    renderApp();
    await screen.findByLabelText('Search');

    expect(footer()).toHaveTextContent('Session: loading…');
    expect(count('/api/usage')).toBe(1);
  });

  it.each([
    ['an error status', () => Response.json({ error: 'boom' }, { status: 500 })],
    ['a body that is not a UsageResponse', () => Response.json({})],
    ['more calls without cost than ok calls', () => Response.json(tally({ okCalls: 1, unpricedCalls: 3 }))],
    [
      'an unreachable server',
      () => {
        throw new TypeError('failed');
      },
    ],
  ])('shows "Session usage unavailable" with no button for %s (AC-20)', async (_name, usage) => {
    stubFetch({ usage });
    renderApp();

    await waitFor(() => expect(footer()).toHaveTextContent('Session usage unavailable'));
    expect(footer().textContent).toBe('Session usage unavailable');
    expect(within(footer()).queryByRole('button')).not.toBeInTheDocument();
  });

  it('carries no role and no live region in the loading, loaded and unavailable states (AC-21)', async () => {
    stubFetch({ usage: () => new Promise<Response>(() => {}) });
    renderApp();
    await screen.findByLabelText('Search');
    expect(footer()).toHaveTextContent('Session: loading…');
    expectNoLiveRegion(footer());
    cleanup();

    stubFetch({ usage: () => Response.json(tally({ inputTokens: 10, okCalls: 1 })) });
    renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent('Session since'));
    expectNoLiveRegion(footer());
    cleanup();

    stubFetch({ usage: () => Response.json({ error: 'boom' }, { status: 500 }) });
    renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent('Session usage unavailable'));
    expectNoLiveRegion(footer());
    // The page's own alert count is unchanged: the unavailable footer adds none.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the loaded tally as one paragraph of text and no other element (AC-30)', async () => {
    stubFetch({ usage: () => Response.json(tally({ inputTokens: 12000, outputTokens: 400, costUsd: 0.004, okCalls: 1 })) });
    renderApp();
    await loadedText();

    expect(footer().querySelectorAll('*')).toHaveLength(1);
    expect(footer().firstElementChild?.tagName).toBe('P');
  });

  it('writes nothing about the tally to browser storage, on load or after a run (AC-9)', async () => {
    stubFetch({
      usage: () => Response.json(tally({ inputTokens: 12000, outputTokens: 400, costUsd: 0.004, okCalls: 1 })),
      run: () => Response.json({ results: [ok('a/m5')] }),
    });
    const user = renderApp();
    await loadedText();

    const expectNoUsageStored = () => {
      expect(sessionStorage.length).toBe(0);
      expect(document.cookie).toBe('');
      for (let i = 0; i < localStorage.length; i++) expect(localStorage.key(i)).toBe(HISTORY_KEY);
    };
    expectNoUsageStored();

    await runOnce(user);
    await screen.findByRole('article', { name: 'A: Five' });
    await waitFor(() => expect(localStorage.getItem(HISTORY_KEY)).not.toBeNull());
    expectNoUsageStored();
  });
});
