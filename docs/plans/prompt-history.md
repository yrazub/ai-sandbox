# Implementation Plan: Prompt history

**Goal:** Every run that returns 200 is kept in the browser's `localStorage`. The page lists past runs, can restore one (its prompt, models and result cards) with no request to the server, and can delete one run or clear them all. Runs keep working when storage is unavailable, full or holds invalid data. · **Packages:** `ai-sandbox` (`src/web` only) ·
**Spec:** `docs/specs/prompt-history.md`, SPEC-2026-11-02-prompt-history (umbrella and web module) · **Execution mode:** single-agent (the main session builds the code and tests of each phase, then runs `sdd-engineering:plan-verifier` at the end) ·
**Review answers:**
- Q1: Run stays disabled until the model list has loaded.
- Q2: Deleting the entry being shown keeps its cards and its "From history" line.
- Q3: The excerpt is the first non-blank line, trimmed. "…" is added only when that line is over 100 characters.
- Q4: Date and time use `toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })`. The failed count reads "N failed". Labels are joined with ", ".
- Q5: The AC-35 status is visually hidden, using a new `.visually-hidden` class.
- Q6: The AC-26 notice stays until the next run starts. When storage is unavailable, no per-run notice is shown.
- Q7: A restore resets the run mutation.
- Q8: The text stays "Delete all 1 runs?".
- Q9: Each entry is validated against the full `HistoryEntry` contract on read. Duplicate `id`s keep the newest. A read returns at most the newest 50.
- Q10: `npm test` passes under Node 26.13.0, so `test-setup.ts` does not change.
- R2–R6 accepted. R1 and R7 are not plan items.

· **Assumptions:**
- This uses the SDD plan template rather than the section layout of `docs/plans/base-app.md`, because `sdd-engineering:plan-verifier` reads these headings. The phases, `Verify` and `Done when` lines are kept as in base-app.
- The cedb6fc edits to `CLAUDE.md`, `README.md` and `src/web/test-setup.ts` are done. No phase edits them.

## Context read

| Document | What it settles for this plan |
|---|---|
| `CLAUDE.md` | Node 26 via `nvm use` (9-15); the commands `npm test`, `npm run typecheck`, `npm run build` (17-24); history files `hooks/use-history.ts` and `lib/history-storage.ts` (45-46); frontend import direction (77); no `fetch` in components and no server data copied into `useState` (78-80); the history rule (81-83); business rules are plain functions next to their component (84-85); plain-text output (86); tests next to the file, `fetch` blocked, jsdom header (96-101) |
| `docs/specs/prompt-history.md` | AC-1–AC-42, EC-1–EC-23, NFR-1–NFR-5; the `HistoryEntry` contract and the key `ai-sandbox:history:v1` (211-224); R-WEB-1–R-WEB-40 (228-269); Data access (273-276); Layout (278-308); Test hints (318-326). R-WEB-29 traces to AC-31 and R-WEB-38 to AC-40 |
| `docs/specs/README.md` | Every criterion needs a test or a manual check (28) |
| `docs/plans/base-app.md` | Base AC-14, Run disabled when the list fails (78), kept true by Q1; D-7, plain text (219); no lint or dependency-cruiser, so no architecture-check command (30) |
| `src/web/App.tsx` | Prompt and selection state (9-10); `canRun` (14); the run, error and grid rendering (25, 38-46) |
| `src/web/components/ResultsGrid.tsx`, `ResultCard.tsx` | The grid looks labels up from `ModelInfo[]` (7, 13); the card renders plain text, `n/a`, and error cards with `role="alert"` (24, 37, 42) |
| `src/web/components/PromptForm.tsx` | The textarea `#prompt` has no ref (23-29) |
| `src/web/components/ModelPicker.tsx` | Loading or failed states hide the selection (26-36); a chip falls back to the ID (56) |
| `src/web/components/result-format.ts` | `formatCost`, reused for AC-40 (6-11) |
| `src/web/hooks/use-run-models.ts`, `lib/api-client.ts` | The mutation and the error cases that make AC-3 fail the mutation (17-27) |
| `src/shared/contracts.ts` | `RunRequest.shape.prompt`, `RunResult`, `MAX_PROMPT_CHARS`, `MAX_MODELS_PER_RUN` (4-5, 20-50) — reused, not changed |
| `src/web/App.test.tsx` | The test style to copy (`stubFetch`, `renderApp`, `pick`); none of its expectations change |
| `src/web/test-setup.ts` | Already clears `localStorage` before each test (8) |
| `src/web/styles.css` | The tokens and classes the Layout reuses (`.model-list`, `.chip button`, `.empty`, `.meta`, `.results`, the `@media (max-width: 40rem)` block) |
| `vite.config.ts` | The default test environment is node; jsdom is opt-in per file (11-13) |
| skills `frontend-ui-architecture`, `react-best-practices`, `zod`, `security` | The rule IDs used in the file tables |

## Constraints

