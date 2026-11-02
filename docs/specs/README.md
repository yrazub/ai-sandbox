# Specs

One folder for feature specs. Plans for the work itself live in `docs/plans/`.

## Layout

One file per feature: `docs/specs/<feature-name>.md`, with a `kebab-case` name that matches the
branch (`feature/<feature-name>`).

## What a spec holds

| Section | Content |
|---|---|
| Goal | What the user can do afterwards, in a sentence or two |
| Scope | What is in, and a table of what is out with the reason |
| Acceptance criteria | A table with an ID (`AC-1`, `AC-2`, …) and one testable criterion each |
| API / contracts | Request and response shapes. These go into `src/shared/contracts.ts` |
| Decisions | A table: `D-1`, the decision, the reason |
| Open questions | Anything unresolved. Empty before the spec is approved |

A criterion says what is observed, not how it is built: "When the user runs, the server calls
every selected model in parallel", not "use `Promise.all`".

## Rules

- A spec has a `Status:` line under its title: `draft`, `approved` or `done`, with a date.
- Do not start implementing a spec that is still `draft`.
- Every acceptance criterion needs a test or a manual check, named when the work is finished.
- If the work changes a rule in `CLAUDE.md` (a layer, a limit, a command), change it in the same
  commit.
- A spec records decisions that are not visible in the code. It does not repeat the code.
