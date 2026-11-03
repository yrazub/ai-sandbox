# Implementation Plan: Session usage

**Goal:** The server keeps one in-memory tally of the input tokens, output tokens and cost of every successful model call since it started. It grows after each run, is served on `GET /api/usage` as the new shared contract `UsageResponse`, and resets on restart. The page shows the tally in a `<footer>` below the History section ("Session since 14:02: 12,400 tokens · $0.0040"). The footer refreshes when a run settles and when the window regains focus. Nothing is written to disk or to the browser. · **Packages:** `ai-sandbox` (single package: `src/shared`, `src/server`, `src/web`, plus `README.md` and `CLAUDE.md`) ·
**Spec:** `docs/specs/session-usage.md`, SPEC-2026-11-03-session-usage (umbrella, server module and web module; `Status: approved (2026-11-03)`, line 3) · **Execution mode:** **multi-agent**. For each phase, `sdd-engineering:implementer` builds the code and then `sdd-engineering:test-writer` writes the tests, each in a fresh context. After the last phase, `sdd-engineering:plan-verifier` and `architecture-review:architecture-reviewer` check the result. ·
**Review answers:**
- Q1: A window-focus refetch may update the footer during a run. R-WEB-15 is planned as written: no refetch when a run starts and no optimistic update. AC-24 is tested without a focus event.
- Q2: Option (b). `src/web/lib/query-client.ts` calls `focusManager.setEventListener` so that it listens to both `visibilitychange` and the window's `focus` event. Only the usage query refetches on focus. The models query keeps the global `refetchOnWindowFocus: false` (`src/web/lib/query-client.ts:6`, `src/web/hooks/use-models.ts:5`). TanStack drops the duplicate request when both events fire. Focusing an element does not fire window `focus`.
- Q3: After a failed request, the footer keeps "Session usage unavailable" while the next request is in flight. State order: error, then unavailable; data, then totals; neither, then loading.
- Q4: `UsageResponse` token fields stay integers ≥ 0. A fractional count joins the accepted "no handling" group (500 until restart), recorded under Risks.
- Q5: The gap from History to the border is 1.25rem at ≤40rem and 1.5rem when wide. The screenshot check compares both.
- F7: "tally is zero" (AC-17) means all five numbers are 0.
- R1: Three phases, as below.
- R2: "Same commit" means "same branch/PR".
- R3: A pure `addRunToUsage` goes in `domain.ts`. Totals and `startedAt` live in the `createRunService` closure, and `RunService.usage()` is added. The route sets `Cache-Control: no-store`. There is no new `Dependencies` field, and the `service.test.ts` setup does not change.
- R4: Reuse `formatCost` and the `call` helper. There is no new dependency. `unpricedCalls <= okCalls` is an object-level refine in the schema.
- R5: AC-27 / R-SRV-13 need no extra server code. It is listed as a risk.
- R6: The test seams exist. `src/web/App.test.tsx:105` is listed as expected to change.
- Execution mode: multi-agent.

· **Assumptions:**
- `docs/plans/README.md` does not exist (only `docs/plans/base-app.md` and `docs/plans/prompt-history.md`). This plan follows the layout of `docs/plans/prompt-history.md`, which uses the SDD template headings that `sdd-engineering:plan-verifier` reads.
- R1 assigns the README and the web lines of the `CLAUDE.md` folder map to phase 3, and this plan follows that assignment. R2 would put each doc line in the phase that adds the code it describes. Both land on the same branch/PR, so AC-31 and AC-32 hold either way.
- `src/server/app.ts` needs no change. `createRunService` is called once per `buildApp` (`src/server/app.ts:51`), so a tally created inside it is per app instance (R-SRV-7, NFR-4).

## Context read

