# Plan: one-page model comparison app

Status: approved (2026-11-02)

## Goal

A local, single-user tool: enter one prompt, pick several LLM models, run them side by side and
compare the answers with their time, tokens and cost.

This plan turns the empty repository into a small, working project with its own instructions and
test command. It is built by hand, without the SDD plugin.

## Scope

**In:** one page, a searchable picker over OpenRouter's live model list, prompt box, parallel run, a
result card per model, per-model error handling, tests, project documentation.

**Out:**

| Excluded | Why |
|---|---|
| LLM judge and summary | The next feature, built through the SDD workflow. No placeholder code or empty UI for it here |
| Login | Local tool; the server binds to `127.0.0.1` instead |
| History, database | Results live on screen and a reload clears them |
| Streaming | All cards fill in together when the slowest model finishes |
| Routing, multiple pages | One page |
| File upload, system prompts, temperature controls | Not needed to compare answers |
| Favourites, pinned models, provider groups | Search over the list covers it |
| Production build served by Fastify, deployment | Runs through `npm run dev` |
| ESLint, dependency-cruiser, CI | Worth adding later; typecheck and tests cover this size |

## The page

```
+------------------------------------------------------------+
| AI Sandbox                                                 |
|                                                            |
| Prompt                                                     |
| +--------------------------------------------------------+ |
| |                                                        | |
| +--------------------------------------------------------+ |
| Models (3 of 6 selected)                                   |
| [Sonnet 5.5 x] [Opus 5.5 x] [GPT-6.1 Terra x]              |
| Search: [ opus                                          ] |
| +--------------------------------------------------------+ |
| | [x] Anthropic: Claude Opus 5.5         $4 in / $20 out | |
| | [ ] Anthropic: Claude Opus 4.1      ! $15 in / $75 out | |
| +--------------------------------------------------------+ |
|                                                    [ Run ] |
|                                                            |
| +------------------+ +------------------+ +--------------+ |
| | Claude Sonnet 5.5| | Claude Opus 5.5  | | GPT-6.1 Terra| |
| | answer text ...  | | answer text ...  | | ! Timed out  | |
| |                  | |                  | |              | |
| | 2.1 s · 410 tok  | | 4.8 s · 455 tok  | | 60.0 s       | |
| | $0.0021          | | $0.0049          | |              | |
| +------------------+ +------------------+ +--------------+ |
+------------------------------------------------------------+
```

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | When the page opens, it loads the model list from `GET /api/models` and shows a loading state, then a searchable list, newest models first, with nothing selected |
| AC-2 | Run is disabled while the prompt is blank, no model is selected, or a run is in progress |
| AC-3 | When the user runs, the server calls every selected model in parallel and returns one result per model, in the selected order |
| AC-4 | A successful card shows the model label, the answer as plain text, latency, input and output tokens, and cost; a missing cost shows `n/a`, never `$0` |
| AC-5 | If one model fails or times out, its card shows the error and the other cards are unaffected |
| AC-6 | A blank prompt, a prompt over 20,000 characters, no models, more than 6 models, duplicate models or a model not in the current list returns `400` and calls no model |
| AC-7 | If the request itself fails, the page shows an error message and no invented results |
| AC-8 | While a run is in progress, each selected model shows a pending card |
| AC-9 | The server starts and the model list loads without `OPENROUTER_API_KEY`; a run then shows `OPENROUTER_API_KEY is not set` on every card |
| AC-10 | The key never appears in an API response, an error message or the client bundle |
| AC-11 | `npm test` makes no network calls and spends no credits |
| AC-12 | Search filters the list by model name or ID as the user types; selected models stay visible as removable chips even when the search hides them |
| AC-13 | The list leaves out `:batch` variants and routers with no fixed price; every row shows its input and output price, and a model above $30 per million output tokens is marked as expensive |
| AC-14 | If the model list cannot be loaded, the page shows an error with a retry, Run stays disabled, and no invented list appears |

## Stack

One package, managed with npm, using TypeScript throughout.

| Area | Choice |
|---|---|
| Runtime | Node 26 LTS, pinned in `.nvmrc` and `engines` |
| Frontend | React 19, Vite 8, TanStack Query 5, plain CSS |
| Backend | Fastify 5, Zod 4, `fastify-type-provider-zod` 7 |
| LLM access | OpenRouter chat completions over `fetch`, no SDK |
| Tests | vitest 5, jsdom 30, React Testing Library |
| Dev | `tsx`, `concurrently` |

