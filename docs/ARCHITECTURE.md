# Architecture

A build-time static site. There is no backend and no runtime network call: sample data is bundled into the JavaScript at build time by Vite.

```mermaid
flowchart LR
  subgraph data["data/sample/ (fake)"]
    G[grok-bot-usage.json]
    C[cursor-usage.csv]
    A[azure-cost-management.csv]
  end
  subgraph adapters["src/adapters/"]
    GA[grok-bot.ts]
    CA[cursor.ts]
    AA[azure.ts]
    IDX["index.ts<br/>loadAllUsage()"]
  end
  S["src/schema/usage.ts<br/>UsageRecord + validateRecords()"]
  subgraph app["src/app/ + index.html"]
    AGG[aggregation<br/>week / assistant / top N / filter]
    CH[Chart.js views]
  end
  G --> GA
  C --> CA
  A --> AA
  GA & CA & AA --> S
  S --> IDX --> AGG --> CH
  CH --> DIST[(dist/ static files)]
```

## Pieces

- **Schema** (`src/schema/usage.ts`): the one contract. `UsageRecord { date, source, assistant_or_project, units, unit_type, cost_usd }`, `validateRecord(s)` with clear errors, and the `UsageAdapter` interface (async `load()`).
- **Adapters** (`src/adapters/<source>.ts`): one per source. Each parses its raw, source-shaped sample (`data/sample/`, named after each source's native export), maps to `UsageRecord`, and validates. The `REAL DATA PLUGS IN HERE` comment marks where a live export would replace the sample read.
- **Registry** (`src/adapters/index.ts`): `loadAllUsage()` runs every adapter and concatenates results. It's the only thing the app imports from the data layer.
- **Aggregation** (`src/aggregate.ts`): pure functions over `UsageRecord[]`: spend by ISO week (Monday start, computed from the calendar date), spend by assistant, top consumers, week-over-week, and filtering by source. Pure so it's unit-testable without a browser. Other tracks should import this module rather than reimplementing it.
- **Views** (`index.html`, `src/app/`): Chart.js charts for spend by week (trend lines), spend by assistant, top consumers, plus the source filter controls.
- **Build**: `vite build` produces `dist/` with relative asset paths (`base: './'`) so it can be served from any folder. The Pages workflow overrides this with `VITE_BASE=/usage-dashboard-trial/` and publishes `dist/` to GitHub Pages (Jose's approved v2 exception). No other deploy or custom domain.

## Quality gates

- **CI** (`.github/workflows/ci.yml`, GitHub Actions, `permissions: contents: read`): `npm ci` → typecheck → hard-limits scan → tests with coverage thresholds → build → assert `dist/index.html` exists → bundle-size budget → documentation link check. Runs on pull requests and pushes to `main`. Dependabot is configured (config file only) for npm and GitHub Actions.
- **Tests** (Vitest): schema validation, each adapter against its sample, aggregation, a DOM-level render test of the dashboard (happy-dom), and the limits scanner.
- **Limits scanner** (`scripts/limits.ts`): secrets and hardware-identifier patterns, run as part of `npm test` and as a separate named CI step.