| Document | What it settles for this plan |
|---|---|
| `CLAUDE.md` | Node 26 via `source ~/.nvm/nvm.sh && nvm use` (9-15). Commands `npm test`, `npm run typecheck`, `npm run build` (17-24). Folder map lines to edit (41, 44-46). Server layer rules (53-73): contract defined once (56-57), pure `domain.ts` (58), service gets ports as arguments (61-62), thin routes with schemas on the route (63-65), one error handler (66-67). Frontend rules (77-86). Naming (91-92). Testing rules (96-102) |
| `docs/specs/session-usage.md` | AC-1 to AC-34 (73-108), EC-1 to EC-21 (116-137), NFR-1 to NFR-6 (142-153). `UsageResponse` contract (230-237). Route (239-243). R-SRV-1 to R-SRV-16 (253-270). R-WEB-1 to R-WEB-21 (285-307). Data access (309-314). Layout (316-334). Documentation changes (338-351). Test hints (353-378) |
| `docs/specs/README.md` | Every criterion needs a test or a manual check (28). A `CLAUDE.md` change lands with the work (29-30) |
| `docs/plans/base-app.md` | No ESLint and no dependency-cruiser (30), so there is no architecture-check command |
| `docs/plans/prompt-history.md` | Plan layout, `Verify` style, and the `App.history.test.tsx` helper-copy pattern this plan reuses |
| `src/shared/contracts.ts` | Schema/type naming pattern. `RunResult` ok branch has `inputTokens`, `outputTokens`, `costUsd: number \| null` (33-50). Unchanged |
| `src/server/modules/runs/service.ts` | `RunService` (7-10). `Options` with injected `now` (12-24). `run` validates, then `await Promise.all` (58-67). The tally addition goes after line 65, before the return |
| `src/server/modules/runs/domain.ts` | Pure rules module that already imports a shared type (1). `addRunToUsage` goes here |
| `src/server/modules/runs/routes.ts` | Route pattern with `withTypeProvider<ZodTypeProvider>()` and a `response` schema (7-13) |
| `src/server/app.ts` | Error handler: `AppError`, then 4xx, then `log.error` and generic 500 (33-48). Service built once per app (51) |
| `src/server/adapters/openrouter/mock-provider.ts` | `respond` option (17, 32-39) gives deferred, null-cost, zero and negative values with no change |
| `src/server/adapters/openrouter/openrouter-provider.ts` | Tokens accepted as any number, cost nullish (31-33, 119-121). Source of the F4/Q4 risk |
| `src/server/modules/runs/routes.test.ts`, `service.test.ts`, `domain.test.ts` | Test style (`start()`, `app.inject`, `setup()`). No existing expectation changes in phase 1 |
| `src/web/lib/api-client.ts` | The `call` helper turns network failure, error status and schema mismatch into thrown errors (9-29). `fetchModels` pattern (31-33) |
| `src/web/lib/query-client.ts` | Global defaults `retry: false, refetchOnWindowFocus: false` (6). These stay unchanged; phase 3 adds only the `focusManager.setEventListener` setup |
| `src/web/hooks/use-models.ts`, `use-run-models.ts` | Query and mutation patterns (5; 10-15) |
| `src/web/components/result-format.ts` | `formatCost`, reused for AC-12 (6-11) |
| `src/web/App.tsx` | Returns a single `<main>` (39-107). The footer goes after it |
| `src/web/styles.css` | `main` column (41-45), `.meta` muted style (245-249), narrow `main` padding 0.75rem (371-374) |
| `src/web/App.test.tsx` | `stubFetch` throws on `/api/usage` (38-46). `toHaveBeenCalledTimes(2)` (105) |
| `src/web/App.history.test.tsx` | Stub and helpers to copy (40-76). Call counts taken after mount (366/378, 570/574) stay valid |
| `src/web/test-setup.ts`, `vite.config.ts` | `fetch` rejected and `localStorage` cleared before each test (6-9). Default env node, jsdom opt-in (12-14) |
| `node_modules/@tanstack/query-core/build/modern/focusManager.js` | The v5 default listener is `visibilitychange` only (14-22). `setEventListener` replaces it and cleans up the old one (59-66) |
| `node_modules/@tanstack/query-core/build/modern/query.js` | Focus refetch uses `cancelRefetch: false`, so an in-flight fetch is reused (255, 352-356). A fetch with no data clears `error` (548-556), which matters for Q3 |
| `node_modules/fastify-type-provider-zod/dist/esm/core.js`, `errors.js` | The response serializer throws `ResponseSerializationError` (statusCode 500) on a schema mismatch (core 117-118, errors 5) |
| skills `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`, `frontend-ui-architecture`, `react-best-practices` | The rule IDs used in the file tables |

## Constraints

- **Architecture:** `UsageResponse` is defined once in `src/shared/contracts.ts`. It is imported by the route and by `src/web/lib/api-client.ts`, never redeclared — `CLAUDE.md:56-57`; onion `zod-contract-once`.
- **Architecture:** `domain.ts` stays pure: `addRunToUsage` does no I/O and imports nothing from Fastify, `platform/` or adapters — `CLAUDE.md:58`; onion `dep-domain-framework-free`.
- **Architecture:** The tally lives in the `createRunService` closure. The service gets no new port and builds no adapter. `buildApp`'s `Dependencies` gets no new field (R3) — `CLAUDE.md:61-62`; onion `di-narrow-deps`.
- **Architecture:** The usage handler sets the header and calls one service method. The Zod `response` schema sits on the route — `CLAUDE.md:63-65`; onion `edge-thin-routes`, `edge-schema-first`.
- **Architecture:** No new server error code. A tally that breaks the schema fails in the serializer and is rendered by the existing handler — `CLAUDE.md:66-67`; `src/server/app.ts:42-47`.
- **Architecture:** Frontend imports go `lib` and plain helpers ← `hooks` ← `components` ← `App.tsx`. The footer gets data by props. Server data goes only through `lib/api-client.ts` and TanStack Query, never into `useState` — `CLAUDE.md:77-80`.
- **Architecture:** Footer text rules are plain functions in `src/web/components/usage-format.ts`, unit-tested without React. The cost rule is the existing `formatCost`, not a copy — `CLAUDE.md:84-85`; spec lines 311-314.
- **Architecture:** Every footer value renders as JSX text — `CLAUDE.md:86`; spec R-WEB-17.
- **Architecture:** The query client's `defaultOptions` stay as they are. Only the usage query turns on `refetchOnWindowFocus` (R-WEB-20) — `src/web/lib/query-client.ts:6`.
- **Architecture:** There is no architecture-check command, so the `Verify` lines hold typecheck, test and build only — `docs/plans/base-app.md:30`; `package.json:10-14`.
- **Environment:** Run `source ~/.nvm/nvm.sh && nvm use` in every new shell before any `Verify` command — `CLAUDE.md:9-15`.
- **Testing:** No test touches the network. Server tests use `MockProvider` and `app.inject`. Page tests answer `/api/usage` from a `fetch` stub. Component test files start with `// @vitest-environment jsdom` — `CLAUDE.md:96-102`; spec NFR-1.
- **Testing:** Locale-dependent strings are compared against `Intl.NumberFormat` / `Intl.DateTimeFormat` output or the helper's own output, never against a hard-coded machine-locale literal — spec lines 373-375.
- **Manual checks:** Every manual or screenshot check (AC-8, AC-29, the Layout comparison, the real-browser focus check, and the AC-31/AC-32 read-through) is recorded as "manual check: skipped (headless run)" in this run.
- **Project notes:** No notes file exists in the repository (no `NOTES.md` or similar at the root or under `src/`). Nothing to carry.
- **Do not touch:**
  - `.env` (never open, print or log it — `CLAUDE.md:28-30`)
  - `package.json`, `package-lock.json` (no new dependency)
  - `src/server/adapters/**` (the adapter and `MockProvider` are unchanged — spec line 222-223)
  - `src/server/app.ts`, `src/server/index.ts`, `src/server/platform/**`
  - `src/shared/contracts.ts` existing schemas (`RunRequest`, `RunResponse`, `RunResult`, `ModelsResponse`, `ErrorResponse`), which stay byte-identical
  - `src/web/lib/history-storage.ts`, `src/web/hooks/use-history.ts`, `src/web/components/HistorySection.tsx`, `src/web/components/history-format.ts` (the History row total is out of scope — spec Non-goals, G16)
  - `src/web/test-setup.ts`
  - `docs/specs/session-usage.md`