- **Architecture:** The server and the shared contracts do not change. `HistoryEntry` is browser-only and lives in `src/web/lib/history-storage.ts` — spec lines 173, 206-213; `CLAUDE.md:56-57`.
- **Architecture:** Only `src/web/lib/history-storage.ts` touches `localStorage`. Components get history only through `src/web/hooks/use-history.ts` — `CLAUDE.md:81-83`.
- **Architecture:** Imports go `lib` and plain helpers ← `hooks` ← `components` ← `App.tsx`. `src/web` imports `src/shared`, never `src/server` — `CLAUDE.md:73,77`.
- **Architecture:** Business rules (excerpt, total cost, restore selection) are plain functions next to their component, unit-tested without React — `CLAUDE.md:84-85`.
- **Architecture:** Stored text is always rendered as JSX text, never HTML or Markdown — `CLAUDE.md:86`; spec NFR-4.
- **Architecture:** `App.tsx` only composes. Restore logic beyond setting state lives in `history-restore.ts` — `CLAUDE.md:43`.
- **Architecture:** No new hook files beyond `use-history.ts`, because the folder map lists the hooks explicitly — `CLAUDE.md:45`.
- **Architecture:** The project has no architecture-check command, so the `Verify` lines hold only typecheck, test and build — `docs/plans/base-app.md:30`; `package.json:9-14`.
- **Environment:** Run `source ~/.nvm/nvm.sh && nvm use` once per shell before any `Verify` command — `CLAUDE.md:9-15`.
- **Testing:** Component tests start with `// @vitest-environment jsdom` and stub `fetch`. Storage failures are tested with `vi.spyOn(Storage.prototype, …)` and `afterEach(() => vi.restoreAllMocks())`, never a real quota — `CLAUDE.md:97-101`; spec lines 320-322.
- **Testing:** Node-environment tests print an `ExperimentalWarning` about `localStorage`. This is expected and harmless (Q10).
- **Project notes:** No notes file exists in the repository. Nothing to carry.
- **Do not touch:**
  - `src/server/**`, `src/shared/contracts.ts`
  - `.env`
  - `package.json`, `package-lock.json` (no new dependency)
  - `CLAUDE.md`, `README.md`, `src/web/test-setup.ts` (already done in cedb6fc)
  - `docs/specs/prompt-history.md`
  - `src/web/App.test.tsx` (no expectation changes)

## Phases

### 1 · History storage and row helpers — ai-sandbox (`src/web`)

This phase delivers the storage module that holds all `localStorage` access and validation of untrusted data, plus the plain row helpers. Everything is unit-tested in the node environment against an in-memory `Storage`. It comes first because every later phase reads and writes through it, and the riskiest part — validating untrusted data — is tested here.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `src/web/lib/history-storage.ts` (new) | Exports `HISTORY_KEY = 'ai-sandbox:history:v1'`, `MAX_HISTORY_ENTRIES = 50`, the schemas `HistoryModel` and `HistoryEntry` with types of the same names (contract below), `type HistoryRead = { status: 'available'; entries: HistoryEntry[] } \| { status: 'unavailable' }`, `type SaveOutcome = 'saved' \| 'not-saved' \| 'unavailable'`, and the functions below. A private `isQuotaError(e)` is true for a `DOMException` named `QuotaExceededError` or `NS_ERROR_DOM_QUOTA_REACHED`. No `fetch` | engineering-paved-path:zod, engineering-paved-path:typescript-expert, engineering-paved-path:security, engineering-paved-path:frontend-ui-architecture | zod `parse-never-trust-json`, `parse-use-safeparse`, `place-schema-type-name` (`CLAUDE.md:92`); `CLAUDE.md:81-83`; `logic-pure-domain`; security A05 (stored text is data only) |
| `src/web/components/history-format.ts` (new) | Plain functions, see the list below | engineering-paved-path:frontend-ui-architecture, engineering-paved-path:typescript-expert | `logic-pure-domain`, `place-helper-not-hook`, `CLAUDE.md:84-85` |

**`history-storage.ts` — the functions.** Each takes `getStorage: () => Storage = browserStorage`.
- **`browserStorage()`** returns `window.localStorage`. Getting it may throw.
- **`readHistory(getStorage?)`** never throws. A throwing get or `getItem` gives `unavailable`. A value that is missing, not JSON or not an array gives `available` with `[]`. Otherwise it:
  - keeps only the elements that pass `HistoryEntry.safeParse`;
  - sorts by `Date.parse(createdAt)`, newest first;
  - drops later duplicates of an `id`;
  - keeps the first 50.
- **`saveEntry(entry, getStorage?)`** returns a `SaveOutcome`. It:
  1. re-reads the key with `readHistory` just before writing (an unreadable value counts as `[]`);
  2. builds `[entry, ...entries]`, de-duplicated and cut to 50;
  3. writes it as JSON;
  4. on a quota error, drops the oldest entry that is not `entry` and writes again, until the write succeeds (`saved`) or only `entry` is left and still fails (`not-saved`).

  Any other throw gives `unavailable`.
- **`deleteEntry(id, getStorage?)`** re-reads, removes that `id` and writes. It returns `saved` or `unavailable`.
- **`clearHistory(getStorage?)`** writes `[]` and returns `saved` or `unavailable`.
- **`buildHistoryEntry({ request, results, models, id?, createdAt? })`**:
  - `models` is `ModelInfo[] | undefined`;
  - each label comes from `models`, falling back to the model ID when the label is missing or empty;
  - `id` defaults to `crypto.randomUUID()`;
  - `createdAt` defaults to `new Date().toISOString()`.

**`history-format.ts` — the functions:**
- `formatRunTime(iso: string): string` — `new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })`.
- `promptExcerpt(prompt: string): string` — the first line that is not blank, trimmed. If it is over 100 characters (counted by code point, `Array.from`), it becomes its first 100 characters + "…".
- `failedCount(results: RunResult[]): number` — the number of `status: 'error'` results.
- `totalCost(results: RunResult[]): number | null` — the OQ-2 rule. It sums `costUsd` of the `ok` results. It returns `null` if no result is `ok` or any `ok` result has `costUsd: null`. Error results add nothing.
- `formatModelLabels(models: { label: string }[]): string` — the labels joined with ", ".

