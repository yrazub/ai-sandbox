## Workflow Retro — session-usage-run1-v1.0.0

**Run:** one spec-driven run of `session-usage` on sdd-engineering 1.0.0, driven headlessly (one `claude -p` per stage) · 7 sessions, 17 sub-agent runs (all depth 1, none nested) · mode multi-agent · data: deep

Base `51c9cbd`, 7 commits (`8568275` spec, `cba827b` plan, `a329686`/`723b5d0`/`79b2666` phases 1–3, `eee8252` plan amendment, `698df19` README). Final state: typecheck, 236 tests and build green; plan-verifier PASS on its second run; architecture review "no findings"; spec `Status: approved (2026-11-03)`.

**Data caveat.** Token figures are the supplied measurement, which counts each model request once (grouped by `message.id`). `analyze_journals.py` sums every content-block event and over-counts tokens (naive total 38.77M = 2.48× the real 15.63M). I used it only for tool calls, spans, parallelism and launch order. Its per-run token and hit% columns are not quoted below. No per-agent or per-stage dollar figures: the CLI reports one API-equivalent total, and I did not verify prices.

### Metrics

| | input | cache write | cache read | output | total |
|---|---:|---:|---:|---:|---:|
| orchestrator (7 sessions, 98 req) | 210 | 313 986 | 5 755 063 | 60 546 | 6 129 805 |
| sub-agents (17 runs, 168 req) | 344 | 1 105 072 | 8 140 859 | 258 005 | 9 504 280 |
| **all (266 req)** | 554 | 1 419 058 | 13 895 922 | 318 551 | **15 634 085** |

**Cache hit** (cache read ÷ input + cache write + cache read): all 90.7%, orchestrator 94.8%, sub-agents 88.0%. Healthy; nothing is breaking the prefix cache.
**Totals:** wall 48.1 min · parallelism 0.85× (Σ sub-agent spans 2 446 s ÷ wall 2 886 s) · sub-agent tool calls 778 (Read 446, Bash 90, Grep 88, Edit 70, Glob 38, Skill 26, Write 20; orchestrator calls not counted) · cost $12.78 API-equivalent (estimate, paid by subscription) · $1.83 per commit, $0.38 per acceptance criterion (derived).

**By stage**

| stage | min | tokens (orch + sub) | share | notes |
|---|---:|---:|---:|---|
| s1 discovery | 3.6 | 520 305 | 3.3% | spec-creator ×1 |
| s2 spec | 6.6 | 878 573 | 5.6% | spec-creator ×1 |
| s3 review | 5.6 | 1 705 092 | 10.9% | planner review pass |
| s4 plan | 9.2 | 2 187 234 | 14.0% | planner plan pass |
| s5-1 run-plan | 1.0 | 480 688 | 3.1% | **blocked at phase 1, no code** |
| s5-2 run-plan | 12.3 | 5 649 184 | 36.1% | 3 phases × (implementer → test-writer), arch review |
| s5-3 run-plan | 9.8 | 4 213 009 | 26.9% | final checks |

**By agent type** (measurement)

| agent | runs | requests | total tokens | share |
|---|---:|---:|---:|---:|
| orchestrator | 7 | 98 | 6 129 805 | 39.2% |
| implementation-planner | 3 | 46 | 3 549 594 | 22.7% |
| test-writer | 3 | 31 | 1 550 963 | 9.9% |
| implementer | 4 | 32 | 1 370 707 | 8.8% |
| architecture-reviewer | 2 | 19 | 1 015 479 | 6.5% |
| plan-verifier | 2 | 17 | 970 892 | 6.2% |
| spec-creator | 2 | 19 | 878 582 | 5.6% |
| doc-writer | 1 | 4 | 168 063 | 1.1% |

By model: sonnet-5-5 9.22M (59%), opus-5-5 6.41M (41%), which includes 190k opus output tokens against 128k for sonnet. The measurement does not say which agent ran on which model, so I make no per-agent model call.