## Phases

### 1 · Usage contract and server tally — ai-sandbox (`src/shared`, `src/server`)

This phase adds `UsageResponse`, the pure tally rule, the running totals inside the run service, `RunService.usage()` and `GET /api/usage`, plus the `modules/runs/` line of the `CLAUDE.md` folder map. The new contract and the change to the core run flow are the riskiest parts, so they come first and are pinned by route tests before any page code depends on them. The addition runs in the same synchronous step that follows `await Promise.all` (`src/server/modules/runs/service.ts:65`), so it is applied before the 200 is sent (AC-5) and exactly once per run (AC-6), whatever happens to the client (AC-28).

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `src/shared/contracts.ts` | Adds the schema `UsageResponse` and its type of the same name, after `ErrorResponse` (exact shape below). Existing schemas are unchanged | engineering-paved-path:zod, engineering-paved-path:onion-architecture, engineering-paved-path:typescript-expert | `zod-contract-once`; zod `type-export-schemas-and-types`, `refine-add-path`; `CLAUDE.md:56-57,92` |
| `src/server/modules/runs/domain.ts` | Adds `export type UsageTotals = Omit<UsageResponse, 'startedAt'>`, `export const EMPTY_USAGE: Readonly<UsageTotals>` (all five values 0), and `export function addRunToUsage(totals: UsageTotals, results: RunResult[]): UsageTotals`. The function returns a new object and never mutates `totals`. For each `status: 'ok'` result it adds `inputTokens`, `outputTokens` and 1 to `okCalls`. It adds `costUsd` to the cost when not null, and 1 to `unpricedCalls` when `costUsd` is null. Results with `status: 'error'` add nothing. No rounding. Imports only types from `../../../shared/contracts` | engineering-paved-path:onion-architecture, engineering-paved-path:typescript-expert | `dep-domain-framework-free`, `zod-domain-vs-wire`, `zod-trust-inside`; `CLAUDE.md:58` |
| `src/server/modules/runs/service.ts` | `RunService` gains `usage(): UsageResponse`. Inside `createRunService`, two closure values: `const startedAt = new Date(now()).toISOString()` (computed once, when the service is created) and `let totals: UsageTotals = EMPTY_USAGE`. In `run`, after `const results = await Promise.all(...)` and before `return { results }`, it does `totals = addRunToUsage(totals, results)`. `totals` is read after the `await`, in that one statement, and never captured before it. The unknown-model `throw` and a catalog rejection happen before that line, so they add nothing. `usage()` returns `{ ...totals, startedAt }`. No other change to `runOne` or `models` | engineering-paved-path:onion-architecture, engineering-paved-path:typescript-expert | `di-narrow-deps`, `dep-inward-only`, `edge-errors-mapped-at-edge`; `CLAUDE.md:61-62,66-67` |
| `src/server/modules/runs/routes.ts` | Imports `UsageResponse` and registers `typed.get('/api/usage', { schema: { response: { 200: UsageResponse } } }, async (_request, reply) => { reply.header('cache-control', 'no-store'); return service.usage(); })`. It reads no body, query or header | engineering-paved-path:onion-architecture, engineering-paved-path:fastify-best-practices, engineering-paved-path:security | `edge-thin-routes`, `edge-schema-first`, `edge-fastify-in-routes-only`; `CLAUDE.md:63-65`; security A02/A10 (generic 500, no value in the body), spec NFR-2, NFR-3 |
| `CLAUDE.md` | Folder map line 41 becomes: `modules/runs/              ports.ts, domain.ts, model-catalog.ts, service.ts (also the in-memory usage tally), routes.ts (incl. GET /api/usage)`. Layer rules are unchanged | — | spec lines 348-351, R-SRV-16 |

Contract the code must match (spec lines 230-237, R4):
```ts
export const UsageResponse = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    okCalls: z.number().int().nonnegative(),
    unpricedCalls: z.number().int().nonnegative(),
    startedAt: z.iso.datetime(),
  })
  .refine((u) => u.unpricedCalls <= u.okCalls, {
    message: 'unpricedCalls must not exceed okCalls',
    path: ['unpricedCalls'],
  });
export type UsageResponse = z.infer<typeof UsageResponse>;
```

Service interface the route must match:
```ts
export interface RunService {
  models(): Promise<ModelInfo[]>;
  run(request: RunRequest): Promise<RunResponse>;
  usage(): UsageResponse;
}
```

**Tests (sdd-engineering:test-writer):**
- Add to `src/server/modules/runs/domain.test.ts`, a `describe('addRunToUsage')` block. Cases:
  - two ok results add their input and output tokens, their costs and 2 `okCalls` to `EMPTY_USAGE`;
  - an error result adds nothing (a mix of one ok and one error adds only the ok one);
  - an ok result with `costUsd: null` adds its tokens, 1 `okCalls` and 1 `unpricedCalls`, and leaves the cost unchanged;
  - an ok result with `costUsd: 0` and 0 tokens adds 1 `okCalls`, leaves the tokens and cost at their previous values, and leaves `unpricedCalls` unchanged;
  - costs `0.1` and `0.2` sum to exactly `0.1 + 0.2` (unrounded);
  - the input `totals` object is not mutated.