Contract the code must match (spec lines 215-224):
```ts
export const HistoryModel = z.object({ id: z.string().min(1), label: z.string().min(1) });
export const HistoryEntry = z
  .object({
    id: z.string().min(1),
    createdAt: z.iso.datetime(),
    prompt: RunRequest.shape.prompt,            // not blank, ≤ MAX_PROMPT_CHARS
    models: z.array(HistoryModel).min(1).max(MAX_MODELS_PER_RUN)
      .refine((m) => new Set(m.map((x) => x.id)).size === m.length, 'model ids must be unique'),
    results: z.array(RunResult),
  })
  .refine((e) => e.results.length === e.models.length
    && e.results.every((r, i) => r.modelId === e.models[i]!.id), 'results must match models in order');
```

**Tests:**
- Add `src/web/lib/history-storage.test.ts`. It runs in the node environment, with an in-memory `Storage` fake built in the test file and passed as `getStorage`. Cases:
  - a missing key reads as `available` with `[]`;
  - a valid stored array reads back newest first by `createdAt`, even when stored out of order;
  - each invalid entry is left out while the valid ones stay: blank prompt, a 20,001-character prompt, 0 models, 7 models, duplicate model ids, a result with no `status`, results in a different order than models, a result count that differs from the model count, a `createdAt` that is not ISO, an empty `id`;
  - a duplicate `id` keeps the newest;
  - 60 valid stored entries read as the newest 50;
  - `"not json"`, `{}` and `42` read as `available` with `[]`, without throwing;
  - `getItem` or the `getStorage` getter throwing reads as `unavailable`;
  - saving into 50 entries leaves 50 entries with the oldest gone;
  - saving after an unparsable value writes an array holding only the new entry;
  - saving keeps an entry another writer added to the key after this instance's last read;
  - `setItem` throwing `QuotaExceededError` twice, then succeeding, gives `saved` with the two oldest gone;
  - `setItem` always throwing `QuotaExceededError` gives `not-saved` and leaves the stored value unchanged;
  - `setItem` throwing a non-quota error gives `unavailable`;
  - `deleteEntry` removes only that `id` and keeps an entry another writer added;
  - `clearHistory` writes `[]`;
  - `buildHistoryEntry` keeps the request's prompt, models in request order with labels from the list, falls back to the ID for a model missing from the list or when the list is `undefined`, copies `results` unchanged (including error results), and makes an entry that passes `HistoryEntry`.
- Add `src/web/components/history-format.test.ts`. Cases:
  - `promptExcerpt`: a short line is returned as is; a 101-character line becomes 100 characters + "…"; a 100-character line gets no "…"; a multi-line prompt with a short first line gets no "…"; leading blank lines and spaces are skipped;
  - `failedCount` counts error results;
  - `totalCost`: all `ok` results are summed; an error result adds nothing; any `ok` with `costUsd: null` gives `null`; all errors give `null`; a free model (`0`) sums to `0`;
  - `formatModelLabels` joins with ", ";
  - `formatRunTime` equals `new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })` for a fixed ISO string.
- Expected to change: none.

**Verify (code):** `npm run typecheck` · `npm test`
**Verify (phase):** `npm run typecheck && npm test`
**Done when:**
- AC-24 / R-WEB-22: saving into a full history of 50 leaves exactly 50, with the oldest dropped.
- AC-25 / R-WEB-23: on a quota error the store drops the oldest entries one at a time until the new entry is saved.
- AC-26 (storage half) / R-WEB-24: when only the new entry is left and the write still fails, the store reports `not-saved` and the stored value is unchanged.
- AC-27 / R-WEB-25: entries that break the `HistoryEntry` contract are left out and the valid ones are returned (Q9).
- AC-28 (unit half) / R-WEB-26: a value that is not JSON or not an array reads as an empty history without throwing.
- AC-29 / R-WEB-27: a save after an unparsable read writes a fresh array holding the new entry.
- AC-37 / R-WEB-35: a save re-reads the key and keeps entries another tab saved.
- AC-22 and AC-23 (storage half) / R-WEB-20: a throwing storage is reported as `unavailable`, and no storage function throws.
- AC-7 (unit half) / R-WEB-6: the excerpt, date-time and failed-count helpers follow Q3 and Q4.
- AC-40 / R-WEB-38: `totalCost` follows the OQ-2 rule.
- Groundwork for AC-1 and AC-2 / R-WEB-1: `buildHistoryEntry` keeps the prompt, the ordered models with labels (ID fallback) and every result, including errors.
- Groundwork for AC-19 / R-WEB-17 and AC-39 / R-WEB-37: `clearHistory` writes `[]` and `deleteEntry` removes one `id`.

### 2 · Recording and the History list — ai-sandbox (`src/web`)

