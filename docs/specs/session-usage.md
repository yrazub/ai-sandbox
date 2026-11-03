# Spec: Session usage
Spec ID: SPEC-2026-11-03-session-usage
Status: approved (2026-11-03)
Supersedes: — (no earlier spec. The base-app plan's "no database" still holds: the tally lives only in the server's memory and is never stored.)

## Problem and user

The single local user of AI Sandbox runs one prompt against up to 6 OpenRouter models at a time.
Each result card shows the tokens and cost of that one call, and each History row shows the total
of one run. Nothing shows how much the user has used across all runs since the server started, so
the user has to add up cards by hand or open the OpenRouter dashboard to see what an afternoon of
experiments cost. With this feature the server keeps a running total of the input tokens, output
tokens and cost of every successful model call since it started, exposes it on `GET /api/usage`,
and the page shows it in a footer, for example "Session since 14:02: 12,400 tokens · $0.0040".
The total resets when the server restarts. Nothing is written to disk or to the browser.

## Goals / Non-goals

**Goals**
- Keep one in-memory usage tally per server process: input tokens, output tokens, cost, the number
  of successful calls counted and the number of those that reported no cost.
- Grow the tally after each run by its successful results only. A failed or timed-out model call,
  and a run the server rejects, add nothing.
- Expose the tally on a read-only `GET /api/usage` route with a new shared contract,
  `UsageResponse`.
- Show the tally in a page footer: total tokens and cost, with when the tally started (P1), and
  keep it current after each run and when the window regains focus (P2).
- Reset the tally when the server restarts, and store it nowhere: no file, no database, no browser
  storage.

**Non-goals**
- Storing the tally on disk, in a database or in the browser. "Nothing is stored" is part of the
  task, and the base-app plan's "no database" exclusion still holds.
- An input / output token breakdown in the footer (P3). Declined in discovery: it keeps the task's
  example text. The API carries both numbers.
- A Reset button or a `POST /api/usage/reset` route (P4). Declined in discovery: the task says only
  a restart resets the tally, and the button would add a mutating route.
- Returning the totals inside the `POST /api/runs` response (P5). Declined in discovery: it would
  change `RunResponse`, and the task names `GET /api/usage`.
- A failed-call count in the footer (P6). Declined in discovery: the README note on failed and
  timed-out calls (G9) covers it.
- Matching the OpenRouter bill. The tally counts only usage reported for successful results, so it
  can be lower than the bill: OpenRouter may charge for a call that failed or timed out (G9).
- One tally per tab or per client (Q6). The session is the server process; every client feeds the
  same tally.
- Counting model calls made by features other than `POST /api/runs` (Q7). A later feature that adds
  model calls (for example a planned LLM judge) states in its own spec whether they count.
- Pushing tally changes to the page. Runs from another tab or client show up at this tab's next
  refresh trigger (G4).
- A retry button in the footer's error state (G3). The next refresh trigger tries again.
- A sticky footer, and announcing tally changes to screen readers (G15). The result cards already
  announce the end of a run.
- Any change to the History row's per-run total (G16). The footer (per process) and the row total
  (per run) stay independent.

## User stories

- US-1 — As the user, I want to see how many tokens and how much money my model calls have used since the server started, so that I know what a session of experiments cost.
- US-2 — As the user, I want the total to stay correct when models fail, a run is rejected or several runs overlap, so that I can trust the number.
- US-3 — As the user, I want to know when the total started and to have it reset on restart with nothing stored, so that I understand what the number covers.

## Acceptance criteria (EARS)

Verify-by suites: `unit (server)` covers plain server functions and the run service with
`MockProvider`; `route (server)` covers requests through `app.inject`; `unit (web)` covers plain
functions tested without React; `component (web)` covers jsdom tests of the page; `manual` covers a
check by hand with the running app or the documents (recorded as skipped in a headless run).
Priorities come from discovery Q10. A criterion from a design gap or answer that Q10 does not name
takes the priority of the Q10 group it refines: the tally rules (AC-3, AC-6) and the footer's
placement (AC-13) are P1 with "tally of ok results" and "footer text"; the remaining server and
documentation rules are P2 with the states and the unpriced rule.