- Add to `src/server/modules/runs/service.test.ts`. The existing `setup` helper is unchanged; cases that need `now` call `createRunService` directly. Cases:
  - a fresh service's `usage()` is all zeros, with `startedAt` equal to `new Date(fixedNow).toISOString()` for an injected `now: () => fixedNow`;
  - after `run` resolves with the default `MockProvider` on two models, `usage()` holds 20 input, 40 output, cost `0.0002` (computed as `0.0001 + 0.0001`) and 2 `okCalls`;
  - a run whose model times out (the existing never-answering `respond`, `timeoutMs` 20) adds nothing for that result;
  - a run rejected with `ValidationError` (unknown model) leaves `usage()` at zero;
  - a run rejected because the catalog is unavailable (`MockProvider({ listError })`) leaves `usage()` at zero;
  - two runs started together with deferred `respond` promises, released in reverse order, leave `usage()` equal to the sum of both runs' ok results;
  - **AC-28:** a run is started and its promise is not awaited by the test. The deferred provider call is released, and `await vi.waitFor(() => expect(service.usage().okCalls).toBe(1))` passes.
- Add to `src/server/modules/runs/routes.test.ts`, a new `describe('GET /api/usage')` using the existing `start()` and `afterEach`. Cases:
  - **AC-4, AC-7, NFR-3:** a fresh app answers 200 with exactly the six keys `inputTokens, outputTokens, costUsd, okCalls, unpricedCalls, startedAt`. The five numbers are 0, and `Date.parse(startedAt)` lies between `Date.now()` taken just before `buildApp` and just after the response;
  - **AC-25:** the 200 response has the header `cache-control: no-store`;
  - **NFR-2:** the GET makes no provider call (`provider.calls` and `provider.listCalls` unchanged) and a second GET returns the same body;
  - **AC-1, AC-5:** after an awaited `POST /api/runs` with 200 on `['mock/fast', 'mock/smart']`, the GET reports 20 / 40 / `0.0002` / 2 ok / 0 unpriced;
  - **AC-2:** after a 200 run whose `respond` throws for one of two models, the GET reports only the other model's values and 1 `okCalls`;
  - **AC-3:** for each 400 payload of the existing `it.each` table, malformed JSON, and the 503 case, the GET after the rejected POST is all zeros (a new `it.each`; the existing one is not edited);
  - **AC-6:** with `respond` returning deferred promises, two POSTs are fired without awaiting. The test waits until `provider.calls` has both calls, releases them in reverse order, awaits both responses, and the GET equals the sum of both runs;
  - **AC-14 (route):** a `respond` returning `costUsd: null` gives tokens added, cost 0, `okCalls` 1, `unpricedCalls` 1;
  - **AC-27:** a `respond` returning `inputTokens: -5`, then the GET answers 500 with a body exactly equal to `{ error: 'Internal server error' }` and containing no digit;
  - **NFR-4:** two apps built one after the other keep separate tallies (a run on the first leaves the second at zero).
- Expected to change: none.

**Verify (code):** `source ~/.nvm/nvm.sh && nvm use` · `npm run typecheck` · `npm test`
**Verify (phase):** `source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm test && npm run build`
**Done when:**
- AC-1 / R-SRV-1: a `POST /api/runs` that returns 200 adds each ok result's input tokens, output tokens, cost and one ok call to the tally that `GET /api/usage` reports.
- AC-2 / R-SRV-3: an error result, including a timeout, adds nothing to the tally.
- AC-3 / R-SRV-4: a run answered with 400 or 503 leaves the tally unchanged.
- AC-4 / R-SRV-5: `GET /api/usage` answers 200 with a `UsageResponse` holding exactly the six fields, through one `service.usage()` call, reading no body, query or header and calling no provider (NFR-2, NFR-3).
- AC-5 / R-SRV-2: a GET started after a POST has returned 200 includes that run's ok results.
- AC-6 / R-SRV-6: after concurrent runs released in any order, the tally equals the sum of all their ok results.
- AC-7 / R-SRV-7: a new app reports zeros and a `startedAt` taken when the app was built. Each app instance has its own tally (NFR-4).
- AC-8 / R-SRV-8: the tally is held only in the `createRunService` closure. No file changed in this phase imports `node:fs` or writes the tally to the environment or the log. The manual restart check is recorded as "manual check: skipped (headless run)".
- AC-14 / R-SRV-9: an ok result with `costUsd: null` adds its tokens, 1 ok call and 1 unpriced call, and leaves the cost unchanged.
- AC-15 / R-SRV-10: a cost of 0 or zero tokens are added as reported and are not counted as unpriced.
- AC-25 / R-SRV-11: the 200 response carries `Cache-Control: no-store`.
- AC-26 / R-SRV-12: `costUsd` is the unrounded sum (`0.1 + 0.2` stays `0.30000000000000004`).
- AC-27 / R-SRV-13: a tally that breaks `UsageResponse` (a negative token total) gives 500 `{ "error": "Internal server error" }` with no tally value in the body.
- AC-28 / R-SRV-14: a run's ok results are added when its results are in, independent of whether the caller consumes the response.
- AC-32 (server half) / R-SRV-16: the `modules/runs/` line of the `CLAUDE.md` folder map names the usage tally and `GET /api/usage`.

### 2 · Session footer — ai-sandbox (`src/web`)

