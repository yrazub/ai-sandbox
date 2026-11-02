# AI Sandbox

Enter one prompt, pick several models from [OpenRouter](https://openrouter.ai), run them in
parallel and compare the answers side by side: text, time, tokens and cost.

It is a local, single-user tool. The server listens on `127.0.0.1` only, keeps no history and has
no login. Results live on screen and a reload clears them.

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
