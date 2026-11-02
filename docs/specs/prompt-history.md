# Spec: Prompt history
Spec ID: SPEC-2026-11-02-prompt-history
Status: approved (2026-11-02)
Supersedes: — (no earlier spec. This spec lifts the "History, database" exclusion of the base-app plan, for browser-side history only. See Goals / Non-goals.)

## Problem and user

The single local user of AI Sandbox compares several models on one prompt. Today every result
lives only on screen: a reload or a new run loses the previous answers, timings, tokens and costs.
To compare with an earlier run, the user has to retype the prompt, reselect the models and pay for
the run again. With this feature, every completed run is kept in the browser. The user can see past
runs, bring one back (its prompt, its models and its result cards) without spending credits, and
clear the history. The history survives a reload. Nothing is stored on the server.

## Goals / Non-goals

**Goals**
- Record every run that returned results, including the models that failed, in the browser's
  `localStorage`, so that the history survives a page reload.
- List past runs, newest first, with enough on each row to recognise the run: time, prompt
  excerpt, models, failures, total cost.
- Restore a past run: its prompt, its model selection and its stored result cards, with no request
  to the server and no credits spent.
- Clear the whole history after a confirmation, and delete a single entry.
- Keep the page fully usable when browser storage is unavailable, full, or holds invalid data.
- Lift the "History, database" exclusion of the base-app plan (`docs/plans/base-app.md`, Scope →
  Out) **for browser-side history only**. The "database" part of that exclusion still stands.

**Non-goals**
- Any server-side storage, database, history API route or change to the existing routes and shared
  contracts. "Nothing is stored on the server" is a requirement of the task.
- Sync across browsers or devices. The history belongs to one browser profile and one origin.
- Search or filter over the history (P4). Declined in discovery: medium cost, and the 50-entry cap
  keeps the list short.
- Export and import of the history as JSON (P5). Declined in discovery: medium cost, not needed for
  a local tool.
- A one-click "Run again" on a history row (P6). Declined in discovery: it would spend credits
  without the user reviewing the selection. Restore followed by Run covers it.
- Merging identical prompt-and-model runs into one entry (P8). Declined in discovery: each run is a
  separate measurement.
- Confirmation before a restore replaces the prompt the user is typing (G6). Accepted in discovery:
  a prompt that was run is already in history.
- Restoring the last viewed run automatically after a reload. Not requested. The results area
  starts empty after a reload, as it does today.
- Encrypting the stored history. Prompts and answers are stored in plain text in the browser
  profile. The user is told so in the README.

## User stories

- US-1 — As the user, I want every run I make to be kept in my browser, even across reloads, so that I do not lose answers I paid for.
- US-2 — As the user, I want to see my past runs at a glance, so that I can find the one I want to look at again.
- US-3 — As the user, I want to bring a past run back (its prompt, its models and its answers) without running it again, so that I can compare it or tweak it without spending credits.
- US-4 — As the user, I want to clear my history or delete one run, so that I can drop runs I no longer need.

## Acceptance criteria (EARS)

Verify-by suites come from the Testing section of `CLAUDE.md`: `unit (web)` covers plain
functions tested without React, `component (web)` covers jsdom tests in the style of the page's
existing tests, and `manual` covers a check in a real browser. The project has no e2e suite.
Priorities marked * were assumed; the assumption was accepted (OQ-1).