This phase records every run that returns 200 and shows the History section: heading, rows, empty state, unavailable state and the "could not be saved" notice. Rows are not interactive yet. It comes after phase 1 because it only wires the tested store into React, and it adds nothing that restore needs to change.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `src/web/hooks/use-history.ts` (new) | `useHistory()` returns `{ history: HistoryRead; saveFailed: boolean; record(entry: HistoryEntry): void; resetSaveFailed(): void }`. The `history` state starts from `readHistory()` in a lazy `useState` initialiser, so the key is read on mount. `record` calls `saveEntry` and then: on `saved`, re-reads and sets `saveFailed` to false; on `not-saved`, re-reads and sets `saveFailed` to true; on `unavailable`, sets the state to `{ status: 'unavailable' }` and leaves `saveFailed` false (Q6). No `fetch` | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture | `logic-hooks-wire`, `logic-no-effect-derivation`, `CLAUDE.md:81-83` |
| `src/web/hooks/use-run-models.ts` | Becomes `useRunModels(options?: { onSuccess?: (results: RunResult[], request: RunRequest) => void })` and passes `onSuccess` to `useMutation`. It fires once per successful mutation, in strict mode too | engineering-paved-path:react-best-practices | `logic-hooks-wire`; react-best-practices "NEVER use useEffect for event handling" |
| `src/web/components/HistorySection.tsx` (new) | Props: `history: HistoryRead`, `saveFailed: boolean`. Renders `<section className="history" aria-labelledby="history-heading">`. See the structure below. All stored text is JSX text | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture, engineering-paved-path:security | `split-one-per-file`, `split-pure`, `CLAUDE.md:78-79,86`; security A05 |
| `src/web/App.tsx` | See the changes below | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture | `struct-one-way`, `CLAUDE.md:43,77-80` |
| `src/web/styles.css` | Styles for the History section, see below | — | spec Layout, lines 283-308 |

**`HistorySection.tsx` structure, top to bottom:**
1. A `.history-head` flex row holding `<h2 id="history-heading">History (N)</h2>`. N is the entry count, 0 when unavailable.
2. When `saveFailed` is true: `<p role="status" className="meta history-notice">This run could not be saved to history</p>`.
3. One of three states:
   - unavailable: `<p className="empty">History is unavailable in this browser</p>`;
   - no entries: `<p className="empty">No runs yet</p>`;
   - otherwise: `<ul className="history-list" aria-label="History">`, with one `<li className="history-row" key={entry.id}>` per entry in `history.entries` order.

   Each row holds, in this order:
   - `<time className="history-time" dateTime={createdAt}>{formatRunTime}</time>`;
   - `<span className="history-excerpt">{promptExcerpt}</span>`;
   - `<span className="history-meta">`, holding the `formatModelLabels(entry.models)` text, then `<span className="history-failed">{n} failed</span>` only when `failedCount > 0`, then `formatCost(totalCost(results))`.

**`App.tsx` changes:**
- Call `const history = useHistory()`.
- Pass `onSuccess: (results, request) => history.record(buildHistoryEntry({ request, results, models: models.data }))` to `useRunModels`.
- `onRun` calls `history.resetSaveFailed()` before `run.mutate(...)`.
- Render `<HistorySection history={history.history} saveFailed={history.saveFailed} />` last in `<main>`, after the results grid.

**`styles.css` additions:**
- `.history`: `margin-top: 1.5rem`.
- `.history-head`: flex, `align-items: baseline`, `justify-content: space-between`, `gap: 0.5rem`, `flex-wrap: wrap`.
- `.history-head h2`: `margin: 0`, `font-size: 1rem`, `font-weight: 600`.
- `.history-list`: `margin: 0`, `padding: 0`, `list-style: none`, `max-height: 16rem`, `overflow-y: auto`, `border: 1px solid var(--border)`, `border-radius: 6px`.
- `.history-row`: flex, `align-items: baseline`, `gap: 0.5rem`, `padding: 0.375rem 0.75rem`; on hover, `background: var(--surface)`.
- `.history-time`: muted, `0.875rem`, `white-space: nowrap`.
- `.history-excerpt`: `flex: 1`, `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`.
- `.history-meta`: muted, `0.875rem`.
- `.history-failed`: `color: var(--danger)`.
- `.history-notice`: `margin: 0.5rem 0`.
- Inside `@media (max-width: 40rem)`: `.history-row { flex-wrap: wrap }`.

**Tests:**
- Add `src/web/App.history.test.tsx`. It starts with `// @vitest-environment jsdom` and copies the `MODELS`, `ok()`, `stubFetch`, `renderApp` and `pick` helpers from `src/web/App.test.tsx`. It has `afterEach(() => { cleanup(); vi.restoreAllMocks(); })`. Cases:
  - **AC-1:** after a run returns 200, `localStorage[HISTORY_KEY]` holds one entry with the prompt, the models in selected order with their live labels, the results, and an ISO `createdAt`.
  - **AC-2:** a run with one error result stores both results.
  - **AC-3:** a 400, a 500, a 200 with body `{}` and an unreachable server each leave the key empty and the section showing "No runs yet".
  - **AC-4:** two runs give exactly two entries. The same flow rendered inside `<StrictMode>` gives one entry per run.
  - **AC-5:** seeding the key with two entries before render lists both rows.
  - **AC-6:** entries seeded out of order are listed newest first.
  - **AC-7:** a row shows `formatRunTime(createdAt)`, the excerpt of a 120-character first line ending in "…", the stored labels joined with ", ", and "1 failed" for an entry with one error.
  - **AC-40:** a row shows the summed cost, and `n/a` when an `ok` result has `costUsd: null`.
  - **AC-8:** an empty history shows "No runs yet" and no button named "Clear history".
  - **AC-41:** the heading reads "History (2)" with two entries.
  - **AC-22:** with `Storage.prototype.getItem` throwing, the section shows "History is unavailable in this browser" and no list named "History".
  - **AC-23:** with `getItem` and `setItem` throwing a plain `Error`, a run still shows its result cards and no uncaught error is raised.
  - **AC-26 / Q6:** with `setItem` always throwing `new DOMException('full', 'QuotaExceededError')`:
    - a run shows "This run could not be saved to history" and keeps its cards;
    - the notice is gone once the next run starts;
    - with storage unavailable, no such notice appears.
  - **AC-28:** the key holding `"not json"` shows "No runs yet" and no `alert`.
  - **AC-33 (rows):** a seeded entry whose stored label differs from the live list shows the stored label. With `/api/models` failing, the rows still show the stored labels.
