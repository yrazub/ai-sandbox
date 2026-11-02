// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelInfo, RunResult } from '../shared/contracts';
import { App } from './App';
import { createQueryClient } from './lib/query-client';

afterEach(cleanup);

const MODELS: ModelInfo[] = [
  { id: 'anthropic/claude-sonnet-5.5', label: 'Anthropic: Claude Sonnet 5.5', inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
  { id: 'anthropic/claude-opus-5.5', label: 'Anthropic: Claude Opus 5.5', inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
  { id: 'anthropic/claude-opus-4.1', label: 'Anthropic: Claude Opus 4.1', inputUsdPerMTok: 15, outputUsdPerMTok: 75 },
  { id: 'openai/gpt-6.1-terra', label: 'OpenAI: GPT-6.1 Terra', inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  { id: 'a/m5', label: 'A: Five', inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
  { id: 'a/m6', label: 'A: Six', inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
  { id: 'a/m7', label: 'A: Seven', inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
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

async function pick(user: ReturnType<typeof userEvent.setup>, ...labels: string[]) {
  await screen.findByLabelText('Search');
  for (const label of labels) {
    await user.click(screen.getByRole('checkbox', { name: new RegExp(`^${label}`) }));
  }
}

describe('model list', () => {
  it('shows a loading state, then the list with nothing selected (AC-1)', async () => {
    stubFetch();
    renderApp();
    expect(screen.getByText('Loading models…')).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'Available models' });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(MODELS.length);
    expect(within(list).getAllByRole('checkbox').some((c) => (c as HTMLInputElement).checked)).toBe(false);
    expect(screen.getByText('Models (0 of 6 selected)')).toBeInTheDocument();
  });

  it('keeps the server order, which is newest first (AC-1)', async () => {
    stubFetch();
    renderApp();
    const list = await screen.findByRole('list', { name: 'Available models' });
    const names = within(list).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent);
    expect(names[0]).toContain('Claude Sonnet 5.5');
    expect(names[1]).toContain('Claude Opus 5.5');
  });

  it('shows an error with a retry, keeps Run disabled and invents no list (AC-14)', async () => {
    let attempt = 0;
    const fn = stubFetch({
      models: () =>
        ++attempt === 1
          ? Response.json({ error: 'The model list is unavailable' }, { status: 503 })
          : Response.json({ models: MODELS }),
    });
    const user = renderApp();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The model list is unavailable');
    expect(screen.queryByRole('list', { name: 'Available models' })).not.toBeInTheDocument();
    expect(runButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('list', { name: 'Available models' })).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('shows an error when the server cannot be reached (AC-14)', async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError('failed'))) as unknown as typeof fetch;
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });
});

describe('search and selection', () => {
  it('filters by name and by id as the user types (AC-12)', async () => {
    stubFetch();
    const user = renderApp();
    const search = await screen.findByLabelText('Search');
    const list = screen.getByRole('list', { name: 'Available models' });

    await user.type(search, 'opus');
    expect(within(list).getAllByRole('checkbox')).toHaveLength(2);

    await user.clear(search);
    await user.type(search, 'openai/gpt');
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(list).getByText('OpenAI: GPT-6.1 Terra')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    stubFetch();
    const user = renderApp();
    await user.type(await screen.findByLabelText('Search'), 'zzzz');
    expect(screen.getByText('No models match "zzzz"')).toBeInTheDocument();
  });

  it('keeps selected models as removable chips when the search hides them (AC-12)', async () => {
    stubFetch();
    const user = renderApp();
    await pick(user, 'Anthropic: Claude Sonnet 5.5');
    await user.type(screen.getByLabelText('Search'), 'terra');

    const chips = screen.getByRole('list', { name: 'Selected models' });
    expect(within(chips).getByText(/Claude Sonnet 5.5/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Sonnet/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Anthropic: Claude Sonnet 5.5' }));
    expect(within(chips).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('Models (0 of 6 selected)')).toBeInTheDocument();
  });

  it('does not allow a seventh selection', async () => {
    stubFetch();
    const user = renderApp();
    await pick(user, 'Anthropic: Claude Sonnet 5.5', 'Anthropic: Claude Opus 5.5', 'Anthropic: Claude Opus 4.1', 'OpenAI', 'A: Five', 'A: Six');

    expect(screen.getByText('Models (6 of 6 selected)')).toBeInTheDocument();
    const seventh = screen.getByRole('checkbox', { name: /^A: Seven/ });
    expect(seventh).toBeDisabled();
    // A selected one can still be unticked.
    expect(screen.getByRole('checkbox', { name: /^A: Six/ })).toBeEnabled();
  });

  it('marks models above $30 per million output tokens and shows every price (AC-13)', async () => {
    stubFetch();
    renderApp();
    const list = await screen.findByRole('list', { name: 'Available models' });

    const opus41 = screen.getByRole('checkbox', { name: /Opus 4.1/ }).closest('label')!;
    expect(opus41).toHaveTextContent('$15 in / $75 out');
    expect(within(opus41).getByTitle(/Expensive/)).toBeInTheDocument();

    const opus55 = screen.getByRole('checkbox', { name: /Opus 5.5/ }).closest('label')!;
    expect(opus55).toHaveTextContent('$4 in / $20 out');
    expect(within(opus55).queryByTitle(/Expensive/)).not.toBeInTheDocument();
    expect(within(list).getAllByTitle(/Expensive/)).toHaveLength(1);
  });
});

describe('Run button', () => {
  it('is disabled for a blank prompt and for no model (AC-2)', async () => {
    stubFetch();
    const user = renderApp();
    await pick(user);
    expect(runButton()).toBeDisabled();

    await user.type(screen.getByLabelText('Prompt'), '   ');
    await pick(user, 'OpenAI');
    expect(runButton()).toBeDisabled(); // blank prompt, model selected

    await user.clear(screen.getByLabelText('Prompt'));
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    expect(runButton()).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: /^OpenAI/ }));
    expect(runButton()).toBeDisabled(); // prompt, no model
  });

  it('is disabled while a run is in progress (AC-2)', async () => {
    let finish!: (response: Response) => void;
    stubFetch({ run: () => new Promise<Response>((resolve) => (finish = resolve)) });
    const user = renderApp();
    await pick(user, 'OpenAI');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    expect(runButton()).toBeDisabled();
    finish(Response.json({ results: [ok('openai/gpt-6.1-terra')] }));
    await waitFor(() => expect(runButton()).toBeEnabled());
  });
});

describe('results', () => {
  it('shows a pending card for each selected model while running (AC-8)', async () => {
    let finish!: (response: Response) => void;
    stubFetch({ run: () => new Promise<Response>((resolve) => (finish = resolve)) });
    const user = renderApp();
    await pick(user, 'Anthropic: Claude Sonnet 5.5', 'OpenAI');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    const results = await screen.findByRole('region', { name: 'Results' });
    const cards = within(results).getAllByRole('article');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card).toHaveAttribute('aria-busy', 'true');
      expect(card).toHaveTextContent('Waiting for the answer…');
    }
    finish(Response.json({ results: [ok('anthropic/claude-sonnet-5.5'), ok('openai/gpt-6.1-terra')] }));
    await waitFor(() => expect(within(results).queryByText('Waiting for the answer…')).not.toBeInTheDocument());
  });

  it('sends the prompt and the models in the selected order (AC-3)', async () => {
    const run = vi.fn(() => Response.json({ results: [ok('openai/gpt-6.1-terra'), ok('anthropic/claude-sonnet-5.5')] }));
    stubFetch({ run });
    const user = renderApp();
    await pick(user, 'OpenAI', 'Anthropic: Claude Sonnet 5.5');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    await screen.findByRole('article', { name: 'OpenAI: GPT-6.1 Terra' });
    expect(run).toHaveBeenCalledWith({
      prompt: 'hello',
      modelIds: ['openai/gpt-6.1-terra', 'anthropic/claude-sonnet-5.5'],
    });
    const titles = screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'));
    expect(titles).toEqual(['OpenAI: GPT-6.1 Terra', 'Anthropic: Claude Sonnet 5.5']);
  });

  it('shows label, answer, latency, tokens and cost on a success card (AC-4)', async () => {
    stubFetch({ run: () => Response.json({ results: [ok('openai/gpt-6.1-terra', { output: 'Line one\nLine two' })] }) });
    const user = renderApp();
    await pick(user, 'OpenAI');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    const card = await screen.findByRole('article', { name: 'OpenAI: GPT-6.1 Terra' });
    expect(card).toHaveTextContent('Line one');
    expect(card).toHaveTextContent('2.1 s');
    expect(card).toHaveTextContent('120 in / 290 out tokens');
    expect(card).toHaveTextContent('$0.0021');
  });

  it('shows n/a for a missing cost, not $0 (AC-4)', async () => {
    stubFetch({ run: () => Response.json({ results: [ok('openai/gpt-6.1-terra', { costUsd: null })] }) });
    const user = renderApp();
    await pick(user, 'OpenAI');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    const card = await screen.findByRole('article', { name: 'OpenAI: GPT-6.1 Terra' });
    expect(card).toHaveTextContent('n/a');
    expect(card).not.toHaveTextContent('$0');
  });

  it('renders model output as plain text, never as HTML (D-7)', async () => {
    const evil = '<img src=x onerror="alert(1)"><b>bold</b>';
    stubFetch({ run: () => Response.json({ results: [ok('openai/gpt-6.1-terra', { output: evil })] }) });
    const user = renderApp();
    await pick(user, 'OpenAI');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    const card = await screen.findByRole('article', { name: 'OpenAI: GPT-6.1 Terra' });
    expect(card).toHaveTextContent(evil);
    expect(card.querySelector('img, b')).toBeNull();
  });

  it('shows an error card next to a success card (AC-5)', async () => {
    stubFetch({
      run: () =>
        Response.json({
          results: [
            ok('anthropic/claude-sonnet-5.5'),
            { status: 'error', modelId: 'openai/gpt-6.1-terra', error: 'Timed out after 60 s', latencyMs: 60000 },
          ],
        }),
    });
    const user = renderApp();
    await pick(user, 'Anthropic: Claude Sonnet 5.5', 'OpenAI');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    const good = await screen.findByRole('article', { name: 'Anthropic: Claude Sonnet 5.5' });
    const bad = screen.getByRole('article', { name: 'OpenAI: GPT-6.1 Terra' });
    expect(good).toHaveTextContent('answer from anthropic/claude-sonnet-5.5');
    expect(bad).toHaveTextContent('Timed out after 60 s');
    expect(bad).toHaveTextContent('60.0 s');
    expect(within(good).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the message and no invented results when the request fails (AC-7)', async () => {
    stubFetch({ run: () => Response.json({ error: 'Unknown model: x' }, { status: 400 }) });
    const user = renderApp();
    await pick(user, 'OpenAI');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    expect(await screen.findByText('Run failed: Unknown model: x')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Results' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(runButton()).toBeEnabled();
  });

  it('shows a message when the server cannot be reached (AC-7)', async () => {
    stubFetch({
      run: () => {
        throw new TypeError('failed');
      },
    });
    const user = renderApp();
    await pick(user, 'OpenAI');
    await user.type(screen.getByLabelText('Prompt'), 'hello');
    await user.click(runButton());

    expect(await screen.findByText('Run failed: Could not reach the server')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