| ID | Priority | Requirement | Story | Verify by |
|---|---|---|---|---|
| AC-1 | P1 | WHEN a run's `POST /api/runs` request returns 200, the page shall add a history entry holding the prompt, the run's models in their selected order with their labels, every per-model result (answer or error text, latency, input and output tokens, cost), and the time the response arrived. | US-1 | component (web) |
| AC-2 | P1 | WHEN a run returns 200 with one or more `status: 'error'` results, the history entry shall hold those error results next to the successful ones. | US-1 | component (web) |
| AC-3 | P1 | IF a run request fails (a 4xx or 5xx response, an unexpected response body, or the server cannot be reached), THEN the page shall add no history entry. | US-1 | component (web) |
| AC-4 | P1 | The page shall add exactly one history entry for each run that returned 200. | US-1 | component (web) |
| AC-5 | P1 | WHEN the page is reloaded, the History section shall list the entries recorded before the reload. | US-1 | component (web), manual |
| AC-6 | P1 | The History section shall list entries newest first, by the time their response arrived. | US-2 | component (web) |
| AC-7 | P1 | The History section shall show on each row the run's local date and time in the browser locale, the prompt's first line cut to 100 characters with "…" when longer, the labels of the run's models, and, when any model failed, the number of failed models. | US-2 | component (web), unit (web) |
| AC-8 | P1 | WHILE the history has no entries, the History section shall show the text "No runs yet" and no "Clear history" control. | US-2 | component (web) |
| AC-9 | P1 | The History section shall present each row as a keyboard-operable button with the accessible name "Restore: <prompt excerpt>". | US-3 | component (web) |
| AC-10 | P1 | WHEN the user restores an entry, the Prompt box shall contain the entry's full prompt. | US-3 | component (web) |
| AC-11 | P1 | WHEN the user restores an entry, the model picker shall select the entry's models in the entry's order. | US-3 | component (web) |
| AC-12 | P1 | WHEN the user restores an entry, the results grid shall show the entry's stored results, one card per model in the entry's order. | US-3 | component (web) |
| AC-13 | P1 | WHEN the user restores an entry, deletes an entry or clears the history, the page shall send no request to the server. | US-3 | component (web) |
| AC-14 | P1 | WHILE the results grid shows a restored entry, the results grid shall show the line "From history · <local date and time of the run>" above the cards. | US-3 | component (web) |
| AC-15 | P1 | The results grid shall render a restored card exactly as it renders the same result from a live run: the answer as plain text (never HTML or Markdown), `n/a` for a missing cost, and an error card for an error result. | US-3 | component (web) |
| AC-16 | P1 | WHEN the user starts a run while a restored entry is shown, the results grid shall replace the restored cards with the pending cards of the new run. | US-3 | component (web) |
| AC-17 | P1 | WHILE a run is in progress, the History section shall disable its restore, delete and "Clear history" controls. | US-3 | component (web) |
| AC-18 | P1 | WHEN the user activates "Clear history", the History section shall show the question "Delete all N runs?" with "Clear" and "Cancel" buttons, N being the number of entries, and delete nothing yet. | US-4 | component (web) |
| AC-19 | P1 | WHEN the user confirms with "Clear", the History section shall remove every entry from the stored history, so that a reload shows the empty state. | US-4 | component (web) |
| AC-20 | P1 | WHEN the user answers "Cancel", the History section shall keep every entry. | US-4 | component (web) |
| AC-21 | P1 | WHEN the user clears the history, the results grid shall keep the cards it is showing. | US-4 | component (web) |
| AC-22 | P1 | IF browser storage cannot be read or written, THEN the History section shall show the text "History is unavailable in this browser" and no list. | US-1 | component (web) |
| AC-23 | P1 | IF browser storage cannot be read or written, THEN the page shall run models and show their results as it does when storage works. | US-1 | component (web) |
| AC-24 | P2 | WHEN a run is recorded while the history holds 50 entries, the page shall remove the oldest entry, so that the history holds 50 entries. | US-1 | unit (web) |
| AC-25 | P2 | IF saving a new entry exceeds the browser's storage quota, THEN the page shall remove the oldest entries one at a time until the new entry is saved. | US-1 | unit (web) |
| AC-26 | P2 | IF the new entry cannot be saved even after older entries are removed, THEN the page shall show the text "This run could not be saved to history" and keep the run's result cards on screen. | US-1 | component (web) |
| AC-27 | P2 | IF a stored entry does not meet the run limits (prompt blank or over 20,000 characters; fewer than 1, more than 6 or duplicate models; a result that is not a valid run result; results not matching the models one to one in order), THEN the History section shall leave that entry out and list the valid entries. | US-1 | unit (web) |
| AC-28 | P2 | IF the stored history cannot be parsed, THEN the History section shall show its empty state without an error. | US-1 | unit (web), component (web) |
| AC-29 | P2 | WHEN a run is recorded after the stored history could not be parsed, the page shall replace the stored history with a valid history holding the new entry. | US-1 | unit (web) |
| AC-30 | P2 | IF an entry being restored names a model that is not in the loaded model list, THEN the model picker shall leave that model unselected. | US-3 | component (web) |
| AC-31 | P2 | IF an entry being restored names a model that is not in the loaded model list, THEN the page shall show a notice naming each model left out. | US-3 | component (web) |
| AC-32 | P2 | WHILE the model list is loading or has failed to load, WHEN the user restores an entry, the page shall keep every stored model in the selection. | US-3 | component (web) |
| AC-33 | P2 | The History section and the restored cards shall name each model by the label stored with the entry, including while the model list is loading, after it has failed, or when it no longer contains the model. | US-2 | component (web) |
| AC-34 | P2* | WHEN the user restores an entry, the page shall move keyboard focus to the Prompt box. | US-3 | component (web) |
| AC-35 | P2* | WHEN the user restores an entry, the page shall announce "Restored run from <local date and time>" as a status message. | US-3 | component (web) |
| AC-36 | P2* | WHILE the viewport is 40rem wide or narrower, the History section shall fit the page width with no horizontal scroll. | US-2 | manual |
| AC-37 | P3 | WHEN a run is recorded, the page shall keep every entry that another tab of the page saved since this tab last read the history. | US-1 | unit (web) |
| AC-38 | P3 | WHEN another tab of the page changes the history, the History section shall show the changed list without a reload. | US-2 | component (web) |
| AC-39 | P3 | WHEN the user deletes a single entry with its delete button, the History section shall remove that entry, without confirmation, and keep every other entry. | US-4 | component (web) |
| AC-40 | P3 | The History section shall show on each row the total cost of the run (rule settled by OQ-2). | US-2 | unit (web) |
| AC-41 | P3* | The History section's heading shall read "History (N)", N being the number of entries. | US-2 | component (web) |
| AC-42 | P3* | WHILE the results grid shows a restored entry, the History section shall mark that entry's row as the current one. | US-3 | component (web) |

