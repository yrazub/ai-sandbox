# Workflow retro ledger

One row per retro, so runs can be compared over time. Tokens are the deduplicated measurement (each request counted once); "in" includes cache write and cache read.

| date | label | agents | in→out tok | cache hit | wall | parallelism | cost | top recommendation |
|------|-------|--------|-----------|-----------|------|-------------|------|--------------------|
| 2026-11-03 | session-usage-run1-v1.0.0 | 17 (+7 orchestrator sessions) | 15.32M→0.32M | 90.7% | 48.1 min | 0.85× | $12.78 (API-equiv.) | Make run-plan's commands pass headless Bash policy (no `$S` variable, plain `npm` when node is already v26) so phase 1 is not blocked |