**Launch order** (from journal timestamps; ‖ = same message)
`spec-creator(discover)` → `spec-creator(write)` → `planner(review)` → `planner(plan)` → `implementer p1 [blocked]` → *new session* → `implementer p1` → `test-writer p1` → `implementer p2` → `test-writer p2` → `implementer p3` → `test-writer p3` → `arch-reviewer` → *new session* → `plan-verifier ‖ arch-reviewer` → `planner(amend)` → `plan-verifier(re-run)` → `doc-writer`

| run | tools | span |
|---|---:|---:|
| spec-creator discovery | 68 | 180 s |
| spec-creator write | 50 | 340 s |
| planner review | 90 | 312 s |
| planner plan | 110 | **435 s** (longest single agent) |
| implementer p1 (blocked) | 16 | 26 s |
| implementer p1 / test-writer p1 | 52 / 46 | 54 / 127 s |
| implementer p2 / test-writer p2 | 56 / 38 | 63 / 114 s |
| implementer p3 / test-writer p3 | 44 / 46 | 55 / 90 s |
| arch-reviewer (end of s5-2) | 30 | 76 s |
| plan-verifier #1 ‖ arch-reviewer #2 | 22 ‖ 44 | 209 ‖ 108 s |
| planner amend | 16 | 59 s |
| plan-verifier #2 | 18 | 164 s |
| doc-writer | 32 | 34 s |

**Critical path:** s5-2 (12.3 min), a strictly serial chain of 6 build agents plus the reviewer. The only parallel pair in the whole run is verifier ‖ arch-reviewer, launched 3 s apart. The 440 s between wall and Σ spans is orchestrator time and stage gaps.

### What went well
- **The review pass paid for itself.** The planner's review (s3) found that TanStack v5's default focus listener only watches `visibilitychange`, so "window regains focus" (AC-34) would not fire in a visible window beside a terminal. That became Q2 and the `focusManager.setEventListener` design, confirmed in the run's insight notes. It was a real defect caught before any code existed.
- **Build phases were clean.** 3 phases, 3 commits, the suite growing 202 → 222 → 236 tests, and only trivial deviations (a renamed closure constant, a re-indent). Architecture review passed with no findings.
- **The orchestrator recovered from the nvm block.** In s5-2 it found `node` was already v26, checked that `npm run typecheck` and `npm test` ran without nvm, reset phase 1 from `blocked`, and put that into later briefs. After that the implementers and test-writers ran Bash without trouble.
- **The verifier was strict where it should be.** All three gaps in its first run were plan-text mismatches, and the code and tests were right. The amend pass (plan text only, no new phase) closed them in one round.
- **Cache efficiency is high** (90.7%) and there are no nested agents to hide cost.

### What was hard / wasteful
1. **Headless Bash policy broke the plugin's own commands (the biggest friction).** Permission denials: 16 per the measurement; my scan of orchestrator transcripts and sub-agent journals found 21 denied results (6 in s5-1, 6 in s5-2, 9 in s5-3; not reconciled with the measurement). By cause:
   - `source ~/.nvm/nvm.sh && nvm use`: 12 denials, 10 of them in sub-agents. This is the command `CLAUDE.md` tells every shell to run first.
   - `S='node …/state.mjs'; $S start …`: 3 denials, the first call of all three run-plan sessions ("a variable can't be checked"). The skill's own snippet fails every time.
   - Compound `git merge-base …; git check-ignore .sdd`: 2 denials (s5-1, s5-3). One commit command with quoted text: 1.
   - Sub-agent calls that differ from the allowlist: 2 plain `git -C … status` calls by test-writer p3 (the same call twice) and 1 `python3` heredoc used to edit a test file.