- Expected to change: none.

**Verify (code):** `npm run typecheck` · `npm test`
**Verify (phase):** `npm run typecheck && npm test && npm run build`
**Verify (manual, screenshots):** Run by the `sdd-engineering:run-plan` sub-agent on the user's running `npm run dev`. It never starts the stack and never presses Run, so no credits are spent. It uses one tab and closes it at the end.
1. Open `http://localhost:5173`. Run `localStorage.setItem('ai-sandbox:history:v1', '<fixture>')` in the console with the fixture below, then reload. Screenshot: two rows, newest first; the first row's excerpt ends in "…"; "1 failed" in the danger colour; "History (2)" heading (AC-5 manual, AC-7, AC-41).
2. Compare against the spec's `## Layout` (lines 283-308). There is no design screen. Check:
   - the section sits below the results area with a 1.5rem top margin;
   - the panel has a 1px `var(--border)` border, 6px radius and 16rem max height;
   - rows have 0.375rem × 0.75rem padding and a 0.5rem gap;
   - the date is muted, 0.875rem and does not wrap;
   - the excerpt is a single line with an ellipsis.
3. Run `localStorage.setItem('ai-sandbox:history:v1', 'not json')`, reload, and screenshot "No runs yet" (AC-28).
4. Check the console for React warnings.

The fixture:
`[{"id":"m1","createdAt":"2026-11-02T10:15:00.000Z","prompt":"Explain the difference between TCP and UDP in plain words for someone who has never written network code before, with examples\nsecond line","models":[{"id":"a/x","label":"A: X"},{"id":"b/y","label":"B: Y"}],"results":[{"status":"ok","modelId":"a/x","output":"<b>not bold</b> answer","latencyMs":2100,"inputTokens":12,"outputTokens":40,"costUsd":0.0021},{"status":"error","modelId":"b/y","error":"Timed out after 60 s","latencyMs":60000}]},{"id":"m2","createdAt":"2026-11-01T09:00:00.000Z","prompt":"Short prompt","models":[{"id":"a/x","label":"A: X"}],"results":[{"status":"ok","modelId":"a/x","output":"hi","latencyMs":900,"inputTokens":3,"outputTokens":2,"costUsd":null}]}]`

**Done when:**
- AC-1 / R-WEB-1: a run that returns 200 adds one entry holding the prompt, the ordered models with labels, every result and the response time.
- AC-2 / R-WEB-1: error results are stored next to successful ones.
- AC-3 / R-WEB-2: a failed request (4xx, 5xx, unexpected body, unreachable) adds no entry.
- AC-4 / R-WEB-3: exactly one entry per successful run, including under `<StrictMode>`.
- AC-5 / R-WEB-4: entries in the key before render are listed on mount.
- AC-6 / R-WEB-5: rows are listed newest first by `createdAt`.
- AC-7 / R-WEB-6: each row shows the local date and time, the excerpt, the stored labels and, when any model failed, "N failed".
- AC-8 / R-WEB-7: an empty history shows "No runs yet" and no "Clear history" control.
- AC-22 / R-WEB-20: storage that throws shows "History is unavailable in this browser" and no list.
- AC-23 / R-WEB-21: with throwing storage, runs still show their cards and no uncaught error is raised.
- AC-26 / R-WEB-24: a save that fails on quota shows "This run could not be saved to history" as a status and keeps the cards. The notice clears when the next run starts (Q6).
- AC-28 / R-WEB-26: an unparsable key shows the empty state without an error.
- AC-33 / R-WEB-31 (rows): rows name models by the stored label, including when the model list has failed.
- AC-40 / R-WEB-38: each row shows the run's total cost by the OQ-2 rule.
- AC-41 / R-WEB-39: the heading reads "History (N)".

### 3 · Restore a past run — ai-sandbox (`src/web`)

This phase turns each row into a restore button. A restore fills the prompt, the selection and the results grid from the entry with no request, and adds the restored line, the notices, focus and the announcement. It comes after the list exists and before delete and clear, because the restored view is what AC-21 and Q2 must keep.

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `src/web/components/history-restore.ts` (new) | `restoreSelection(stored: HistoryModel[], live: ModelInfo[] \| undefined): { selectedIds: string[]; leftOut: HistoryModel[] }`. When `live` is `undefined`, every stored ID in stored order and `leftOut: []`. Otherwise the stored IDs present in `live`, in stored order, and `leftOut` = the stored models missing from `live` | engineering-paved-path:frontend-ui-architecture, engineering-paved-path:typescript-expert | `logic-pure-domain`, `CLAUDE.md:84-85` |
| `src/web/components/ResultsGrid.tsx` | Props become `{ models: { id: string; label: string }[]; results: RunResult[] \| undefined }`. `models` is in run order and supplies each card's label. It no longer looks labels up from `ModelInfo[]`. `ResultCard` is unchanged | engineering-paved-path:react-best-practices | `split-pure`, `CLAUDE.md:86` |
| `src/web/components/PromptForm.tsx` | New optional prop `textareaRef?: Ref<HTMLTextAreaElement>`, set as the `ref` of `<textarea id="prompt">` | engineering-paved-path:react-best-practices | React 19 ref-as-prop |
| `src/web/components/HistorySection.tsx` | New props `disabled: boolean`, `currentId: string \| undefined`, `onRestore: (entry: HistoryEntry) => void`. Changes below | engineering-paved-path:react-best-practices, engineering-paved-path:security | `split-pure`, react-best-practices Accessibility; security A05 |
| `src/web/App.tsx` | Changes below | engineering-paved-path:react-best-practices, engineering-paved-path:frontend-ui-architecture | `logic-no-server-state-copy` (the restored entry is browser data, spec lines 275-276), `logic-no-effect-derivation`, `CLAUDE.md:43,78-80` |
| `src/web/styles.css` | Changes below | — | spec Layout, lines 293-306 |