## Edge cases

| ID | Case | Expected behaviour | Covered by |
|---|---|---|---|
| EC-1 | First visit, or history just cleared (G1) | "No runs yet", no Clear control | AC-8 |
| EC-2 | Run succeeds for some models and fails for others | One entry holds both kinds of result | AC-2 |
| EC-3 | Run request rejected (400), 5xx, or server unreachable | No entry. The page shows the existing "Run failed" message | AC-3 |
| EC-4 | Page rendered twice in development (strict mode) | Still exactly one entry per run | AC-4 |
| EC-5 | Prompt of 20,000 characters or many lines (G3) | Row shows the first line, cut to 100 characters with "…". The full prompt appears after restore | AC-7, AC-10 |
| EC-6 | 50 entries and a new run | Oldest entry dropped | AC-24 |
| EC-7 | Storage quota exceeded on save (G10) | Oldest entries dropped until it fits. Otherwise a message, and the cards stay | AC-25, AC-26 |
| EC-8 | Storage disabled or throwing (G9) | "History is unavailable in this browser". Runs unaffected | AC-22, AC-23 |
| EC-9 | Stored data hand-edited, from an older shape, or written by another app on the same origin (G11) | Invalid entries skipped. An unparsable value reads as empty and is overwritten on the next save | AC-27, AC-28, AC-29 |
| EC-10 | Restored model no longer offered by OpenRouter (Q6) | Left unselected, named in a notice. Its stored card still shows | AC-30, AC-31, AC-12 |
| EC-11 | Restore while the model list is loading or failed (G7) | Stored cards and prompt restored. Every stored model kept selected. The existing Run rules and the server's 400 check still apply | AC-32, AC-33 |
| EC-12 | Model labels missing from the live list (G8) | Stored labels used | AC-33 |
| EC-13 | Restore or Clear clicked while a run is in progress (G5) | Controls disabled | AC-17 |
| EC-14 | Restore while the user has typed an unsent prompt (G6) | The prompt is replaced without confirmation | Non-goal (accepted in discovery) |
| EC-15 | Clear while cards are on screen (G14) | Cards stay. Only stored entries go | AC-21 |
| EC-16 | Run after a restore | Restored cards replaced by pending cards of the new run. The new run becomes a new entry | AC-16, AC-1 |
| EC-17 | Two tabs record runs (G12) | Neither tab erases the other's entries. The other tab's list updates | AC-37, AC-38 |
| EC-18 | Reload while a run is in progress (G13) | The run is not recorded | accepted: no handling |
| EC-19 | Restored answer contains HTML or script-like text | Shown as plain text | AC-15 |
| EC-20 | Cost of a free model (`$0`) versus an unknown cost (`n/a`) | Preserved through storage and shown as on a live card | AC-15 |
| EC-21 | Page opened at `127.0.0.1:5173` instead of `localhost:5173`, or another local app served on the same origin | Different origin, so a different history. A same-origin app can read and write the stored value, which is handled as untrusted | accepted: no handling. AC-27 guards reads |
| EC-22 | Reload with history present | History listed. The results area is empty until a run or restore | AC-5, Non-goal |
| EC-23 | Total cost when some results have no cost or are errors | Sum the costs of the successful results; `n/a` if any successful result has no cost or none succeeded | OQ-2 |