This phase adds the API client function, the usage query hook, the footer's plain format helpers, the `SessionFooter` component and its placement after `<main>`, plus its styles. It delivers every footer state on page load: loading, loaded, zero and unavailable. Refresh triggers wait for phase 3. It comes after phase 1 because it consumes `UsageResponse`, and before phase 3 because the triggers need a query to refresh.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `src/web/lib/api-client.ts` | Adds `export async function fetchUsage(): Promise<UsageResponse>`, which returns `call('/api/usage', UsageResponse)`. An unreachable server, an error status or a body that fails `UsageResponse` (including the `unpricedCalls <= okCalls` refine) rejects through the existing `call` | engineering-paved-path:zod, engineering-paved-path:frontend-ui-architecture | zod `parse-use-safeparse`, `parse-never-trust-json`; `logic-one-data-path`; `CLAUDE.md:78-79` |
| `src/web/hooks/use-usage.ts` (new) | Exports `export const usageQueryKey = ['usage'] as const` and `useUsage(): { usage: UsageResponse \| undefined; failed: boolean }`. The hook calls `useQuery({ queryKey: usageQueryKey, queryFn: fetchUsage })` and returns `usage: query.data` and `failed: query.isError \|\| (query.data === undefined && query.errorUpdateCount > 0)`. The second part keeps "unavailable" while a retry after a failed first load is in flight, because TanStack clears `error` on a fetch with no data (`query.js:548-556`; Q3, AC-18 "first request"). No `useState`, no storage, no persister | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture | `logic-hooks-wire`, `logic-no-server-state-copy`, `logic-query-options`, `name-react-rules`; `CLAUDE.md:77-80` |
| `src/web/components/usage-format.ts` (new) | Plain functions, see the list below. Imports `formatCost` from `./result-format` and the `UsageResponse` type | engineering-paved-path:frontend-ui-architecture, engineering-paved-path:typescript-expert | `logic-pure-domain`, `place-helper-not-hook`, `struct-colocate`; `CLAUDE.md:84-85` |
| `src/web/components/SessionFooter.tsx` (new) | Props `{ usage: UsageResponse \| undefined; failed: boolean }`. Renders `<footer className="session-footer"><p>{text}</p></footer>`, where `text` is: `'Session usage unavailable'` when `failed`; otherwise `formatUsageLine(usage)` when `usage` is defined; otherwise `'Session: loading…'`. No `role`, no `aria-live`, no button, no `dangerouslySetInnerHTML` | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture, engineering-paved-path:security | `split-one-per-file`, `split-pure`; react-best-practices Conditional Rendering (early returns); security A05; `CLAUDE.md:78,86` |
| `src/web/App.tsx` | Calls `const usage = useUsage()` and returns a fragment: the existing `<main>…</main>` unchanged, then `<SessionFooter usage={usage.usage} failed={usage.failed} />` after it, outside `<main>` | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture | `struct-one-way`; `CLAUDE.md:43,77` |
| `src/web/styles.css` | Adds the footer styles below (spec Layout lines 316-334) | — | spec Layout; Q5 |

**`usage-format.ts` — the functions.** `locale` is optional; `undefined` means the browser locale.
- `formatTokenTotal(usage: Pick<UsageResponse, 'inputTokens' | 'outputTokens'>, locale?: string): string` returns `new Intl.NumberFormat(locale).format(usage.inputTokens + usage.outputTokens)`.
- `formatUnpricedSuffix(unpricedCalls: number): string` returns `` ` (${unpricedCalls} calls without cost)` `` when `unpricedCalls >= 1`, and `''` otherwise.
- `formatSessionStart(startedAt: string, locale?: string): string` returns `new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(startedAt))`, which gives hours and minutes in local time (same `timeStyle` as `history-format.ts`).
- `formatUsageLine(usage: UsageResponse, locale?: string): string` returns `` `Session since ${formatSessionStart(usage.startedAt, locale)}: ${formatTokenTotal(usage, locale)} tokens · ${formatCost(usage.costUsd)}${formatUnpricedSuffix(usage.unpricedCalls)}` ``. For an all-zero tally this reads "Session since <time>: 0 tokens · $0" (F7).

**`styles.css` additions:**
- `.session-footer`: `max-width: 64rem`, `margin: 0 auto`, `padding: 0.5rem 1rem 1rem`. The 0.5rem top padding plus `main`'s 1rem bottom padding gives the 1.5rem gap from History to the border.
- `.session-footer p`: `margin: 0`, `padding-top: 0.75rem`, `border-top: 1px solid var(--border)`, `color: var(--muted)`, `font-size: 0.875rem`, `font-weight: 400`. The border sits on the paragraph, so it spans only the column's content width. No `white-space: nowrap`.
- Inside the existing `@media (max-width: 40rem)` block: `.session-footer { padding: 0.5rem 0.75rem 1rem; }`. This gives a 1.25rem gap with `main`'s 0.75rem (Q5) and the same left edge as the heading.

**Tests (sdd-engineering:test-writer):**
- Add `src/web/components/usage-format.test.ts` (node environment). Cases:
  - **AC-11:** `formatTokenTotal({ inputTokens: 12000, outputTokens: 400 }, 'en-US')` is `'12,400'`, and with `'fr-FR'` it equals `new Intl.NumberFormat('fr-FR').format(12400)`.
  - **AC-12:** `formatUsageLine` with `costUsd` `0`, `0.00005`, `0.004` and `1.5` contains `· $0`, `· <$0.0001`, `· $0.0040` and `· $1.50`.
  - **AC-16:** `formatUnpricedSuffix(2)` is `' (2 calls without cost)'` and `formatUnpricedSuffix(0)` is `''`.
  - **AC-33:** `formatSessionStart(iso, 'en-GB')` equals `new Intl.DateTimeFormat('en-GB', { timeStyle: 'short' }).format(new Date(iso))` for a fixed ISO string, and `formatUsageLine` starts with `` `Session since ${that}: ` ``.
  - **AC-17:** an all-zero tally gives exactly `` `Session since ${formatSessionStart(startedAt, 'en-US')}: 0 tokens · $0` `` with `'en-US'`.