**`HistorySection.tsx` changes:**
- Each `<li className="history-row">` wraps the time, excerpt and meta spans in `<button type="button" className="history-restore" aria-label={`Restore: ${promptExcerpt(entry.prompt)}`} disabled={disabled} onClick={() => onRestore(entry)}>`.
- When `entry.id === currentId`, the button gets `aria-current="true"` and the `<li>` gets the class `history-row-current`.

**`App.tsx` changes:**
- New state: `restored: HistoryEntry | null` (the entry itself, not its `id`, so that clear and delete keep the cards) and `leftOut: HistoryModel[]`.
- New `textareaRef`.
- `handleRestore(entry)`:
  1. calls `setPrompt(entry.prompt)`;
  2. calls `restoreSelection(entry.models, models.data)`, then sets `selectedIds` and `leftOut` from the result;
  3. calls `setRestored(entry)`;
  4. calls `run.reset()` (Q7);
  5. calls `textareaRef.current?.focus()`.
- `onRun` calls `setRestored(null)` and `setLeftOut([])` before the mutation.
- `canRun` also requires `models.data !== undefined` (Q1).
- When `leftOut.length > 0`, render `<p role="status" className="meta history-notice">Not available any more: {formatModelLabels(leftOut)}</p>` right after `<ModelPicker>` inside `<PromptForm>`.
- Always render `<p role="status" className="visually-hidden">`. It holds `Restored run from {formatRunTime(restored.createdAt)}` while `restored` is set, and is empty otherwise.
- When `restored` is set, render `<p className="meta restored-line">From history · {formatRunTime(restored.createdAt)}</p>` followed by `<ResultsGrid models={restored.models} results={restored.results} />`.
- Otherwise keep the live condition `run.variables && models.data && (run.isPending || run.data)`, with `models` = `run.variables.modelIds` mapped to `{ id, label }` from `models.data` (label falls back to the ID).
- Pass `disabled={run.isPending}`, `currentId={restored?.id}` and `onRestore={handleRestore}` to `HistorySection`.

**`styles.css` additions:**
- `.visually-hidden`: the standard clip pattern — `position: absolute`, `width: 1px`, `height: 1px`, `margin: -1px`, `overflow: hidden`, `clip: rect(0 0 0 0)`, `white-space: nowrap`, `border: 0`.
- `.history-restore`: resets button styles (no border, no background, `color: inherit`, `text-align: left`, `padding: 0`) and is itself a flex row with `flex: 1`, `min-width: 0`, `align-items: baseline`, `gap: 0.5rem`.
- `.history-row-current`: `background: var(--surface)`.
- `.restored-line`: `margin-top: 1.5rem`.
- `.restored-line + .results`: `margin-top: 0.5rem`.
- Inside `@media (max-width: 40rem)`: `.history-restore { flex-wrap: wrap }`.

**Tests:**
- Add `src/web/components/history-restore.test.ts`. Cases:
  - with the list loaded, all present means all selected in stored order;
  - one missing model is left out of `selectedIds` and listed in `leftOut` with its stored label;
  - `live` `undefined` keeps every stored ID with `leftOut` empty.
- Add to `src/web/App.history.test.tsx`. Each seeds the key, renders, waits for the list unless stated, and restores with `getByRole('button', { name: 'Restore: <excerpt>' })`. Cases:
  - **AC-9:** each row is a button named "Restore: <excerpt>" inside the list named "History", and Enter on the focused button restores.
  - **AC-10:** the Prompt box holds the full multi-line prompt.
  - **AC-11:** the chips list "Selected models" shows the entry's models in the entry's order.
  - **AC-12:** the Results region shows one article per stored model in entry order, with stored answers.
  - **AC-13 (restore):** `fetch` call count is unchanged by the restore.
  - **AC-14:** the text "From history · <formatRunTime>" is shown.
  - **AC-15:** a stored output `<img src=x onerror="alert(1)"><b>bold</b>` renders as text with no `img` or `b` element; `costUsd: null` shows `n/a`; an error result shows an error card with its message.
  - **AC-16:** restore, then Run with a never-resolving `/api/runs`: the restored cards and the "From history" line are gone and pending cards are shown.
  - **AC-17 (restore):** while a run is pending, every "Restore: …" button is disabled.
  - **AC-30 + AC-31:** an entry with a model not in `MODELS` leaves that checkbox absent and the other models selected, and shows "Not available any more: <stored label>". Its stored card still shows. The notice is gone after restoring another entry and after starting a run.
  - **AC-32:** with `/api/models` failing first, restore, then Retry. After the list loads, the chips hold every stored model ID.
  - **Q1:** after that restore, while the list has failed, the Run button is disabled.
  - **AC-33 (cards):** with `/api/models` failing, the restored articles are named by the stored labels.
  - **AC-34:** after restore the Prompt textarea has focus.
  - **AC-35:** the text "Restored run from <formatRunTime>" is in a `role="status"` element.
  - **AC-42:** the restored row's button has `aria-current="true"` and no other row's does.
  - **Q7:** after a failed run ("Run failed: …"), restore hides the alert.
- Expected to change: none. `ResultsGrid` is used only by `App.tsx`. The existing `App.test.tsx` flows load the list before Run, so the `canRun` change does not affect them.

