# AI Sandbox

A local, single-user tool: enter one prompt, pick several LLM models from OpenRouter, run them
side by side and compare the answers with their time, tokens and cost. One page, one backend
module, no database, no login.

## Node

The project needs **Node 26**, pinned in `.nvmrc` and `engines`. Check the version first:

```
node -v    # v26.x → run npm directly, no nvm needed
```

Only if it prints another version, switch with `source ~/.nvm/nvm.sh && nvm use` (nvm does not
switch by itself). Do not put it in front of every command: a session that cannot approve shell
commands refuses `source`.

## Commands

| | |
|---|---|
| `npm run dev` | API on `127.0.0.1:4000` and Vite on `:5173` (proxies `/api`) |
| `npm test` | all tests, once. No network, no credits |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Vite build into `dist/` (git-ignored) |

## Secrets

`OPENROUTER_API_KEY` lives in `.env`, which is git-ignored. Never open, print, log or commit it.
The server boots without it; a run then reports `OPENROUTER_API_KEY is not set` on every card.
The key must never reach an API response, an error message or the client bundle.

## Folder map

```
src/shared/contracts.ts      Zod schemas and limits used by both server and web
src/server/
  index.ts                   entry: loads .env, reads config, builds the provider, listens
  app.ts                     composition root: Fastify, error handler, wires the run module
  platform/                  config.ts (env parsing), errors.ts (AppError and subclasses)
  adapters/openrouter/       openrouter-provider.ts (real), mock-provider.ts (test double)
  modules/runs/              ports.ts, domain.ts, model-catalog.ts, service.ts, routes.ts
src/web/
  main.tsx, App.tsx          App only composes the page
  components/                one exported component per file, plus the plain helpers next to them
  hooks/                     use-models.ts, use-run-models.ts (TanStack Query), use-history.ts
  lib/                       api-client.ts, query-client.ts, history-storage.ts (localStorage)
docs/plans/                  approved plans
docs/specs/                  feature specs (see docs/specs/README.md)
```

## Layers and imports

Server dependencies point inward only: `shared` and `domain` / `ports` ← `service` /
`model-catalog` ← `routes` / `adapters` ← `app.ts` / `index.ts`.

- `src/shared/` imports only `zod`. A shape that crosses the wire is defined once there, never
  redeclared in `server/` or `web/`.
- `domain.ts` and `ports.ts` are pure: no Fastify, no `fetch`, no adapters, no `platform/`.
- `LlmProvider` lives in `modules/runs/ports.ts`, not in `src/shared/`, because the browser must
  never see it.
- `service.ts` and `model-catalog.ts` receive the ports they use as arguments. They never build an
  adapter and never import Fastify.
- Only `routes.ts` and `app.ts` import Fastify. A route handler takes parsed input, calls one
  service method and returns a contract. Zod `body` / `response` schemas sit on the route; never
  call `Schema.parse(request.body)` by hand.
- Services throw `AppError` subclasses; the one error handler in `app.ts` renders them. Only an
  `AppError` message is shown to the user; anything else becomes a generic message.
- An adapter implements a port, translates errors into `AppError`, and decides nothing. Its mock
  implements the same port.
- Only `index.ts` and `app.ts` (and tests) write `new SomeAdapter()`. Secrets are read lazily, at
  call time, so the server boots without a key.
- `platform/` never imports from `modules/`. One module never imports another.
- `src/web/` imports `src/shared/` and never `src/server/`; `src/server/` never imports `src/web/`.

Frontend:

- Imports go one way: `lib` and plain helpers ← `hooks` ← `components` ← `App.tsx`.
- Components receive data and callbacks; they do not call `fetch`. All requests go through
  `lib/api-client.ts`, and all server data through TanStack Query. Never copy server data into
  `useState`.
- Run history is browser-owned data in `localStorage`, nothing on the server. Only
  `lib/history-storage.ts` touches `localStorage`; components read history through
  `hooks/use-history.ts`, never directly. Stored data is validated on read.
- Business rules (search, price and cost formatting) are plain functions next to their component,
  unit-tested without React.
- Model output renders as plain text, never as HTML or Markdown.
- The layout is flat. Add a `features/` folder only when a second page appears.

## Naming

Source files are `kebab-case.ts`; React components are `PascalCase.tsx`. Contract fields are
`camelCase`. A Zod schema and its inferred type share one name (`RunRequest`).

## Testing

- Tests sit next to the file they cover: `*.test.ts`, `*.test.tsx`.
- No test touches the network or spends credits. `src/web/test-setup.ts` replaces `fetch` with a
  rejecting function before each test; a test that needs `fetch` stubs it.
- Server tests use `MockProvider` (or a stubbed `fetch` for the OpenRouter adapter itself). Route
  tests go through `app.inject`.
- Component tests start with `// @vitest-environment jsdom`; server tests run in node.
- A real call to OpenRouter is checked by hand with the app, never in `npm test`.

## Specs and plans

Plans live in `docs/plans/`, feature specs in `docs/specs/`. Read `docs/specs/README.md` before
writing one.