- Add `src/web/App.usage.test.tsx`. It starts with `// @vitest-environment jsdom`, has `afterEach(() => { cleanup(); vi.restoreAllMocks(); })`, and copies `MODELS`, `ok()`, `renderApp`, `pick` and `runOnce` from `src/web/App.history.test.tsx:18-76`. Its `stubFetch` also takes `usage?: () => Response | Promise<Response>`, answers `/api/usage` with it (default: a zero `UsageResponse`), and exposes a `count(url)` helper that counts calls by URL. Cases:
  - **AC-10:** a tally of 12000 input and 400 output tokens with cost `0.004` shows `` `${formatTokenTotal(usage)} tokens · $0.0040` `` in the `contentinfo` landmark.
  - **AC-13:** `getByRole('contentinfo')` exists, is not inside `main`, and comes after `main` in document order.
  - **AC-16:** `unpricedCalls: 2` shows the text ending in `$0.0040 (2 calls without cost)`.
  - **AC-17:** a zero tally shows `` `Session since ${formatSessionStart(startedAt)}: 0 tokens · $0` ``.
  - **AC-33:** the footer text starts with `` `Session since ${formatSessionStart(startedAt)}: ` ``.
  - **AC-18:** with `/api/usage` never resolving, the footer reads "Session: loading…".
  - **AC-20 (first load):** a 500, a 200 with body `{}`, a 200 with `unpricedCalls: 3, okCalls: 1`, and an unreachable server (stub throws `TypeError`) each show "Session usage unavailable" with no button inside the footer.
  - **AC-21:** in the loading, loaded and unavailable states, the footer has no `role` attribute and contains no `[role="alert"]`, `[role="status"]` or `[aria-live]`.
  - **AC-30:** the loaded footer contains exactly one element, its `<p>`, and no other element.
  - **AC-9:** after the footer loads and after a 200 run, `sessionStorage.length` is 0, `document.cookie` is `''`, and every key in `localStorage` equals `HISTORY_KEY`.
- Expected to change `src/web/App.test.tsx`:
  - The `stubFetch` (lines 38-46) answers `/api/usage` with a zero `UsageResponse`.
  - The assertion at line 105, `expect(fn).toHaveBeenCalledTimes(2)`, counts only `/api/models` calls and expects 2, because the page now also requests `/api/usage` on mount.

**Verify (code):** `source ~/.nvm/nvm.sh && nvm use` · `npm run typecheck` · `npm test` (only `src/web/App.test.tsx:105` may fail)
**Verify (phase):** `source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm test && npm run build`
**Verify (manual, screenshots):** Recorded as "manual check: skipped (headless run)". When run, the `sdd-engineering:run-plan` sub-agent works on the user's running `npm run dev`. It never starts the stack, never presses Run (no credits), uses one tab and closes it at the end.
1. Open `http://localhost:5173` and wait for the model list. Screenshot the bottom of the page: "Session since <HH:MM>: <n> tokens · <cost>" below the History section (AC-10, AC-13, AC-17, AC-33).
2. Compare against the spec's `## Layout` (lines 316-334). There is no design screen. Check:
   - the footer text starts at the same left edge as the `h1`;
   - the top border is 1px `var(--border)` and spans the column's content width only;
   - the gap from the History section to the border is 1.5rem;
   - the text sits 0.75rem below the border;
   - the text is muted and 0.875rem;
   - the footer is not sticky (it scrolls with the page).
3. Resize to 375px wide. Screenshot it and confirm that `document.documentElement.scrollWidth <= window.innerWidth`, that the gap from History to the border is 1.25rem, that the side padding is 0.75rem, and that the text wraps (AC-29).
4. Check the console for React warnings.

**Done when:**
- AC-9 / R-WEB-18: loading the footer and running write no usage data to `localStorage`, `sessionStorage` or cookies, and the usage query has no persister.
- AC-10 / R-WEB-2, R-WEB-3: the loaded footer shows "<tokens> tokens · <cost>" from the one `useUsage` query, with no `useState` copy.
- AC-11 / R-WEB-4: `formatTokenTotal` sums input and output tokens, grouped by thousands in the given or browser locale.
- AC-12 / R-WEB-5: the footer cost comes from `formatCost` in `result-format.ts`.
- AC-13 / R-WEB-6: the footer is a `<footer>` after `<main>`, outside it, and is the page's `contentinfo` landmark.
- AC-16 / R-WEB-7: " (<N> calls without cost)" follows the cost when `unpricedCalls` ≥ 1, and nothing when it is 0.
- AC-17 / R-WEB-8: an all-zero tally shows "Session since <time>: 0 tokens · $0".
- AC-18 / R-WEB-9: while the first request is in flight, the footer shows the muted "Session: loading…".
- AC-20 (first load) / R-WEB-1, R-WEB-11: an unreachable server, an error status or a body that fails `UsageResponse` shows the muted "Session usage unavailable" with no button, and the query keeps `retry: false`.
- AC-21 / R-WEB-12: the footer has no `alert` or `status` role and no live region in any state.
- AC-29 / R-WEB-16: the footer CSS sets 0.75rem side padding at ≤40rem and no `nowrap`. The manual 375px check is recorded as "manual check: skipped (headless run)".
- AC-30 / R-WEB-17: every footer value renders as JSX text inside one `<p>`.
- AC-33 / R-WEB-19: the loaded footer starts with "Session since <time>: ", with `startedAt` as a local hours-and-minutes time.

### 3 · Refresh triggers and documentation — ai-sandbox (`src/web`, `README.md`, `CLAUDE.md`)

