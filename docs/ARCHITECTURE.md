# Architecture

A build-time static site with no backend. `npm run collect` turns the fictional sample exports into a versioned JSON dataset in `public/data/`; the site loads that same-origin file (falling back to the adapters bundled in a lazy chunk) and runs pure engines in the browser. Nothing contacts a third-party host, account, or API.

```mermaid
flowchart LR
  subgraph samples["data/sample/ (fictional)"]
    G[grok-bot-usage.json]
    C[cursor-usage.csv]
    A[azure-cost-management.csv]
    L[llm-api-usage.csv]
  end
  subgraph adapters["src/adapters/"]
    AD["grok-bot · cursor · azure · llm-api<br/>parse + map + validateRecord()"]
    REG["registry.ts (adapters)<br/>sources.ts (labels, units, colors)"]
  end
  PIPE["src/data/pipeline.ts + quality.ts<br/>validate all rows · dedupe · sort · coverage"]
  OUT[("public/data/<br/>usage.v1.json + manifest.json")]
  LOAD["src/data/load.ts<br/>loadUsageData()"]
  subgraph engines["pure engines (src/)"]
    AGG[aggregate]
    BUD["budgets<br/>+ config/budgets.json"]
    FC[forecast]
    AN[anomaly]
    AL[allocation]
    INS[insights]
  end
  UI["src/ui/ views<br/>overview · assistant · source · budgets · forecast · anomalies"]
  G & C & A & L --> AD --> REG
  REG -- "npm run collect (build time)" --> PIPE --> OUT
  OUT -- "fetch ./data/* (same origin)" --> LOAD
  REG -. "fallback: dynamic import" .-> LOAD
  LOAD --> engines --> UI
  UI --> DIST[(dist/ static files → GitHub Pages)]
```

## Pieces

- **Schema** (`src/schema/usage.ts`): the one contract. `UsageRecord { date, source, assistant_or_project, units, unit_type, cost_usd }`, `validateRecord(s)` with clear errors, and the `UsageAdapter` interface (async `load()`). `SOURCES` lists the four sources.
- **Adapters** (`src/adapters/<source>.ts`): one per source. Each parses its raw, source-shaped sample (`data/sample/`), maps to `UsageRecord`, and validates. The `REAL DATA PLUGS IN HERE` comment marks where a live export would replace the sample read.
- **Registry** (`src/adapters/registry.ts`, metadata in `sources.ts`): registered adapters plus each source's display name, unit type, and color. `loadAllUsage()` (`src/adapters/index.ts`) runs every registered adapter. See [adapters.md](adapters.md), "Adding a source".
- **Collect + load** (`scripts/collect.mjs`, `src/data/`): see "v2 data platform" below.
- **Aggregation** (`src/aggregate.ts`): pure functions over `UsageRecord[]`: spend by ISO week (Monday start), spend by assistant, top consumers, week-over-week, and filtering by source.
- **Engines** (`src/budgets.ts`, `forecast.ts`, `anomaly.ts`, `allocation.ts`, `insights.ts`): pure and unit-tested; the math is in [analytics.md](analytics.md).
- **Views** (`index.html`, `src/ui/`): hash-routed v2 UI (overview, assistant drill-down, source detail, budgets, forecast, anomalies) with Chart.js; `src/app/format.ts` and `dates.ts` remain as shared helpers.
- **Build**: `vite build` produces `dist/` with relative asset paths (`base: './'`) so it can be served from any folder. The Pages workflow overrides this with `VITE_BASE=/usage-dashboard-trial/` and publishes `dist/` to GitHub Pages (Jose's approved v2 exception). No other deploy or custom domain.

## Quality gates

- **CI** (`.github/workflows/ci.yml`, GitHub Actions, `permissions: contents: read`): `npm ci` → typecheck → hard-limits scan → tests with coverage thresholds → build → assert `dist/index.html` exists → bundle-size budget → documentation link check → Playwright e2e smoke tests (system Chrome locally; cached Chromium in CI). Runs on pull requests and pushes to `main`. Dependabot is configured (config file only) for npm and GitHub Actions.
- **Tests** (Vitest): schema validation, each adapter against its sample, aggregation, a DOM-level render test of the dashboard (happy-dom), and the limits scanner.
- **Limits scanner** (`scripts/limits.ts`): secrets and hardware-identifier patterns, run as part of `npm test` and as a separate named CI step.

## v2 data platform (track A)

The diagram at the top shows the whole flow. Details:

- **Registry** (`src/adapters/registry.ts`, metadata in `sources.ts`): every source's display name, unit type, color, and adapter. See docs/adapters.md, "Adding a source".
- **Collect** (`npm run collect` → `scripts/collect.mjs` → `scripts/collect-run.ts`): runs every registered adapter through `normalizeBatches()`, which validates every row (all errors reported at once, with source, index, and a row snippet), drops exact duplicates on the natural key day × source × assistant × unit type, and fails on conflicting duplicates. Writes a versioned dataset and a manifest (counts, date range, per-source totals, schema version). `generated_at` is derived from the last data day, so output is byte-identical across runs; a test fails if the committed files are stale.
- **Load** (`src/data/load.ts`): the site fetches `./data/manifest.json` then the dataset it names, re-validates, and checks the record count. On any problem it falls back to the bundled adapters through a dynamic import, which also keeps ~440 kB of raw samples out of the initial chunk.
- **Engines** (pure, documented in [analytics.md](analytics.md)): `src/budgets.ts` + `config/budgets.json` (burn, % used, run-rate projection, ok/warn/over).
- `src/forecast.ts`: next 4 weeks of spend per source or total, linear (OLS + prediction interval) or EWMA, with a low/high band.
- `src/anomaly.ts`: rolling z-score spike detection per total, source, or source × assistant.
- `src/allocation.ts`: per-assistant cost across sources, cost per unit, and one assistant's weekly drill-down.
- `src/data/quality.ts` (coverage and gaps, also summarized in the manifest) and `src/insights.ts` (`buildInsights()`, one call over every engine).