Node is per project: `.nvmrc` selects 26 for this repository, and nvm's global default stays as it
is, so other projects keep their own version. vitest 5 and jsdom 30 support Node 26 but not 25.

`fastify-type-provider-zod` also brings `@fastify/swagger` and `openapi-types` as required peer
dependencies; the app does not use them.

## Models

The list comes live from OpenRouter's public `GET /api/v1/models`, which needs no key. On
2026-11-02 it held 452 entries from 67 providers, which leaves about 370 after these rules:

| Rule | Removes | Why |
|---|---|---|
| No `:batch` variants | 71 | Half-price duplicates of models already listed |
| No negative price | 7 | Routers such as `openrouter/auto` that report `-1` because they have no fixed price |

Free models stay. The server caches the list in memory for one hour. If a refresh fails it keeps
the last good list, and with no list at all it returns `503`. A malformed entry is skipped, not
fatal.

Limits per call: `max_tokens` 1024, timeout 60 seconds. Limit per run: 6 models. At 2026-11-02
prices, the longest allowed prompt sent to the six most expensive models costs about $1.50, so each
row shows its price and 13 models above $30 per million output tokens are marked as expensive.

## Structure

```
.env.example
.nvmrc
CLAUDE.md
README.md
index.html
vite.config.ts
docs/
  plans/base-app.md
  specs/README.md
src/
  shared/
    contracts.ts              Zod schemas used by both server and web
  server/
    index.ts                  entry point: reads config, starts the server
    app.ts                    composition root: builds Fastify, wires dependencies
    platform/
      config.ts               reads and parses environment variables
      errors.ts               AppError and its subclasses
    adapters/
      openrouter/
        openrouter-provider.ts   implements LlmProvider
        mock-provider.ts         test double, same port
    modules/
      runs/
        ports.ts              LlmProvider interface: listModels, complete
        domain.ts             limits and the rules that filter the model list
        model-catalog.ts      keeps the list in memory for one hour
        service.ts            validates models, runs them in parallel
        routes.ts             GET /api/models, POST /api/runs
  web/
    main.tsx
    App.tsx                   composes the page
    styles.css
    components/
      PromptForm.tsx
      ModelPicker.tsx
      ResultCard.tsx
      ResultsGrid.tsx
    hooks/
      use-models.ts
      use-run-models.ts
    lib/
      api-client.ts
      query-client.ts
```

Tests sit next to the file they cover, as `*.test.ts` or `*.test.tsx`.

`LlmProvider` lives in the `runs` module rather than `src/shared/`, because the browser must never
see it. `CLAUDE.md` records this.

## API

Field names are `camelCase`. Schemas are defined once in `src/shared/contracts.ts`.

```ts
// GET /api/models
{
  models: {
    id: string;
    label: string;
    inputUsdPerMTok: number;
    outputUsdPerMTok: number;
  }[];
}

// POST /api/runs: request
{ prompt: string; modelIds: string[] }

// POST /api/runs: 200 response
{
  results: (
    | {
        status: 'ok';
        modelId: string;
        output: string;
        latencyMs: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number | null;
      }
    | { status: 'error'; modelId: string; error: string; latencyMs: number }
  )[];
}
```

A model that fails is a normal `200` result with `status: 'error'`. A rejected request is a `400`,
and `503` means the model list is unavailable.

## Decisions

| # | Decision | Reason |
|---|---|---|
| D-1 | Thin backend | The API key must not reach the browser |
| D-2 | One OpenRouter key for every model | One account and one API instead of three |
| D-3 | Port and adapter around the LLM | Tests use the mock, and the judge can reuse the port later |
| D-4 | Zod schemas on the routes | Rule `edge-schema-first`; no manual `parse(req.body)` |
| D-5 | The server starts without a key | Rule `di-lazy-secrets`; the key is read when a run needs it |
| D-6 | Listen on `127.0.0.1:4000`, Vite on `:5173` with a proxy for `/api` | No login, so the server must not be reachable from the network |
| D-7 | Answers render as plain text | No Markdown rendering, so no HTML injection risk from model output |
| D-8 | OpenRouter's `usage.cost` is the cost source | It is returned by default; no price table to maintain |
| D-9 | A flat frontend layout, no `features/` folder | Rule `struct-grow-by-size`; there is one page |
| D-10 | Live model list instead of a hand-kept config file | The user wants practically every OpenRouter model, and the list changes often |
| D-11 | The server still validates each model against the list | A request cannot reach a model the page does not offer |
| D-12 | A flat list, newest first, using OpenRouter's names | Names already start with the provider, so search finds `opus` or `anthropic` without grouping |
| D-13 | Node 26 through `.nvmrc`, not a new global default | Other projects on this machine stay on their own version |