This phase keeps the footer current: the usage query is invalidated when a run settles, and refetched when the window regains focus (both `visibilitychange` and window `focus`). It also adds the README section and the web lines of the `CLAUDE.md` folder map. It comes last because it only wires triggers to the query from phase 2, and the documents then describe the finished feature.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `src/web/hooks/use-run-models.ts` | Calls `const queryClient = useQueryClient()` and adds `onSettled: () => { void queryClient.invalidateQueries({ queryKey: usageQueryKey }); }` to `useMutation`. `usageQueryKey` is imported from `./use-usage`. The callback does not return the promise, so the mutation is not held pending until the usage refetch ends. There is no `onMutate` and no optimistic update. The existing `onSuccess` is unchanged | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture | `logic-hooks-wire`; react-best-practices "NEVER use useEffect for event handling"; R-WEB-13, R-WEB-15 |
| `src/web/hooks/use-usage.ts` | The `useQuery` call adds `refetchOnWindowFocus: true`. Nothing else changes | engineering-paved-path:react-best-practices | `logic-hooks-wire`; R-WEB-20 |
| `src/web/lib/query-client.ts` | Adds a module-private `listenToWindowFocus()`, called at the start of `createQueryClient()`. It runs `focusManager.setEventListener((handleFocus) => { … })` (`focusManager` imported from `@tanstack/react-query`). When `typeof window !== 'undefined'`, the setup adds one `listener = () => handleFocus()` to `window` for both `'visibilitychange'` and `'focus'`, without `capture`, and returns a cleanup that removes both. `defaultOptions` stay exactly `{ queries: { retry: false, refetchOnWindowFocus: false } }`. A short comment says why: v5's default listens to `visibilitychange` only | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture | react-best-practices "ALWAYS clean up subscriptions, timers, and event listeners"; `place-lib-vs-utils`; R-WEB-20 (global default unchanged) |
| `README.md` | 1) In the opening paragraph (line 6), replace "stores nothing" with "stores nothing on disk; keeps an in-memory usage tally reset on restart". 2) Add a `## Session usage` section after `## History` stating: the footer shows the tokens and cost since the server started; every tab and client feeds the same tally; it resets on every restart, including each `tsx watch` restart under `npm run dev`; it counts only usage reported for successful results, so it can be lower than the OpenRouter bill (a failed or timed-out call may still be billed); calls that report no cost are counted as "calls without cost". The section also names the code: `src/web/components/SessionFooter.tsx`, `src/web/hooks/use-usage.ts` and `GET /api/usage` in `src/server/modules/runs/routes.ts` | — | spec lines 341-347, R-SRV-15 |
| `CLAUDE.md` | The folder map changes: the `components/` line (44) adds "; SessionFooter.tsx + usage-format.ts (session usage footer)", and the `hooks/` line (45) adds `use-usage.ts`. Layer rules are unchanged | — | spec lines 348-351, R-WEB-21 |

**Tests (sdd-engineering:test-writer):**
- Add to `src/web/App.usage.test.tsx`. Each case counts `/api/usage` requests with `count('/api/usage')` after the first load. Cases:
  - **AC-22:** a run answered 200, a run answered 400, and a run whose request throws `TypeError` each raise the usage request count by exactly 1 after the run settles. After the 200 run, the footer shows the second tally the stub returns.
  - **AC-24:** with `/api/runs` held on a deferred promise, the footer keeps the first tally's text and the usage count stays the same while the run is pending (no focus event is dispatched). After release, the count rises by 1 and the footer shows the second tally.
  - **AC-19:** after a loaded tally, a run settles and the next `/api/usage` is held pending. The footer still shows the previous totals and never "Session: loading…".
  - **AC-20 / Q3:**
    - First load OK. A run settles and the refetch answers 500, so the footer shows "Session usage unavailable". A second run settles with the refetch held pending, and the footer still shows "Session usage unavailable". When that refetch resolves OK, the totals show.
    - Separately, the first load fails, then a window `focus` triggers a held refetch, and the footer stays "Session usage unavailable".
  - **AC-23:** with two seeded history entries (`localStorage.setItem(HISTORY_KEY, …)` as in `App.history.test.tsx:78-89`; two are needed because "Clear history" is only rendered while entries remain, `src/web/components/HistorySection.tsx:24`), restoring the first, deleting the first, and "Clear history" then "Clear" leave the usage count unchanged.
  - **AC-34:** `act(() => window.dispatchEvent(new Event('focus')))` raises the usage count by 1 and leaves the `/api/models` count unchanged. `document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))` also raises it by 1 (browsers fire `visibilitychange` at `document` with `bubbles: true`, so it reaches the `window` listener in `src/web/lib/query-client.ts`). Dispatching `window` `focus` and that bubbling `visibilitychange` together while the usage request is held raises it by exactly 1. Calling `screen.getByLabelText('Prompt').focus()` raises it by 0.
  - **Regression guard (base AC-2, Run button):** after a 200 run whose usage refetch is held pending, the Run button becomes enabled again, which shows that `onSettled` does not hold the mutation.
- Add `src/web/lib/query-client.test.ts` (node environment). Case: **AC-34 / R-WEB-20:** `createQueryClient().getDefaultOptions()` equals `{ queries: { retry: false, refetchOnWindowFocus: false } }`, which pins the global defaults while `listenToWindowFocus` is added.
- Expected to change: none. `App.history.test.tsx` takes its counts after mount and does not count across a settled run, and its stub's thrown `/api/usage` error only puts the footer in its unavailable state. `App.test.tsx` answers `/api/usage` from phase 2.