**Verify (code):** `npm run typecheck` · `npm test`
**Verify (phase):** `npm run typecheck && npm test && npm run build`
**Verify (manual, screenshots):** Run by the `sdd-engineering:run-plan` sub-agent on the user's running stack. Never press Run. One tab, closed at the end.
1. On `http://localhost:5173`, seed the phase 2 fixture and reload. Wait for the model list.
2. Click "Restore: Explain the difference…". Screenshot:
   - the prompt holds both lines and has focus;
   - "Not available any more: A: X, B: Y" sits below the model picker, muted, not red;
   - "From history · <date>" is a muted 0.875rem line directly above the cards;
   - two cards, the first showing `<b>not bold</b> answer` as literal text, the second an error card;
   - the restored row has the `var(--surface)` background.

   (AC-10, AC-12, AC-14, AC-15, AC-31, AC-34, AC-42; Layout lines 293-306.)
3. Check the console for React warnings.

**Done when:**
- AC-9 / R-WEB-8: each row is a keyboard-operable `<button>` named "Restore: <excerpt>" in a list named "History".
- AC-10 / R-WEB-9: a restore puts the entry's full prompt in the Prompt box.
- AC-11 / R-WEB-10: a restore selects the entry's models in the entry's order.
- AC-12 / R-WEB-11: a restore shows one stored card per model in entry order, using `ResultCard`.
- AC-13 / R-WEB-12 (restore): a restore sends no request.
- AC-14 / R-WEB-13: a restored view shows "From history · <date and time>" above the cards.
- AC-15 / R-WEB-11: restored cards render plain text, `n/a` for a missing cost, and error cards, the same as live cards.
- AC-16 / R-WEB-14: starting a run replaces the restored cards with the new run's pending cards.
- AC-17 / R-WEB-15 (restore): restore buttons are disabled while a run is pending.
- AC-30 / R-WEB-28: with the list loaded, a stored model missing from it is left unselected.
- AC-31 / R-WEB-29: a notice names each model left out, until the next restore or run (OQ-3).
- AC-32 / R-WEB-30: a restore while the list is loading or failed keeps every stored model selected, and Run stays disabled until the list loads (Q1, base AC-14).
- AC-33 / R-WEB-31 (cards): restored cards are named by the stored labels, including when the list has failed.
- AC-34 / R-WEB-32: a restore moves focus to the Prompt textarea.
- AC-35 / R-WEB-33: a restore announces "Restored run from <date and time>" in a `role="status"` element.
- AC-42 / R-WEB-40: the row of the shown entry carries `aria-current="true"` and the highlighted background.

### 4 · Delete, clear and other tabs — ai-sandbox (`src/web`)

This phase adds per-row delete, "Clear history" with its confirmation, and live updates when another tab changes the key. It comes last because it removes entries and must leave the restored view from phase 3 untouched (AC-21, Q2).

| File | Change | Skills | Rules to respect |
|---|---|---|---|
| `src/web/hooks/use-history.ts` | Adds three things. `remove(id: string): void` calls `deleteEntry` then re-reads, or sets `unavailable` if it fails. `clear(): void` calls `clearHistory` then re-reads, or sets `unavailable` if it fails. A `useEffect` adds a `window` `storage` listener: when `event.key === HISTORY_KEY \|\| event.key === null`, it sets the state to `readHistory()`. The effect removes the listener on cleanup | engineering-paved-path:react-best-practices | react-best-practices "ALWAYS clean up subscriptions"; `logic-hooks-wire`; `CLAUDE.md:81-83` |
| `src/web/components/HistorySection.tsx` | New props `onDelete: (id: string) => void` and `onClear: () => void`, plus local UI state `confirming: boolean`. Changes below | engineering-paved-path:react-best-practices | `split-pure`, react-best-practices Accessibility (`aria-label` on the icon-only button) |
| `src/web/App.tsx` | Passes `onDelete={history.remove}` and `onClear={history.clear}` to `HistorySection`. Clear and delete do not touch `restored`, so the restored cards and line stay (AC-21, Q2) | engineering-paved-path:react-best-practices | `CLAUDE.md:43` |
| `src/web/styles.css` | Changes below | — | spec Layout, lines 287-299, 307-308 |

**`HistorySection.tsx` changes:**
- When the history is `available` with at least one entry, the heading row shows `<button type="button">Clear history</button>`, disabled while `disabled`.
- While `confirming`, the heading row instead shows `<span>Delete all {N} runs?</span>`, then `<button>Clear</button>` and `<button>Cancel</button>`:
  - "Clear" is disabled while `disabled`, calls `onClear()` and ends confirming;
  - "Cancel" stays enabled and ends confirming.
- Each row gets a sibling after the restore button: `<button type="button" className="history-delete" aria-label={`Delete run: ${excerpt}`} disabled={disabled} onClick={() => onDelete(entry.id)}>×</button>`.
- Empty and unavailable states show no Clear control.

**`styles.css` additions:**
- `.history-delete`: the same as `.chip button` — no border, no background, `color: var(--muted)`, `font-size: 1.25rem`, `line-height: 1`.
- `.history-confirm`: inline flex, `gap: 0.5rem`, `align-items: baseline`, `flex-wrap: wrap`.
- Inside `@media (max-width: 40rem)`: the `.history-head` wrap puts the confirmation below the heading.

