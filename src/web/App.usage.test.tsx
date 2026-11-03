// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelInfo, RunResult, UsageResponse } from '../shared/contracts';
import { App } from './App';
import { formatSessionStart, formatTokenTotal } from './components/usage-format';
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

// ---- Phase 3: refresh triggers ----

const FIRST = tally({ inputTokens: 100, outputTokens: 50, costUsd: 0.001, okCalls: 1 });
const SECOND = tally({ inputTokens: 12000, outputTokens: 400, costUsd: 0.004, okCalls: 2 });
const FIRST_TEXT = `${formatTokenTotal(FIRST)} tokens · $0.0010`;
const SECOND_TEXT = `${formatTokenTotal(SECOND)} tokens · $0.0040`;

type Step = () => Response | Promise<Response>;

/** Answers the nth call with the nth step; the last step answers every later call. */
function sequence(...steps: Step[]): Step {
  let i = 0;
  return () => steps[Math.min(i++, steps.length - 1)]!();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const json =
  (body: unknown, status = 200): Step =>
  () =>
    Response.json(body, { status });

/** Lets any request that would be sent on its own start before a "no new request" check. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });

const okRun = () => Response.json({ results: [ok('a/m5')] });

describe('refreshing after a run', () => {
  it.each([
    ['a 200', okRun, true],
    ['a 400', () => Response.json({ error: 'bad' }, { status: 400 }), false],
    [
      'a request that throws TypeError',
      () => {
        throw new TypeError('network');
      },
      false,
    ],
  ])('requests the tally once more after %s (AC-22)', async (_name, run, shows) => {
    const { count } = stubFetch({ usage: sequence(json(FIRST), json(SECOND)), run });
    const user = renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent(FIRST_TEXT));
    expect(count('/api/usage')).toBe(1);

    await runOnce(user);

    await waitFor(() => expect(count('/api/usage')).toBe(2));
    await settle();
    expect(count('/api/usage')).toBe(2);
    expect(count('/api/runs')).toBe(1);
    if (shows) await waitFor(() => expect(footer()).toHaveTextContent(SECOND_TEXT));
  });

  it('keeps the first tally and sends no usage request while a run is pending, then refreshes (AC-24)', async () => {
    const release = deferred<Response>();
    const { count } = stubFetch({ usage: sequence(json(FIRST), json(SECOND)), run: () => release.promise });
    const user = renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent(FIRST_TEXT));

    await runOnce(user);
    await waitFor(() => expect(count('/api/runs')).toBe(1));
    await settle();

    expect(footer()).toHaveTextContent(FIRST_TEXT);
    expect(footer()).not.toHaveTextContent(SECOND_TEXT);
    expect(count('/api/usage')).toBe(1);

    release.resolve(okRun());

    await waitFor(() => expect(count('/api/usage')).toBe(2));
    await waitFor(() => expect(footer()).toHaveTextContent(SECOND_TEXT));
  });

  it('keeps the previous totals, with no loading text, while the next request is in flight (AC-19)', async () => {
    const held = deferred<Response>();
    const { count } = stubFetch({ usage: sequence(json(FIRST), () => held.promise), run: okRun });
    const user = renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent(FIRST_TEXT));

    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(footer().textContent ?? ''));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    await runOnce(user);
    await waitFor(() => expect(count('/api/usage')).toBe(2));
    await settle();
    observer.disconnect();

    expect(footer()).toHaveTextContent(FIRST_TEXT);
    expect(seen.filter((text) => text.includes('loading'))).toEqual([]);
  });

  it('re-enables Run while the usage refetch is still pending (base AC-2)', async () => {
    const held = deferred<Response>();
    const { count } = stubFetch({ usage: sequence(json(FIRST), () => held.promise), run: okRun });
    const user = renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent(FIRST_TEXT));

    await runOnce(user);
    await screen.findByRole('article', { name: 'A: Five' });
    await waitFor(() => expect(count('/api/usage')).toBe(2));

    expect(runButton()).toBeEnabled();
  });

  it('shows "unavailable" after a failed refetch, also while the next one is in flight, until one succeeds (AC-20, Q3)', async () => {
    const held = deferred<Response>();
    const { count } = stubFetch({
      usage: sequence(json(FIRST), json({ error: 'boom' }, 500), () => held.promise),
      run: okRun,
    });
    const user = renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent(FIRST_TEXT));

    await runOnce(user);
    await waitFor(() => expect(footer()).toHaveTextContent('Session usage unavailable'));
    expect(footer().textContent).toBe('Session usage unavailable');

    await waitFor(() => expect(runButton()).toBeEnabled());
    await user.click(runButton());
    await waitFor(() => expect(count('/api/usage')).toBe(3));
    await settle();
    expect(footer().textContent).toBe('Session usage unavailable');

    held.resolve(Response.json(SECOND));
    await waitFor(() => expect(footer()).toHaveTextContent(SECOND_TEXT));
  });

  it('stays "unavailable", not "loading", while a focus refetch follows a failed first load (AC-20, Q3)', async () => {
    const held = deferred<Response>();
    const { count } = stubFetch({ usage: sequence(json({ error: 'boom' }, 500), () => held.promise) });
    renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent('Session usage unavailable'));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(count('/api/usage')).toBe(2));
    await settle();

    expect(footer().textContent).toBe('Session usage unavailable');
  });
});

function entry(n: number): HistoryEntry {
  return {
    id: `id-${n}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
    prompt: `prompt ${n}`,
    models: [{ id: 'a/m5', label: 'A: Five' }],
    results: [ok('a/m5')],
  };
}

describe('history actions', () => {
  it('send no usage request on restore, delete or clear (AC-23)', async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry(1), entry(2)]));
    const { count } = stubFetch({ usage: json(FIRST) });
    const user = renderApp();
    await screen.findByLabelText('Search');
    await waitFor(() => expect(footer()).toHaveTextContent(FIRST_TEXT));
    expect(count('/api/usage')).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Restore: prompt 1' }));
    await settle();
    expect(count('/api/usage')).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Delete run: prompt 1' }));
    await settle();
    expect(count('/api/usage')).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await settle();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(count('/api/usage')).toBe(1);
  });
});

describe('refreshing on window focus', () => {
  async function loaded() {
    const stub = stubFetch({ usage: sequence(json(FIRST), json(SECOND)) });
    renderApp();
    await screen.findByLabelText('Search');
    await waitFor(() => expect(footer()).toHaveTextContent(FIRST_TEXT));
    return stub;
  }

  it('refetches only the usage query on a window focus (AC-34)', async () => {
    const { count } = await loaded();
    expect(count('/api/usage')).toBe(1);
    expect(count('/api/models')).toBe(1);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(count('/api/usage')).toBe(2));
    await waitFor(() => expect(footer()).toHaveTextContent(SECOND_TEXT));
    await settle();
    expect(count('/api/usage')).toBe(2);
    expect(count('/api/models')).toBe(1);
  });

  it('refetches only the usage query on a visibilitychange (AC-34)', async () => {
    const { count } = await loaded();

    // Browsers fire it on document and it bubbles to window.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });

    await waitFor(() => expect(count('/api/usage')).toBe(2));
    await settle();
    expect(count('/api/usage')).toBe(2);
    expect(count('/api/models')).toBe(1);
  });

  it('sends one request when focus and visibilitychange fire together (AC-34)', async () => {
    const held = deferred<Response>();
    const { count } = stubFetch({ usage: sequence(json(FIRST), () => held.promise) });
    renderApp();
    await waitFor(() => expect(footer()).toHaveTextContent(FIRST_TEXT));

    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    await waitFor(() => expect(count('/api/usage')).toBe(2));
    await settle();

    expect(count('/api/usage')).toBe(2);
  });

  it('sends no request when an element gets focus (AC-34, AC-23)', async () => {
    const { count } = await loaded();

    act(() => {
      screen.getByLabelText('Prompt').focus();
    });
    await settle();

    expect(document.activeElement).toBe(screen.getByLabelText('Prompt'));
    expect(count('/api/usage')).toBe(1);
  });
});