2. **s5-1 was a whole wasted stage.** The phase 1 implementer could not run a baseline, so it wrote no code and the run stopped as `blocked`. That cost 480 688 tokens (3.1%), 1.0 min and a driver restart, and s5-2 then redid phase 1. The state file was left blocked and the orchestrator had to reset it.
3. **Agents retried a denied command.** The phase 1 implementer tried four variants of `source nvm`. The re-verify plan-verifier tried five variants (nvm ×2, typecheck ×2, full verify) and still could not re-run the plan's Verify commands. In both final-check runs the orchestrator had to run them itself (`typecheck 0, 236/236, build 0`). The verifier's "re-run each Verify command" duty never ran as designed.
4. **The architecture review ran twice on the same code.** The first run was at the end of s5-2 as the phase 3 gate. The second ran in s5-3 as a final check, after all three phases were committed and only docs (plan amendment, README) changed afterwards. Both said "no findings". The pair cost 1 015 479 tokens (6.5%); the second run is roughly half of that, about 0.5M (my estimate, not measured per run).
5. **Forced session break with nothing left to batch.** `per_chat` is 3 and the plan has exactly 3 phases, so s5-2 stopped at "CHECKPOINT" after phase 3 and s5-3 started cold to do the final checks. The orchestrator sessions of s5-2 and s5-3 held 2.39M and 2.38M tokens of context traffic each (about 60k and 72k per request on average), 78% of all orchestrator tokens. I cannot split out how much of s5-3 was rebuilding context.
6. **Duplicated reads.** Counting `Read` calls across the 17 sub-agent journals:
   - `docs/specs/session-usage.md` (34 KB): 18 reads by 9 agents.
   - `docs/plans/session-usage.md` (45 KB): 10 reads by 5 agents.
   - `.sdd/session-usage/change.patch` (141 KB): 14 reads by the 2 verifiers.
   - `src/web/App.history.test.tsx` (25 KB): 22 reads by 6 agents.
   - The patch is `git diff 51c9cbd`, so the spec and plan make up 699 of the 1 956 inserted lines (36%), and 132 more are the re-indent in `App.tsx`. The verifiers pay to read documents they already open separately. I cannot say whether the 14 reads are offset chunks of one file or true re-reads.
7. **Docs written twice.** Plan phase 3 gave `README.md` and `CLAUDE.md` text to the implementer (it recorded a README deviation: "split opening sentence… added 'and has no login'"). Then the doc-writer rewrote the README's "malformed opening sentence" in `698df19`.
8. **The plan amendment loop.** The verifier's three gaps were: the plan's `visibilitychange` test event could not reach the `window` listener, the history test needed two entries rather than one, and the plan missed `query-client.test.ts`. The orchestrator added a fourth fix: the plan's "Context read" row said `query-client.ts` was unchanged, while Q2 changes it. All were plan-internal inconsistencies. From verifier #1 ending (15:11:23) to verifier #2 ending (15:16:15) was 4.9 min, about 10% of the whole run's wall time, spent correcting text.
9. **Spec and plan now disagree.** AC-24 in the approved spec (line 98) says the footer "shall keep showing the totals it showed when the run started" during a run. The planner's review marked this conflicting with AC-34 and EC-17. The accepted answer Q1 says a window-focus refetch *may* update the footer during a run, and the orchestrator then made no spec change ("none of the accepted answers required it"). The plan tests AC-24 only without a focus event. The spec text still reads as an absolute.
10. **Governance in headless mode.** The orchestrator approved the spec for the user, took the recommended answer on every question (Q1–Q10, G1–G16, then Q1–Q5, R1–R6), and approved the plan amendment, including a fourth replacement the verifier had not asked for. The s2 orchestrator also reported that it did not re-read the full spec text, only its Status lines and Open questions. That is by design for a script-driven run, but "approved" in this repo does not mean a human approved it.
11. **Pre-code cost and unverified UI.**
    - Discovery, spec, review and plan (s1–s4) used 5.29M tokens (33.8%) against 2.92M (18.7%) for implementers and test-writers. The spec has 34 ACs and 378 lines and the plan 321 lines. Production code is about 200 lines, the rest being tests (about 970 lines) and docs.
    - Manual checks (restart, 375 px layout, real-browser focus) were all recorded as "skipped (headless run)". No one has seen the footer or the focus refetch in a real browser.