| ID | Priority | Requirement | Story | Verify by |
|---|---|---|---|---|
| AC-1 | P1 | WHEN a `POST /api/runs` request from any client returns 200, the API shall add each `status: 'ok'` result of that response to the session tally: its input tokens, its output tokens, its cost, and one ok call. | US-1 | route (server) |
| AC-2 | P1 | IF a result of a run has `status: 'error'`, including a call that timed out, THEN the API shall add nothing to the session tally for that result. | US-2 | route (server) |
| AC-3 | P1 | IF a `POST /api/runs` request is answered with 400 (blank prompt, unknown or duplicate model, invalid body) or 503 (no model list), THEN the API shall leave the session tally unchanged. | US-2 | route (server) |
| AC-4 | P1 | WHEN a `GET /api/usage` request arrives, the API shall respond 200 with a `UsageResponse` body holding `inputTokens`, `outputTokens`, `costUsd`, `okCalls`, `unpricedCalls` and `startedAt`. | US-1 | route (server) |
| AC-5 | P1 | WHEN a `GET /api/usage` request starts after a `POST /api/runs` request has returned 200, the `GET /api/usage` response shall include the ok results of that run. | US-2 | route (server) |
| AC-6 | P1 | WHEN several `POST /api/runs` requests run at the same time and all have returned, `GET /api/usage` shall report totals equal to the sum over the ok results of all of them. | US-2 | route (server) |
| AC-7 | P1 | WHEN the server starts, `GET /api/usage` shall report 0 input tokens, 0 output tokens, a cost of 0, 0 ok calls and 0 unpriced calls, with `startedAt` set to the time the server started. | US-3 | route (server), manual |
| AC-8 | P1 | The API shall keep the session tally only in the server process's memory, writing it to no file, database or other storage that outlives the process. | US-3 | manual |
| AC-9 | P1 | The page shall write nothing about the session tally to browser storage (`localStorage`, `sessionStorage` or cookies). | US-3 | component (web) |
| AC-10 | P1 | WHEN the session tally has loaded, the footer shall show the text "<tokens> tokens · <cost>", <tokens> being the sum of the input and output tokens and <cost> the tally's cost. | US-1 | component (web) |
| AC-11 | P1 | The footer shall show <tokens> grouped by thousands in the browser locale ("12,400" in en-US, "12 400" in fr-FR). | US-1 | unit (web) |
| AC-12 | P1 | The footer shall show <cost> by the result cards' cost rule: "$0" for zero, "<$0.0001" below $0.0001, 4 decimals below $1, and 2 decimals from $1 up. | US-1 | unit (web) |
| AC-13 | P1 | The page shall show the footer below the History section as the page's footer (`contentinfo`) landmark. | US-1 | component (web) |
| AC-14 | P2 | IF an ok result reports no cost (`costUsd` null), THEN the API shall add its tokens and one ok call, leave the cost total unchanged, and add one unpriced call. | US-2 | route (server) |
| AC-15 | P2 | WHEN an ok result reports a cost of 0 or 0 tokens, the API shall add those values as reported, without counting the result as an unpriced call. | US-2 | unit (server) |
| AC-16 | P2 | WHILE the session tally has one or more unpriced calls, the footer shall show " (<N> calls without cost)" directly after <cost>, <N> being the unpriced call count. | US-2 | unit (web), component (web) |
| AC-17 | P2 | WHILE the loaded session tally is zero, the footer shall show "Session since <time>: 0 tokens · $0". | US-1 | component (web) |
| AC-18 | P2 | WHILE the first `GET /api/usage` request of the page is in flight, the footer shall show the muted text "Session: loading…". | US-1 | component (web) |
| AC-19 | P2 | WHILE a later `GET /api/usage` request is in flight, the footer shall keep showing the last loaded totals, with no loading text. | US-1 | component (web) |
| AC-20 | P2 | IF the latest `GET /api/usage` request fails (server unreachable, an error status, or a body that does not match `UsageResponse`), THEN the footer shall show the muted text "Session usage unavailable" with no retry control. | US-1 | component (web) |
| AC-21 | P2 | The footer shall carry no `alert` or `status` role and no live region in any of its states. | US-1 | component (web) |
| AC-22 | P2 | WHEN a run's `POST /api/runs` request in this tab settles, with 200 or with an error, the page shall request `GET /api/usage` again. | US-2 | component (web) |
| AC-23 | P2 | WHEN the user restores a history entry, deletes one or clears the history, the page shall send no `GET /api/usage` request. | US-1 | component (web) |
| AC-24 | P2 | WHILE a run is in progress, the footer shall keep showing the totals it showed when the run started. | US-2 | component (web) |
| AC-25 | P2 | WHEN the API answers `GET /api/usage`, the response shall carry the header `Cache-Control: no-store`. | US-1 | route (server) |
| AC-26 | P2 | The API shall return `costUsd` as the unrounded sum of the counted costs. | US-2 | unit (server) |
| AC-27 | P2 | IF a total of the session tally breaks the `UsageResponse` limits (for example a negative number), THEN `GET /api/usage` shall respond 500 with the generic error message and without the value. | US-2 | route (server) |
| AC-28 | P2 | IF the client of a `POST /api/runs` request disconnects before the response is sent, THEN the API shall still add the run's ok results to the session tally when the run finishes. | US-2 | unit (server) |
| AC-29 | P2 | WHILE the viewport is 40rem wide or narrower, the footer shall wrap its text within the page width with no horizontal scroll. | US-1 | manual |
| AC-30 | P2 | The footer shall render every tally value as plain text, never as HTML. | US-1 | component (web) |
| AC-31 | P2 | The project README shall state that the server stores nothing on disk and keeps an in-memory usage tally that resets on restart, and that the tally counts only usage reported for successful results, so it can be lower than the OpenRouter bill. | US-3 | manual |
| AC-32 | P2 | The folder map in the project's `CLAUDE.md` shall name the usage tally and `GET /api/usage` under the runs module, the usage hook, the footer component and its format helper. | US-3 | manual |
| AC-33 | P3 | WHEN the session tally has loaded, the footer shall start its text with "Session since <time>: ", <time> being `startedAt` as a local time of day in hours and minutes in the browser locale. | US-3 | unit (web), component (web) |
| AC-34 | P3 | WHEN the browser window regains focus, the page shall request `GET /api/usage` again. | US-1 | component (web) |