**Tests:**
- Add to `src/web/App.history.test.tsx`. Cases:
  - **AC-18:** with 3 seeded entries, "Clear history" shows "Delete all 3 runs?" with "Clear" and "Cancel", and the key still holds 3.
  - **Q8:** with 1 entry, it shows "Delete all 1 runs?".
  - **AC-19:** "Clear" leaves the key holding `[]`. A fresh render after `cleanup()` shows "No runs yet" and no "Clear history".
  - **AC-20:** "Cancel" keeps all 3 rows and the key, and shows "Clear history" again.
  - **AC-21:** clearing while restored cards are shown keeps the cards and the "From history" line.
  - **AC-13 (delete, clear):** `fetch` call count is unchanged by a delete and by a clear.
  - **AC-17 (delete, clear):** while a run is pending, every "Delete run: …" button, "Clear history", and the confirmation's "Clear" are disabled, while "Cancel" is enabled.
  - **AC-39:** "Delete run: <excerpt>" removes that row and keeps the others, with no confirmation, and the key no longer holds that `id`.
  - **Q2:** deleting the restored entry keeps its cards and "From history" line.
  - **AC-38:** after writing a new entry straight to `localStorage` and dispatching `new StorageEvent('storage', { key: HISTORY_KEY })` inside `act`, the new row appears. The same holds with `key: null` after `localStorage.clear()`, which shows "No runs yet".
- Expected to change: none.

**Verify (code):** `npm run typecheck` · `npm test`
**Verify (phase):** `npm run typecheck && npm test && npm run build`
**Verify (manual, screenshots):** Run by the `sdd-engineering:run-plan` sub-agent on the user's running stack. Never press Run. One tab, closed at the end.
1. On `http://localhost:5173`, seed the phase 2 fixture and reload.
2. Screenshot the heading row: "History (2)" on the left and "Clear history" on the right, in the default button style. The "×" delete buttons are muted and 1.25rem (Layout lines 287-299).
3. Click "Clear history". Screenshot "Delete all 2 runs?" with "Clear" and "Cancel". Click "Cancel" (AC-18, AC-20).
4. Resize the viewport to 375px wide, which is under 40rem. Screenshot it and confirm that `document.documentElement.scrollWidth <= window.innerWidth`, that rows wrap, and that the confirmation wraps below the heading (AC-36, R-WEB-34, Layout line 307-308).
5. Click "Clear" in the confirmation, reload, and screenshot "No runs yet" (AC-19, AC-5 manual).
6. Check the console for React warnings.

**Done when:**
- AC-17 / R-WEB-15 (delete, clear): delete, "Clear history" and the confirmation's "Clear" are disabled while a run is pending.
- AC-18 / R-WEB-16: "Clear history" shows "Delete all N runs?" with "Clear" and "Cancel" and deletes nothing yet.
- AC-19 / R-WEB-17: "Clear" writes an empty history, so a reload shows "No runs yet".
- AC-20 / R-WEB-18: "Cancel" keeps every entry and restores the normal heading.
- AC-21 / R-WEB-19: clearing keeps the cards the grid is showing. Deleting the shown entry keeps them too (Q2).
- AC-13 / NFR-1 (delete, clear): delete and clear send no request.
- AC-36 / R-WEB-34: at 40rem or narrower the History section fits the page with no horizontal scroll (manual screenshot).
- AC-38 / R-WEB-36: a `storage` event for the key, or for `null`, re-renders the list from the key.
- AC-39 / R-WEB-37: a row's delete button removes only that entry, without confirmation.

## Out of scope

- Server storage, history routes, and any change to `src/server/**` or `src/shared/contracts.ts` (spec Non-goals).
- Search or filter (P4), export and import (P5), one-click "Run again" (P6), merging identical runs (P8), a confirmation before a restore replaces the prompt (G6, EC-14), restoring the last viewed run after a reload, and encrypting the stored history (spec lines 33-46).
- Removing stale model IDs from the selection when the list loads after a restore. EC-11 accepts the server's 400.
- Edits to `CLAUDE.md`, `README.md` and `src/web/test-setup.ts` (already done in cedb6fc), and the editorial fix of the R-WEB-29 and R-WEB-38 "Covers" cells (R1).
- Setting the spec's `Status:` to `done` (R7). The main session does this after `sdd-engineering:plan-verifier`, not as a plan item.
- Refactoring `src/web/App.test.tsx` or extracting shared test helpers. `App.history.test.tsx` copies the few helpers it needs.
- Any new dependency.

## Risks

- **Leaking storage stubs.** `vi.spyOn(Storage.prototype, …)` could leak into later tests. → `App.history.test.tsx` restores all mocks in `afterEach`, and `test-setup.ts` already clears `localStorage` before each test (NFR-5).
- **Locale-dependent dates.** Date strings vary by the test machine's locale and time zone. → Tests compare against `formatRunTime(createdAt)` or the same `toLocaleString` call, never a literal date.
- **Alerts on restore.** Restored error cards keep `role="alert"` (`ResultCard.tsx:24`), so a restore announces them and tests may find more than one `alert`. → This is required by AC-15 ("exactly as live"). Tests query the Run-failed alert by its text.
- **Secure context for IDs.** `crypto.randomUUID()` needs a secure context. → `localhost` and `127.0.0.1` are secure contexts, and Node and jsdom provide it in tests.
- **`App.tsx` growing past "only composes".** → Selection logic lives in `history-restore.ts` and entry building in `history-storage.ts`. `App.tsx` only sets state and passes props.
- **Credits during manual checks.** → The checks seed `localStorage` from the console and never press Run.
- **Node `ExperimentalWarning` in node-environment tests.** → It is harmless (Q10), and the unit tests pass an in-memory `Storage` instead of the global one.

## Open questions

Nothing.