## Non-functional requirements

- NFR-1 — Restoring, deleting and clearing make 0 network requests and spend 0 credits.
- NFR-2 — The stored history holds at most 50 entries. A worst-case entry is a 20,000-character
  prompt plus 6 answers of at most 1,024 output tokens each, about 70,000 characters. 50 such
  entries come to about 3.5 million characters, under the roughly 5 MB per-origin `localStorage`
  quota of current browsers. AC-25 and AC-26 handle the rest.
- NFR-3 — Accessibility: every history control can be reached and operated with the keyboard alone.
  The list has the accessible name "History". The Clear confirmation can be operated with the
  keyboard.
- NFR-4 — Security: no stored text is ever rendered as HTML or Markdown. The OpenRouter key never
  reaches the browser (base AC-10), so it can never be stored in history.
- NFR-5 — `npm test` makes no network calls and spends no credits (base AC-11 still holds), and no
  test depends on history left by another test.

## Inputs and provenance

**Sources of this spec**
- Task description: prompt history in `localStorage`, read on 2026-11-02.
- Discovery report for this feature, with the user's answers relayed by the main session on
  2026-11-02. All recommended answers to Q1–Q12 were accepted. P1, P2, P3 and P7 were accepted and
  P4, P5, P6 and P8 declined. G1–G16 were accepted as proposed.
- [`docs/plans/base-app.md`](../plans/base-app.md): the base app's plan, scope and decisions D-7 and D-9.
- `CLAUDE.md` and [`docs/specs/README.md`](README.md): project rules and spec conventions.
- No design prototype was given. The layout below follows the existing page styles and the
  discovery answer to Q5.
- Base commit: `2065267`.

**Data flow**
| Data | Produced by | Contract | Consumed by | When unavailable |
|---|---|---|---|---|
| Results of a run to record | Server, `POST /api/runs` | `RunRequest`, `RunResponse` / `RunResult` (shared, unchanged) | The page's history recorder | Request failed: nothing recorded (AC-3) |
| History entries | The page, in the browser | `HistoryEntry` (browser-only, defined in the Web module part below), stored under one versioned `localStorage` key | History section, results grid (restored view), Prompt box, model picker | Storage throws: AC-22, AC-23. Quota: AC-25, AC-26. Invalid data: AC-27–AC-29 |
| Model labels | Server, `GET /api/models` at record time | `ModelsResponse` (shared, unchanged), copied into the entry | History rows, restored cards | List loading or failed later: the stored label is used (AC-33) |
| Model availability at restore | Server, `GET /api/models` | `ModelsResponse` | Model selection on restore | List not loaded: all stored models kept (AC-32) |
| Changes from another tab | Browser storage event | Same stored value | History section | No event, as when storage is unavailable: the list refreshes on the next read |
| Re-run of a restored prompt | The page | `RunRequest` (unchanged) | Server | Existing 400 / 503 handling (base AC-6, AC-7) |

The server, its routes and the shared contracts do not change.

## Ownership