With every accepted rule applied, a loaded footer reads, for example,
"Session since 14:02: 12,400 tokens · $0.0040 (2 calls without cost)" (en-GB time, en-US grouping
for illustration; both come from the browser locale).

## Edge cases

| ID | Case | Expected behaviour | Covered by |
|---|---|---|---|
| EC-1 | First load, no run yet (G1) | "Session since <time>: 0 tokens · $0". The footer is always present once loaded | AC-7, AC-17 |
| EC-2 | First load in flight (G2) | Muted "Session: loading…" | AC-18 |
| EC-3 | Refetch after a successful load | Last totals stay, no spinner or loading text | AC-19 |
| EC-4 | `GET /api/usage` unreachable, 5xx, or a body not matching the contract (G3) | Muted "Session usage unavailable", no retry button, no alert. The next run or focus tries again | AC-20, AC-21, AC-22, AC-34 |
| EC-5 | A run in progress (G5) | Previous totals unchanged until the run settles and the refetch returns | AC-24, AC-22 |
| EC-6 | Server restarted while the page is open; under `npm run dev`, `tsx watch` restarts it on every saved server file (G6) | The page shows the old tally until its next refresh trigger; the new "since" time then makes the reset visible | accepted: no handling. AC-7, AC-33 |
| EC-7 | Every model of a run fails (G7) | Tally unchanged. The footer re-reads and shows the same numbers | AC-2, AC-22 |
| EC-8 | Run rejected: 400 for an unknown or duplicate model or a blank prompt, 503 for no model list (G8) | No model called, nothing added. The footer still re-reads, since the run settled with an error | AC-3, AC-22 |
| EC-9 | A call times out after 60 s (G9) | Adds nothing. OpenRouter may still bill it; the README says so | AC-2, AC-31 |
| EC-10 | Free model (cost 0), or a response with no usage, so tokens are reported as 0 (G10) | Tokens and $0 added as reported. Not an unpriced call | AC-15 |
| EC-11 | An ok result with no cost (Q1) | Tokens added, cost unchanged, counted as unpriced. The footer adds "(N calls without cost)" | AC-14, AC-16 |
| EC-12 | Several runs at once, from tabs or clients (G11) | After all finish, the tally equals the sum over all their ok results | AC-6 |
| EC-13 | Very large totals (G12) | Tokens grouped. Cost from $1 up with 2 decimals. The footer wraps at ≤40rem. A number too large to show exactly is not handled | AC-11, AC-12, AC-29. Overflow: accepted: no handling |
| EC-14 | Floating-point noise in the cost sum (G13) | The API returns the raw sum; only the footer rounds | AC-26, AC-12 |
| EC-15 | A browser or proxy caching the usage response (G14) | The response forbids storing it | AC-25 |
| EC-16 | Restore, delete or clear of history (G16) | No usage request. Tally and footer unchanged. The History row total stays per run | AC-23 |
| EC-17 | A run from another tab or from curl (Q6) | Counted in the same tally. This tab shows it at its next run or window focus | AC-1, AC-22, AC-34 |
| EC-18 | The client gives up on a run that the server finishes (Q9) | The run's ok results count, since the provider charged for them | AC-28 |
| EC-19 | OpenRouter reports a negative token count or cost | Added as reported. If a total turns negative, `GET /api/usage` answers 500 and the footer shows "Session usage unavailable" | accepted: no handling. AC-27, AC-20 |
| EC-20 | Model calls added by a later feature (Q7) | Not counted unless that feature's spec says so | Non-goal |
| EC-21 | Bill higher than the tally because of failed calls | Explained in the README, not shown in the footer | AC-31, Non-goal (P6) |