## Phases

Work on branch `feature/base-app`, one commit per phase. Nothing is pushed until the user says so.

### Phase 1: Scaffold

Add `.nvmrc` with `26`, then run `nvm install` and `nvm use`. Replace the placeholder
`src/items.ts`. Add `package.json` with `engines`, `package-lock.json`, `tsconfig.json`,
`vite.config.ts`, `index.html` and `.env.example`. Add `dist/` to `.gitignore`. Scripts: `dev`,
`test`, `typecheck`, `build`.

Verify: `node -v` shows 26; `npm install` reports no unmet peer dependencies and no engine warning;
`npm test` runs one trivial test; `npm run typecheck` passes.

Done when: the tools run on Node 26, and `git check-ignore .env` confirms the file is ignored.

### Phase 2: Backend

Add contracts, config, errors, port, domain rules, model catalog, service, routes, the OpenRouter
adapter and its mock.

Tests:

- `domain`: drops `:batch` and negative prices, keeps free models, converts prices to per-million,
  newest first.
- `model-catalog`: reuses the list inside one hour; refreshes after it; keeps the last good list
  when a refresh fails; reports unavailable when there is none.
- `service`: all succeed; one fails and the others survive; a timeout; result order; no model call
  on a model outside the list.
- `routes`, through `app.inject`: `GET /api/models`, a valid run, each `400` case, the `503` case.
- `openrouter-provider`, with a stubbed `fetch`: maps text, tokens and cost; a missing cost becomes
  `null`; a malformed list entry is skipped; a non-2xx response throws an error without the key; a
  missing key gives the AC-9 message.

Verify: `npm test`, `npm run typecheck`.

Done when: AC-3, AC-5, AC-6, AC-9, the server half of AC-10 and the filter rule of AC-13 pass.

### Phase 3: Frontend

Add the page, components, hooks, API client and styles. Layout works at phone width.

Tests, using a stubbed `fetch`: loading then models; list error with retry; search by name and by
ID; selected chips stay when filtered out; no seventh selection; expensive marker; Run disabled
states; pending cards; success card values; `n/a` cost; an error card beside a success card; failed
request message.

Verify: `npm test`, `npm run typecheck`, `npm run build`, then search `dist/` for the key's variable
name.

Done when: AC-1, AC-2, AC-4, AC-7, AC-8, AC-10, AC-12, the display half of AC-13 and AC-14 pass.

### Phase 4: Documentation

- `CLAUDE.md`: what the project is, Node 26 and `nvm use`, commands, folder map, layer and import
  rules, testing rules (next to the code, mock provider, no network), where specs and plans live.
- `README.md`: what it does, setup with nvm and an OpenRouter key, how to run.
- `docs/specs/README.md`: creates the spec folder and its conventions, so the SDD workflow uses
  `docs/specs/` without having to ask.

Verify: follow the README from a clean clone and reach a running page.

Done when: a new reader can set up and run the project from the README alone, and the repository
holds no reference to any other project.

### Phase 5: End-to-end check

1. Start the server with the mock provider from a throwaway script outside the repository, and
   check the page in a browser: normal run, error card, phone width. This spends no credits.
2. Add a real key to `.env` (the user does this), run two cheap models and one reasoning model, and
   confirm real answers, tokens and cost.

Done when: both checks pass and every acceptance criterion has evidence.

## Risks

| Risk | Plan |
|---|---|
| nvm does not switch automatically, so a new shell uses the global Node 25 | `CLAUDE.md` says to run `nvm use` first, and sessions start from a shell that ran it; the first check in any session is `node -v` |
| TypeScript 7 is a new major and a tool may reject it | Found in phase 1. Fall back to TypeScript 5 |
| OpenRouter adapter is only tested against a stub until phase 5 | Phase 5 step 2 is a real call |
| A reasoning model may use the whole 1024-token limit and return little text | Phase 5 step 2 tries one. If it happens, raise the limit |
| Some listed models may reject a request | The card shows the error (AC-5); the other cards are unaffected |
| An expensive model is selected by mistake | Price on every row, an expensive marker, and the 6-model and 1024-token limits |

## After this plan

The base app is merged first. Installing the plugin is a separate commit afterwards, and the judge
is the first feature specified and built through the SDD workflow.