| Part | Package | Module spec |
|---|---|---|
| History recording, storage, History section, restored results view | `ai-sandbox` (single package, `src/web`) | The "Web module" part of this file, below (one spec file per feature, per discovery Q8) |
| Server | `ai-sandbox` (`src/server`) | None: no change |

## Untrusted inputs

| Input | Origin | Reaches | Handling |
|---|---|---|---|
| Stored history value | Browser `localStorage`. The user can edit it, and any app served on the same origin can write it (`localhost:5173` is Vite's default port, shared by other local projects) | History rows, Prompt box, model selection, result cards, and the server on a re-run | Each entry is validated on read against the `HistoryEntry` schema, which reuses the shared limits (prompt ≤ 20,000 characters and not blank, 1–6 unique models, valid `RunResult`s). Invalid entries are dropped (AC-27). At most 50 entries are kept. Everything is rendered as text, never HTML (AC-15). The server still validates any re-run (base AC-6). The key is namespaced and versioned. |
| Model answers and error texts | OpenRouter, through the server | Stored, then shown again on restore | Plain text only: base decision D-7 carries over (AC-15). |
| User prompt | The user | Stored in plain text in the browser profile, readable by other apps on the same origin | No secret handling. The README says the history is stored unencrypted in the browser. |
| LLM pipeline | — | — | None: history is never sent to a model or built into a prompt. Output validation in the run route is unchanged. |

## Open questions

| ID | Question | Accepted answer (2026-11-02) | Status |
|---|---|---|---|
| OQ-1 | The discovery answers set no priority for a few criteria: focus after restore (AC-34), the restore announcement (AC-35), phone width (AC-36), the "History (N)" heading (AC-41) and the current-row mark (AC-42). | Keep the assumed priorities: P2 for AC-34, AC-35 and AC-36, P3 for AC-41 and AC-42. | resolved |
| OQ-2 | How is a row's total cost (P1, AC-40) worked out when some models failed or reported no cost? | Sum the cost of the successful results. Show `n/a` if any successful result has no cost or no result succeeded. Error results add nothing. Format it like a card's cost. | resolved |
| OQ-3 | How long does the notice about left-out models (AC-31) stay? | Until the next restore or the next run starts. | resolved |

---

# Prompt history — web module
Spec ID: SPEC-2026-11-02-prompt-history · Umbrella: [`docs/specs/prompt-history.md`](#spec-prompt-history) (this file) · Status: approved (2026-11-02)

## Scope

Covers AC-1 to AC-42 of the umbrella. The server is unchanged, and `src/shared/contracts.ts` is
unchanged.

## Contracts

`HistoryEntry` is browser-only. It never crosses the wire, so it is defined in the web layer, not in
`src/shared/` (discovery Q11). It is a Zod schema composed from the shared `RunResult` and the
shared limits `MAX_PROMPT_CHARS` and `MAX_MODELS_PER_RUN`:

| Field | Type | Rule |
|---|---|---|
| `id` | string | Unique within the history. Used to delete and to mark the current entry |
| `createdAt` | string | ISO 8601 time the 200 response arrived |
| `prompt` | string | Not blank, at most `MAX_PROMPT_CHARS` characters |
| `models` | `{ id: string; label: string }[]` | 1 to `MAX_MODELS_PER_RUN` items, unique `id`s, in selected order |
| `results` | `RunResult[]` | Same length as `models`. `results[i].modelId === models[i].id` |

Storage surface: one `localStorage` key, `ai-sandbox:history:v1`, holding a JSON array of
`HistoryEntry`, newest first, at most 50 items. Other keys are never read or written.

## Requirements (EARS)

| ID | Requirement | Covers |
|---|---|---|
| R-WEB-1 | WHEN the run mutation succeeds, the page shall save one `HistoryEntry` built from the mutation's request and response, with labels taken from the loaded model list, falling back to the model ID when a label is missing. | AC-1, AC-2 |
| R-WEB-2 | IF the run mutation fails, THEN the page shall save nothing to the history. | AC-3 |
| R-WEB-3 | The history recorder shall save once per successful mutation, including under React strict mode. | AC-4 |
| R-WEB-4 | WHEN the page mounts, the History section shall read the `ai-sandbox:history:v1` key and list its valid entries. | AC-5 |
| R-WEB-5 | The History section shall order rows by `createdAt`, newest first. | AC-6 |
| R-WEB-6 | The history row helpers shall be plain functions, tested without React, that produce the row's date and time (browser locale), the prompt excerpt (first line, at most 100 characters, then "…"), and the failed-model count. | AC-7 |
| R-WEB-7 | WHILE the history is empty, the History section shall render "No runs yet" and no "Clear history" button. | AC-8 |
| R-WEB-8 | The History section shall render each row as a `<button>` with the accessible name "Restore: <excerpt>", inside a list named "History". | AC-9 |
| R-WEB-9 | WHEN a row is restored, the page shall set the prompt state to the entry's `prompt`. | AC-10 |
| R-WEB-10 | WHEN a row is restored, the page shall set the selection to the entry's model IDs in order, subject to R-WEB-28 and R-WEB-30. | AC-11 |
| R-WEB-11 | WHEN a row is restored, the results grid shall render the entry's `results` against the entry's `models`, using the same card component as live runs. | AC-12, AC-15 |
| R-WEB-12 | The history hook and storage module shall make no `fetch` call. | AC-13 |
| R-WEB-13 | WHILE a restored entry is shown, the results grid shall render a `.meta` line "From history · <date and time>" above the cards. | AC-14 |
| R-WEB-14 | WHEN a run starts, the page shall drop the restored view, so that the grid shows the new run's pending cards. Whichever of a run and a restore happened last decides what the grid shows. | AC-16 |
| R-WEB-15 | WHILE the run mutation is pending, the History section shall render its row, delete and clear buttons as disabled. | AC-17 |
| R-WEB-16 | WHEN "Clear history" is pressed, the History section shall replace it with "Delete all N runs?" and the buttons "Clear" and "Cancel", and leave the storage untouched. | AC-18 |
| R-WEB-17 | WHEN "Clear" is confirmed, the storage module shall write an empty history to the key. | AC-19 |
| R-WEB-18 | WHEN "Cancel" is pressed, the History section shall return to its normal heading with the storage untouched. | AC-20 |
| R-WEB-19 | WHEN the history is cleared, the page shall leave the results grid's current content unchanged. | AC-21 |
| R-WEB-20 | IF reading or writing the key throws, THEN the storage module shall report "unavailable" instead of throwing, and the History section shall render "History is unavailable in this browser" with no list. | AC-22 |
| R-WEB-21 | IF the storage module reports "unavailable", THEN the run flow shall continue unchanged and the page shall raise no uncaught error. | AC-23 |
| R-WEB-22 | WHEN an entry is saved, the storage module shall keep at most the 50 newest entries. | AC-24 |
| R-WEB-23 | IF a write throws a quota error, THEN the storage module shall drop the oldest entry and retry, until the write succeeds or only the new entry is left. | AC-25 |
| R-WEB-24 | IF the write fails with only the new entry left, THEN the page shall show "This run could not be saved to history" as a status message and keep the run's cards. | AC-26 |
| R-WEB-25 | WHEN the key is read, the storage module shall validate each entry against `HistoryEntry` and return only the valid ones. | AC-27 |
| R-WEB-26 | IF the key's value is not valid JSON or not an array, THEN the storage module shall return an empty history without throwing. | AC-28 |
| R-WEB-27 | WHEN an entry is saved after an unparsable read, the storage module shall write a fresh array holding the new entry. | AC-29 |
| R-WEB-28 | WHILE the model list is loaded, WHEN a row is restored, the page shall select only the stored models present in the list. | AC-30 |
| R-WEB-29 | WHILE the model list is loaded, WHEN a restore leaves models out, the page shall render a status notice "Not available any more: <labels>". | resolved |
| R-WEB-30 | WHILE the model list is loading or failed, WHEN a row is restored, the page shall select every stored model ID. | AC-32 |
| R-WEB-31 | The History section and the restored grid shall take model labels from the entry's `models`, never from the live list. | AC-33 |
| R-WEB-32 | WHEN a row is restored, the page shall move focus to the Prompt textarea. | AC-34 |
| R-WEB-33 | WHEN a row is restored, the page shall render "Restored run from <date and time>" in a `role="status"` element. | AC-35 |
| R-WEB-34 | WHILE the viewport is 40rem wide or narrower, the History rows shall wrap as in the Layout section, so that the page has no horizontal scroll. | AC-36 |
| R-WEB-35 | WHEN an entry is saved, the storage module shall read the key again immediately before writing, and add the new entry to what it read. | AC-37 |
| R-WEB-36 | WHEN the window receives a `storage` event for the key, the history hook shall read the key again and the History section shall re-render. | AC-38 |
| R-WEB-37 | WHEN a row's delete button ("Delete run: <excerpt>") is pressed, the storage module shall remove that entry by `id` and keep the others. | AC-39 |
| R-WEB-38 | The history row helpers shall include a plain function for the row's total cost, applying the rule settled by OQ-2. | resolved |
| R-WEB-39 | The History section heading shall render "History (N)". | AC-41 |
| R-WEB-40 | WHILE a restored entry is shown, its row shall carry `aria-current="true"` and the highlighted background. | AC-42 |

## Data access

History is browser-owned data, not server data. All `localStorage` access goes through one module
in `lib/`, and components get history only through one hook. Components never touch
`localStorage` (discovery Q10). The restored view is page state that holds an entry `id` or the
entry itself. It does not copy server data from the mutation.

## Layout

No design screen exists. The numbers come from the current page styles and the discovery answer to
Q5. Where this departs from a design, it is because there is none.

- **Placement:** a `<section aria-labelledby>` titled "History (N)", placed last in `main`, after
  the results grid, with `margin-top: 1.5rem` (the same as the results grid).
- **Page container:** unchanged. `main` has max-width 64rem, padding 1rem, and 0.75rem at ≤40rem.
  Not full-bleed.
- **Heading row:** a flex row. The heading is on the left, in the style of the "Models (n of 6
  selected)" legend (inherits 16px, weight 600). On the right sits "Clear history", or while
  confirming, the text "Delete all N runs?" followed by "Clear" and "Cancel". The buttons have the
  page's default button style.
- **List panel:** a bordered panel like the model list: `1px solid var(--border)`, radius 6px,
  `max-height: 16rem`, `overflow-y: auto`, no list bullets.
- **Row:** a flex row with `align-items: baseline`, `gap: 0.5rem`, padding `0.375rem 0.75rem`, and a
  hover background `var(--surface)`. The current row (R-WEB-40) has `var(--surface)` permanently.
  From left to right:
  1. date and time: muted, 0.875rem, `white-space: nowrap`;
  2. prompt excerpt: `flex: 1`, `min-width: 0`, a single line with ellipsis overflow;
  3. model labels, the failed count (danger colour) and the total cost: muted, 0.875rem;
  4. a delete button "×", styled like a chip's remove button (no border, muted, 1.25rem).
- **Empty and unavailable states:** the panel is replaced by a muted paragraph, styled like
  `.empty` (padding 0.75rem).
- **Restored line:** "From history · <date and time>" as a `.meta` line (muted, 0.875rem) directly
  above the results grid.
- **Notices:** "Not available any more: …" sits below the model picker. "This run could not be saved
  to history" sits above the History panel. Both are muted `role="status"` paragraphs, not the red
  error notice.
- **≤40rem:** rows `flex-wrap: wrap`, like the model list rows. The heading row wraps the
  confirmation below the heading.

## Documentation changes

These ship in the same commit as the feature, per the rules in `docs/specs/README.md`:
- `README.md`: replace "keeps no history … a reload clears them" with a description of the browser
  history, and state that it is stored unencrypted in the browser and never on the server.
- `CLAUDE.md`: add the history storage module and hook to the folder map, and add the frontend rule
  from "Data access" above.

## Test hints

- jsdom provides `localStorage`. The shared test setup must clear it before each test (NFR-5).
- Storage failures (AC-22, AC-23, AC-25, AC-26) are tested by stubbing `localStorage` methods to
  throw, with no real quota.
- The existing plain-text test pattern (output containing `<img onerror>`) is repeated for a
  restored card (AC-15).
- AC-5 in a component test: seed the key, render the page, check the rows. The real reload is a
  manual check.