## Non-functional requirements

- NFR-1 — `npm test` makes 0 network calls and spends 0 credits (base-app AC-11 still holds).
  Server tests use `MockProvider`; page tests answer `GET /api/usage` from the fetch stub.
- NFR-2 — `GET /api/usage` is read-only: it reads no request body, query or header, makes 0 calls
  to OpenRouter, spends 0 credits and changes no tally value.
- NFR-3 — Security: the `GET /api/usage` body holds exactly six fields, five numbers and one
  timestamp. It never holds the OpenRouter key, an error text, a prompt or a model output (base-app
  AC-10 still holds).
- NFR-4 — Test independence: each app instance starts its own tally at 0, so no test reads a tally
  that another test wrote.
- NFR-5 — Memory: the tally holds six values however many runs the server has made.
- NFR-6 — Accessibility: the footer is reachable by landmark navigation, and a change of its
  totals is not announced (AC-21).

## Inputs and provenance

**Sources of this spec**
- Task description: session usage tally, read on 2026-11-03.
- Discovery report for this feature, with the user's answers relayed by the main session on
  2026-11-03. All recommended answers to Q1–Q10 were accepted. G1–G16 were accepted as proposed. P1
  and P2 were accepted; P3, P4, P5 and P6 were declined.
- [`docs/plans/base-app.md`](../plans/base-app.md): the base app's scope ("History, database" out)
  and AC-10, AC-11.
- [`docs/specs/prompt-history.md`](prompt-history.md): AC-13 (no request on restore, delete or
  clear) and the History section the footer sits below.
- `CLAUDE.md` and [`docs/specs/README.md`](README.md): project rules and spec conventions.
- No design prototype was given. The task shows one filled string; the Layout section below follows
  the page's existing styles and discovery G15.
- Base commit: `51c9cbd`.

**Data flow**
| Data | Produced by | Contract | Consumed by | When unavailable |
|---|---|---|---|---|
| Per-model results of a run | Server, the run flow, from the LLM provider | `RunResult` in `RunResponse` (shared, unchanged) | The session tally (ok results only), and the page as today | Error results and rejected runs add nothing (AC-2, AC-3) |
| Session totals | Server, the in-memory tally, one per server process | `UsageResponse` (new, shared) on `GET /api/usage` | The page footer | Footer shows "Session usage unavailable" (AC-20) |
| Tally start time | Server, when the tally is created at start | `UsageResponse.startedAt` | The footer's "since" prefix | As for session totals (AC-20) |
| Refresh signal | The page: a run request settling in this tab, or the window regaining focus | None (client-side) | The page's usage request | Runs from other tabs and clients show at the next trigger (EC-17) |

