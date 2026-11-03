# AI Sandbox

Enter one prompt, pick several models from [OpenRouter](https://openrouter.ai), run them in
parallel and compare the answers side by side: text, time, tokens and cost.

It is a local, single-user tool. The server listens on `127.0.0.1` only, stores nothing on disk,
keeps an in-memory usage tally that resets on restart, and has no login. The page keeps a history
of past runs (prompt, models and results) in the browser's `localStorage`, so it survives a reload.
History is stored unencrypted in the browser profile and can be cleared from the page.

## Setup

You need [nvm](https://github.com/nvm-sh/nvm) and an OpenRouter API key
([create one](https://openrouter.ai/keys)).

```sh
source ~/.nvm/nvm.sh
nvm install        # reads .nvmrc and installs Node 26 once
nvm use            # run this in every new shell
node -v            # v26.x

npm install
cp .env.example .env
```

Put your key in `.env`:

```
OPENROUTER_API_KEY=sk-or-...
```

`.env` is git-ignored. The app also starts without a key: the model list still loads, and a run
shows `OPENROUTER_API_KEY is not set` on every card.

## Run

```sh
npm run dev
```

Open <http://localhost:5173>. The API runs on `127.0.0.1:4000`; Vite proxies `/api` to it.

1. Type a prompt.
2. Search the model list and tick up to 6 models. Each row shows its price per million tokens, and
   models above $30 per million output tokens carry a `!`.
3. Press **Run**. Every card fills in when the slowest model finishes. A model that fails or
   times out (60 s) shows its error and does not affect the others.

Each call is limited to 1024 output tokens, and a prompt to 20,000 characters.

## History

Every run that returns results is saved in the browser's `localStorage` under the key
`ai-sandbox:history:v1`, newest first, up to 50 runs. A run whose request fails (4xx, 5xx or an
unreachable server) is not saved. The server never sees the history.

The History section below the results lists each run with its local date and time, the first line
of the prompt (cut at 100 characters), the model labels, "N failed" when any model failed, and the
total cost. The total sums the successful models and reads `n/a` when none succeeded or one of
them reported no cost.

- **Restore.** Click a row. The prompt, the model selection and the stored result cards come back
  under a "From history" line, and focus moves to the prompt. Restoring sends no request and
  spends no credits. A stored model that the loaded model list no longer offers is left unselected
  and named in a notice. Pressing **Run** replaces the restored cards. **Run** stays disabled until
  the model list has loaded.
- **Delete one run.** Press `×` on its row. There is no confirmation.
- **Clear all.** Press **Clear history**, then **Clear** to confirm or **Cancel**.
- Deleting or clearing does not remove the cards on screen. Restore, delete and clear are disabled
  while a run is in progress.

How it behaves when storage is not ideal:

- **Storage full.** The oldest runs are dropped one at a time until the new run fits. If it still
  does not fit, the page shows "This run could not be saved to history" and keeps the cards.
- **Storage unavailable.** The section shows "History is unavailable in this browser". Runs work as
  usual.
- **Invalid data.** Each stored run is checked on read; runs that break the prompt, model or result
  limits are skipped. A value that is not valid JSON reads as an empty history and is replaced on
  the next save.
- **Several tabs.** A save re-reads the key first, so one tab does not erase the runs another tab
  saved, and a change made in another tab shows up without a reload.

The code is in [`src/web/lib/history-storage.ts`](src/web/lib/history-storage.ts) (the only file
that touches `localStorage`), [`src/web/hooks/use-history.ts`](src/web/hooks/use-history.ts) and
[`src/web/components/HistorySection.tsx`](src/web/components/HistorySection.tsx).

## Session usage

The footer below the History section shows the total tokens (input plus output) and the cost of
every successful model call since the server started, for example
"Session since 14:02: 12,400 tokens · $0.0040". The time is when the server started, in your
locale, and the cost follows the same rule as the result cards. `GET /api/usage` returns the input
and output tokens separately, with the cost, the call counts and the start time.

- **One tally for all clients.** Every tab and client feeds the same tally, which lives in the
  server's memory.
- **Resets on restart.** This includes each `tsx watch` restart under `npm run dev`. Nothing is
  written to disk or to the browser.
- **Successful results only.** The tally counts usage reported for successful results, so it can
  be lower than the OpenRouter bill: a failed or timed-out call may still be billed.
- **Calls without cost.** A successful call that reports no cost adds its tokens and is counted as
  one of the "calls without cost", and the footer appends "(N calls without cost)" after the cost.
- **Refresh.** The footer refreshes when a run settles, whether it succeeds or fails, and when the
  window regains focus. A run from another tab or client shows up at the next refresh. If the
  request fails, the footer reads "Session usage unavailable" until a later refresh succeeds.

The code is in [`src/web/components/SessionFooter.tsx`](src/web/components/SessionFooter.tsx),
[`src/web/hooks/use-usage.ts`](src/web/hooks/use-usage.ts) and `GET /api/usage` in
[`src/server/modules/runs/routes.ts`](src/server/modules/runs/routes.ts).

## Commands

| | |
|---|---|
| `npm run dev` | API and web page together |
| `npm test` | all tests; no network, no credits |
| `npm run typecheck` | TypeScript check |
| `npm run build` | production bundle into `dist/` |

## How it fits together

```
browser  -->  Vite :5173  --/api-->  Fastify 127.0.0.1:4000  -->  OpenRouter
```

The key stays on the server. The model list comes live from OpenRouter, is cached in memory for an
hour, and leaves out `:batch` variants and routers with no fixed price. Costs are the ones
OpenRouter reports for each call.

See [CLAUDE.md](CLAUDE.md) for the folder map and the layer rules, and
[docs/plans/base-app.md](docs/plans/base-app.md) for the plan this was built from.