### Recommendations (actionable)
1. **`sdd-engineering:run-plan` SKILL.md — remove the `S='node …/state.mjs'; $S …` pattern and the compound git preflight.** Give the literal `node <abs>/state.mjs …` command each time and issue `git merge-base`, `git rev-parse`, `git check-ignore` as separate single commands. → removes 3 guaranteed denials per run-plan session and the unchecked preflight (branch freshness, `.sdd` ignored) in s5-1 and s5-3.
2. **run-plan preflight for Node — verify once, then pass the proven command in every brief.** Before phase 1 the orchestrator runs `node -v` and `npm run typecheck` plain, and if node is v26 tells agents "do not source nvm; run `npm …` directly". Also add this exception to the project `CLAUDE.md` Node section ("if `node -v` already prints v26, skip nvm"). Alternative: the driver script allows `Bash(source ~/.nvm/nvm.sh*)`. → avoids a repeat of s5-1 (480k tokens, 3.1%, one restart) and 12 nvm denials.
3. **Briefs for implementer, test-writer and plan-verifier — "if a Bash call is denied, do not retry variants; report the exact command and stop (implementer) or continue read-only (verifier)".** For the verifier add: "the orchestrator runs the Verify commands and passes you their output". → ends the 4- and 5-variant retry loops and makes the Verify duty explicit instead of silently failing.
4. **run-plan — skip the final architecture review when the phase gate already passed at the same code state.** Record the HEAD (or the code-file hash) at the gate and rerun only if code files changed since. → about 0.5M tokens (3%) and one agent per run. (If the final review is kept for its "whole-change" role, make the phase 3 gate the one to skip, not both.)
5. **run-plan — do not checkpoint when no phases remain.** If `per_chat` ≥ the number of pending phases (here 3 = 3), continue straight into the final checks in the same session; or default `per_chat` above the plan's phase count. → saves one cold start and one headless session boundary on small plans.
6. **run-plan — generate `change.patch` for the verifier without the spec and plan** (`git diff <base> -- . ':!docs/plans' ':!docs/specs'`) and name the changed files in the brief. → the patch drops from 1 956 to about 1 257 inserted lines (-36%), and 14 patch reads get cheaper.
7. **`sdd-engineering:implementation-planner` — keep README and `CLAUDE.md` prose out of implementer phases.** Put a "docs owned by doc-writer" row in the plan instead. → no double writing of the README, a smaller phase 3 for the implementer.
8. **`sdd-engineering:implementation-planner` plan pass — add a consistency check before saving:** every file named in a Q answer must appear in a file row; no "Context read: unchanged" row for a file some phase edits; test descriptions state the observable condition, and leave jsdom event mechanics as hints. → would have prevented the 4 plan-text gaps and the 4.9 min / planner + verifier re-run.
9. **Spec/plan workflow — an answer that relaxes an AC goes back through `sdd-engineering:spec-creator`'s write pass instead of "no spec change".** For this feature, the follow-up is to edit AC-24 / R-WEB-15 to "except a window-focus refetch" so the approved spec matches Q1 and the code. → the approved spec and the shipped behaviour agree.
10. **Headless driver — record that approvals were script-taken.** Have the driver stamp the spec/plan with "approved by script, standing answers" (or leave the Status as draft) and queue the manual browser checks as a follow-up list. → keeps "approved" meaningful and makes the unverified UI visible.

Considered and not recommended: overlapping test-writer N with implementer N+1. Only phase 1 → 2 touches disjoint trees (server tests vs web code), saving about 1 min of 48, and concurrent `npm test` runs in one worktree would blur failures.

Applying any of these (skill, agent briefs, `CLAUDE.md`, the AC-24 spec edit) is a separate step; none was done by this retro.

### Ledger
Appended to `docs/retros/ledger.md` (row: 2026-11-03 · session-usage-run1-v1.0.0 · 17 agents · 15.32M→0.32M tok · 90.7% · 48.1 min · 0.85× · $12.78).