Order: the server adds a run's ok results to the tally before it sends the run's 200 response
(AC-5), and the page requests the totals again only after the run's response or error has arrived
(AC-22). So the footer's next value always includes the run the user just made.

## Ownership

| Part | Package | Module spec |
|---|---|---|
| `UsageResponse` contract, session tally, `GET /api/usage` | `ai-sandbox` (single package, `src/shared`, `src/server`) | The "Server module" part of this file, below |
| Footer, its states, refresh triggers, format helpers | `ai-sandbox` (`src/web`) | The "Web module" part of this file, below |

## Untrusted inputs

| Input | Origin | Reaches | Handling |
|---|---|---|---|
| Token counts and cost of each call | OpenRouter, through the adapter, whose response schema already accepts only finite numbers and a nullable cost | Summed into the tally, then shown in the footer | Added as reported; the adapter is unchanged. A negative value is accepted with no handling (OpenRouter does not send one). If it ever makes a total break the non-negative `UsageResponse` limits, the route answers 500 with the generic message and never sends the value (AC-27). Rendered as text (AC-30). |
| `GET /api/usage` request | Any local client: the server binds `127.0.0.1`, has no login and sends no CORS headers | The usage route | No body, query or header is read (NFR-2). The response holds numbers and a timestamp only, never the key or an error text (NFR-3). Read-only, so a cross-site request has no effect. `Cache-Control: no-store` (AC-25). |
| `UsageResponse` body in the browser | The server, through the Vite proxy | The footer | Validated against `UsageResponse` on receipt; a mismatch shows "Session usage unavailable" (AC-20). Rendered as text (AC-30). |
| LLM pipeline | — | — | None: the feature sends nothing to a model and builds no prompt. Output handling in the run route is unchanged. |

## Open questions

| ID | Question | Accepted answer (2026-11-03) | Status |
|---|---|---|---|
| OQ-1 | How does an ok result with no cost count (discovery Q1)? | Its tokens are added, the cost sum is unchanged, and it is counted in `unpricedCalls`. The footer adds "(N calls without cost)" while that count is above 0 (AC-14, AC-16). | resolved |
| OQ-2 | What does `UsageResponse` hold (Q2)? | `inputTokens`, `outputTokens`, `costUsd`, `okCalls`, `unpricedCalls` and `startedAt`; see the Server module part. | resolved |
| OQ-3 | One token number or two in the footer (Q3)? | One: input plus output. The API returns both (AC-10). | resolved |
| OQ-4 | How are tokens and cost formatted (Q4)? | Tokens grouped in the browser locale; cost by the result cards' rule, so the task's "$0.004" reads "$0.0040" (AC-11, AC-12). | resolved |
| OQ-5 | When is a run's usage added (Q5)? | Once per run, after all its results are in and before the `POST /api/runs` response is sent (AC-5). | resolved |
| OQ-6 | Is the session per tab or per server (Q6)? | Per server process, fed by every client; the "since" prefix shows it (AC-1, AC-33). | resolved |
| OQ-7 | Which model calls count (Q7)? | `POST /api/runs` results only; later features decide in their own spec (Non-goals). | resolved |
| OQ-8 | Where does the tally live (Q8)? | Inside the runs module, one tally per app instance; no layer rule changes (Server module part, NFR-4). | resolved |
| OQ-9 | Does a run count if the client gives up (Q9)? | Yes, when the server finishes it. The footer refreshes on any settled run, success or error (AC-28, AC-22). | resolved |
| OQ-10 | Priorities (Q10)? | P1: the tally of ok results, errors adding nothing, the route, the footer text, reset on restart, nothing persisted, totals updated before the run response. P2: loading, error and zero states, the unpriced rule, refresh triggers. P3: the accepted UX proposals P1 and P2. Criteria Q10 does not name take the priority of the group they refine (see the note above the AC table). | resolved |

---