**Verify (code):** `source ~/.nvm/nvm.sh && nvm use` · `npm run typecheck` · `npm test`
**Verify (phase):** `source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm test && npm run build`
**Verify (manual, screenshots):** Recorded as "manual check: skipped (headless run)". When run, the `sdd-engineering:run-plan` sub-agent works on the user's running stack. It never presses Run, uses one tab and closes it at the end.
1. On `http://localhost:5173`, open the network panel and filter on `/api/usage`.
2. Click outside the browser window, then back into the page. Confirm one new `/api/usage` request and no new `/api/models` request (AC-34).
3. Click into the Prompt box. Confirm no new `/api/usage` request (AC-23 focus side).
4. Read `README.md` and the `CLAUDE.md` folder map against spec lines 341-351 (AC-31, AC-32).
5. Check the console for React warnings.

**Done when:**
- AC-19 / R-WEB-10: while a later usage request is in flight, the footer keeps the last loaded totals with no loading text.
- AC-20 / R-WEB-11 (Q3): after a failed request, the footer shows "Session usage unavailable" until a request succeeds, including while the next request is in flight.
- AC-22 / R-WEB-13: when a run's request settles, with 200 or with an error, the page requests `GET /api/usage` again.
- AC-23 / R-WEB-14: restore, delete and clear send no `GET /api/usage` request.
- AC-24 / R-WEB-15: while a run is pending, the footer keeps the totals it showed when the run started. There is no invalidation at start and no optimistic update.
- AC-34 / R-WEB-20: a window `focus` or a `visibilitychange` to visible refetches only the usage query. The global `refetchOnWindowFocus` default stays `false`.
- AC-31 / R-SRV-15: `README.md` says the server stores nothing on disk and keeps an in-memory usage tally that resets on restart. It also says the tally counts only usage reported for successful results and can be lower than the OpenRouter bill.
- AC-32 (web half) / R-WEB-21: the `CLAUDE.md` folder map lists `use-usage.ts`, `SessionFooter.tsx` and `usage-format.ts`.

## Out of scope

- Storing the tally on disk, in a database or in the browser. Also out: a Reset button or `POST /api/usage/reset` (P4), totals inside `RunResponse` (P5), an input/output split in the footer (P3), and a failed-call count in the footer (P6) — spec Non-goals.
- One tally per tab or client, pushing changes to the page, a retry button in the footer, a sticky footer, and announcing tally changes — spec Non-goals.
- Counting model calls from any feature other than `POST /api/runs` (EC-20).
- Any change to the OpenRouter adapter, `MockProvider`, `src/server/app.ts`, `src/server/index.ts` or `platform/`. Integer or overflow handling of reported token counts is also out (EC-13, EC-19, Q4).
- Any change to the History row's per-run total (G16), and to `history-storage.ts`, `use-history.ts`, `HistorySection.tsx`.
- A singular form "1 call without cost". The spec text is " (<N> calls without cost)".
- Changing the query client's `defaultOptions`, or turning on focus refetch for the models query.
- Refactoring the existing test helpers into a shared module. `App.usage.test.tsx` copies what it needs, as `App.history.test.tsx` does.
- Setting the spec's `Status:` to `done`. The main session does this after `sdd-engineering:plan-verifier`, not as a plan item.
- Any new dependency.

## Risks

- **Fractional or negative token counts from OpenRouter (F4/Q4, EC-19).** The adapter accepts any finite number (`src/server/adapters/openrouter/openrouter-provider.ts:31-33`). One such value makes the integer or non-negative check fail, so `GET /api/usage` answers 500 and the footer shows "unavailable" until a restart. → This is accepted with no handling. The AC-27 route test pins the 500 and the absence of the value.
- **AC-27 depends on library behaviour (R5).** It relies on `fastify-type-provider-zod` throwing `ResponseSerializationError` with statusCode 500 (`core.js:117-118`, `errors.js:5`) and on `app.ts:42-47` turning it into the generic message. → The phase 1 route test fails if either changes. `app.ts:46` logs the error, but Zod 4 issues carry no input value by default, so no tally value reaches the log (R-SRV-8).
- **Lost or doubled additions under concurrency.** → `totals` is read and written in one synchronous statement after `await Promise.all`, never captured before the `await`. The AC-6 route test and the service test release runs out of order.
- **Mutation held pending by the invalidation.** If `onSettled` returned the `invalidateQueries` promise, `run.isPending` would stay true until the usage refetch ends, which would also block Run. → The plan requires `void`, and a phase 3 regression test checks Run is re-enabled while the usage refetch is held.
- **TanStack clears `error` on a retry with no data** (`query.js:548-556`). That would flash "loading" after a failed first load. → `useUsage` derives `failed` with `errorUpdateCount > 0`, and the phase 3 Q3 test covers it.
- **`focusManager` is a module singleton.** → `setEventListener` replaces and cleans up the previous listener on each `createQueryClient()` call. Vitest isolates modules per test file. The listener is added without `capture`, so focusing an element (restore focuses the textarea) does not trigger it (AC-23).
- **Both focus events fire on one return to the window.** → Focus refetches use `cancelRefetch: false`, so the second reuses the in-flight request (`query.js:255,352-356`). A phase 3 test checks the count rises by exactly 1.
- **Locale-dependent strings in tests.** → Expectations are built with `formatTokenTotal`, `formatSessionStart` or `Intl.*` for a fixed locale, never machine-locale literals.
- **`contentinfo` role in jsdom.** A `<footer>` maps to `contentinfo` only outside sectioning elements. → The footer sits directly under `#root`, outside `<main>`. AC-13's test also checks document order and that it is not inside `main`.
- **`Cache-Control: no-store` also appears on a 500** (the header is set before serialization). → This is harmless: the spec asks for it on the 200 and forbids nothing on the 500.
- **Credits during manual checks.** → Manual steps never press Run. In this headless run they are all recorded as "manual check: skipped (headless run)".

## Open questions

Nothing.