# Session usage — server module
Spec ID: SPEC-2026-11-03-session-usage · Umbrella: [`docs/specs/session-usage.md`](#spec-session-usage) (this file) · Status: approved (2026-11-03)

## Scope

Covers AC-1 to AC-8, AC-14, AC-15, AC-25 to AC-28, AC-31 and AC-32 of the umbrella. The shared
contracts gain `UsageResponse`; `RunRequest`, `RunResponse` and `RunResult` are unchanged. The
OpenRouter adapter and `MockProvider` are unchanged.

## Contracts

`UsageResponse` is defined once in the shared contracts and imported by the route and the page
(never redeclared):

| Field | Type | Rule |
|---|---|---|
| `inputTokens` | integer ≥ 0 | Sum of `inputTokens` over every counted ok result |
| `outputTokens` | integer ≥ 0 | Sum of `outputTokens` over every counted ok result |
| `costUsd` | number ≥ 0 | Unrounded sum of `costUsd` over every counted ok result whose cost is not null |
| `okCalls` | integer ≥ 0 | Number of ok results counted |
| `unpricedCalls` | integer ≥ 0 | Number of counted ok results whose `costUsd` was null; never more than `okCalls` |
| `startedAt` | string | ISO 8601 date-time (UTC) when this tally was created, that is when the server started |

## Route

`GET /api/usage`: no body, no query. Responses: `200` with `UsageResponse` (the Zod `response`
schema sits on the route), and the generic `500` from the app's error handler. Header
`Cache-Control: no-store` on the 200.

## Module placement

The tally, the service method that reads it and the route belong to the existing runs module
(discovery Q8). No new module, no new layer, and no change to the layer rules in `CLAUDE.md`. The
tally is created when the app is composed, once per app instance, so each test's app has its own.

## Requirements (EARS)

| ID | Requirement | Covers |
|---|---|---|
| R-SRV-1 | WHEN a run that passed validation has all its results, the run service shall add to the tally, for each `status: 'ok'` result, its `inputTokens`, its `outputTokens`, its `costUsd` when not null, and 1 to `okCalls`. | AC-1 |
| R-SRV-2 | The run service shall apply a run's additions before it returns the run's response, so that the route sends the 200 only after the tally holds them. | AC-5 |
| R-SRV-3 | The run service shall add nothing to the tally for a `status: 'error'` result, whatever the error (provider error, missing key, timeout, unexpected error). | AC-2 |
| R-SRV-4 | IF the run request fails body validation, names an unknown model, or the model catalog is unavailable, THEN the run service shall leave the tally unchanged. | AC-3 |
| R-SRV-5 | WHEN `GET /api/usage` is requested, the route shall call one service method and return the current tally as `UsageResponse`, reading no body, query or header and calling no provider. | AC-4 |
| R-SRV-6 | WHEN several runs finish in any order, the run service shall apply each run's additions exactly once to the current totals, so that no addition is lost or counted twice. | AC-6 |
| R-SRV-7 | WHEN an app instance is built, the app shall create a new tally with every count at 0 and `startedAt` set to that moment, shared by nothing else. | AC-7 |
| R-SRV-8 | The tally shall exist only in the process's memory; the server shall write no tally value to a file, a database, the environment or the log. | AC-8 |
| R-SRV-9 | IF an ok result's `costUsd` is null, THEN the run service shall add its tokens, add 1 to `okCalls` and 1 to `unpricedCalls`, and leave `costUsd` unchanged. | AC-14 |
| R-SRV-10 | WHEN an ok result's `costUsd` is 0 or its token counts are 0, the run service shall add those values as reported and leave `unpricedCalls` unchanged. | AC-15 |
| R-SRV-11 | WHEN the route answers `GET /api/usage` with 200, the route shall set `Cache-Control: no-store`. | AC-25 |
| R-SRV-12 | The tally shall keep `costUsd` as the plain running sum of the added costs, with no rounding on the server. | AC-26 |
| R-SRV-13 | IF the tally does not meet the `UsageResponse` schema when serialized, THEN the route shall fail through the app's error handler, so that the client receives 500 "Internal server error" and no tally value. | AC-27 |
| R-SRV-14 | IF the client disconnects during a run, THEN the run service shall still add the run's ok results when its results are in, whether or not the response can be delivered. | AC-28 |
| R-SRV-15 | The README shall carry the text changes listed under "Documentation changes" below. | AC-31 |
| R-SRV-16 | The `CLAUDE.md` folder map shall name the usage tally and `GET /api/usage` on the `modules/runs/` line. | AC-32 |

---

# Session usage — web module
Spec ID: SPEC-2026-11-03-session-usage · Umbrella: [`docs/specs/session-usage.md`](#spec-session-usage) (this file) · Status: approved (2026-11-03)

## Scope

Covers AC-9 to AC-13, AC-16 to AC-24, AC-29, AC-30, AC-32, AC-33 and AC-34 of the umbrella. Uses
the `UsageResponse` contract from the Server module part. The History section, the run flow and
the query client's global defaults are unchanged.

## Requirements (EARS)

| ID | Requirement | Covers |
|---|---|---|
| R-WEB-1 | The API client shall fetch `GET /api/usage` through its existing request helper and validate the body against `UsageResponse`, so that an unreachable server, an error status or a mismatched body becomes a failed request. | AC-20 |
| R-WEB-2 | The page shall read the tally through one TanStack Query hook, started when the page mounts; the footer receives the tally from it and no component copies it into local state. | AC-10 |
| R-WEB-3 | WHEN the usage query has data, the footer shall render "<tokens> tokens · <cost>" from it. | AC-10 |
| R-WEB-4 | A plain token helper, tested without React, shall return `inputTokens + outputTokens` grouped by thousands with the browser locale. | AC-11 |
| R-WEB-5 | The footer shall format `costUsd` with the same cost function the result cards use, so that one rule serves both. | AC-12 |
| R-WEB-6 | The page shall render the footer as a `<footer>` element placed after `<main>`, outside it, so that it is the page's `contentinfo` landmark. | AC-13 |
| R-WEB-7 | A plain helper shall return " (<N> calls without cost)" when `unpricedCalls` is N ≥ 1 and an empty string at 0, and the footer shall append it after the cost. | AC-16 |
| R-WEB-8 | WHILE the usage query's data is all zeros, the footer shall render "Session since <time>: 0 tokens · $0" with no suffix. | AC-17 |
| R-WEB-9 | WHILE the usage query has neither data nor an error, the footer shall render the muted text "Session: loading…". | AC-18 |
| R-WEB-10 | WHILE the usage query refetches with data present, the footer shall render that data and no loading text. | AC-19 |
| R-WEB-11 | IF the usage query's latest fetch failed, THEN the footer shall render the muted text "Session usage unavailable" and no button; the query keeps the global "no automatic retry" default. | AC-20 |
| R-WEB-12 | The footer shall render no `role="alert"`, no `role="status"` and no `aria-live` attribute, so that the page's existing alert counts are unchanged. | AC-21 |
| R-WEB-13 | WHEN the run mutation settles, on success or on error, the page shall invalidate the usage query. | AC-22 |
| R-WEB-14 | The restore, delete and clear handlers shall neither invalidate nor refetch the usage query. | AC-23 |
| R-WEB-15 | WHILE the run mutation is pending, the usage query's data shall stay as it was: no invalidation when a run starts and no optimistic update. | AC-24 |
| R-WEB-16 | WHILE the viewport is 40rem wide or narrower, the footer shall use the narrow padding and wrapping in the Layout section, so that the page has no horizontal scroll. | AC-29 |
| R-WEB-17 | The footer shall render every value as React text, never through `dangerouslySetInnerHTML` or a Markdown renderer. | AC-30 |
| R-WEB-18 | The usage hook, the footer and their helpers shall write to no `localStorage`, `sessionStorage` or cookie, and the usage query's cache shall not be persisted. | AC-9 |
| R-WEB-19 | A plain time helper shall format `startedAt` as a local time of day in hours and minutes with the browser locale, and the footer shall start with "Session since <time>: ". | AC-33 |
| R-WEB-20 | The usage query shall turn on refetch on window focus for itself, leaving the global default (off) in the query client unchanged. | AC-34 |
| R-WEB-21 | The `CLAUDE.md` folder map shall list the usage hook, the footer component and its format helper. | AC-32 |

## Data access

The tally is server data, so it goes through `lib/api-client.ts` and TanStack Query like the model
list, never through `useState` or browser storage. Footer text rules (token total and grouping,
the unpriced suffix, the start time) are plain functions next to the footer component, unit-tested
without React. The cost rule is the existing card rule, not a copy.

## Layout

No design screen exists. The numbers come from the page's existing styles and discovery G15.

- **Placement:** a `<footer>` after `<main>` (not inside it), below the History section. Not
  sticky, not fixed; it scrolls with the page.
- **Container:** the same column as `main`: max-width 64rem, centred, horizontal padding 1rem
  (0.75rem at ≤40rem), bottom padding 1rem. Not full-bleed. The text starts at the same left edge
  as the page heading.
- **Separator:** a top border `1px solid var(--border)`, as wide as the column's content (the
  column's padding excluded). The space from the History section to the border is 1.5rem (main's
  1rem bottom padding plus 0.5rem), the page's usual gap between blocks. The text sits 0.75rem
  below the border.
- **Text:** one paragraph, muted (`var(--muted)`), 0.875rem, regular weight, `margin: 0`; the
  loading and error texts use the same style. No icon, no button.
- **≤40rem:** the paragraph wraps between words inside the column; nothing sets `nowrap`, so the
  page has no horizontal scroll.
- **Departures:** there is no design to depart from. The task's example "Session: 12 400 tokens ·
  $0.004" becomes "Session since <time>: <tokens> tokens · <cost>" by the accepted answers Q4 and P1.

---

## Documentation changes

These ship in the same commit as the feature, per the rules in `docs/specs/README.md`:
- `README.md`: in the opening paragraph, replace "stores nothing" with "stores nothing on disk;
  keeps an in-memory usage tally reset on restart". Add a short note on the footer: it shows the
  tokens and cost since the server started; every tab and client feeds the same tally; it resets
  on every restart, including each `tsx watch` restart under `npm run dev`; it counts only usage
  reported for successful results, so it can be lower than the OpenRouter bill (a failed or
  timed-out call may still be billed); calls that report no cost are counted as "calls without
  cost".
- `CLAUDE.md` folder map: on the `modules/runs/` line, mention the usage tally and the
  `GET /api/usage` route; under `hooks/`, add `use-usage.ts`; under `components/`, note the footer
  component and its plain format helper (for example `SessionFooter.tsx` and `usage-format.ts`).
  The layer rules do not change.

## Test hints

- Server: route tests build a fresh app per test with `MockProvider` (NFR-4). AC-5: `inject` the
  POST, await it, then `inject` the GET. AC-6: hold several provider calls on deferred promises,
  fire two or more POSTs together, release them in a different order, then check the GET.
- AC-14 and AC-15: a `MockProvider` whose `respond` returns `costUsd: null`, `costUsd: 0` and
  zero tokens. AC-27: a `respond` returning a negative token count, then expect 500 with
  "Internal server error" and no number in the body.
- AC-7 compares `startedAt` against a time taken just before building the app; AC-25 checks the
  response header.
- Web: the fetch stub in `src/web/App.test.tsx` (lines 38–46) throws on any URL other than
  `/api/models` and `/api/runs`, and line 105 expects exactly 2 fetch calls; the stub must answer
  `/api/usage`, and call counts should count only the route under test. The restore and
  delete/clear tests in `src/web/App.history.test.tsx` (around lines 366–378 and 570–574) take a
  call count before the action; they stay valid because the usage request is made on mount, before
  that count is taken (AC-23).
- AC-21: tests that expect exactly one `alert` (the model-list error tests) must still find one
  while the footer is in its error state.
- AC-34: drive TanStack Query's focus manager (or dispatch `visibilitychange`) in jsdom and count
  usage requests.
- AC-11 and AC-33 depend on the locale: the helpers' unit tests compare against
  `Intl.NumberFormat` / `Intl.DateTimeFormat` output for a fixed locale rather than hard-coding
  the machine's locale.
- AC-8, AC-29, AC-31 and AC-32 are manual checks: a restart shows a zero tally with a new "since"
  time and no new file in the project; a 40rem-wide window shows no horizontal scroll; the README
  and `CLAUDE.md` read as above.
