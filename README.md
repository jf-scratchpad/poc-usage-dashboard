# usage-dashboard-trial

A static web dashboard of AI usage and spend **per assistant** and **per week**, with trend lines, budgets, forecasts, and anomaly detection. Sources: **Grok Bot**, **Cursor**, **Azure Cost Management**, and a fictional **LLM API (direct)** source.

> **Sample data only.** No real accounts, credentials, tokens, or runtime network calls to usage APIs. This is a one-day trial repo (CD-4, Wed Nov 25, 2026) and its v2 follow-on, and nothing else depends on it.

## Viewing the site

- **GitHub Pages** (no local install): [https://jf-scratchpad.github.io/usage-dashboard-trial/](https://jf-scratchpad.github.io/usage-dashboard-trial/). All numbers are fictional sample data. The published site is reachable by anyone with the link. If that URL 404s, Pages still needs a one-time enablement: Settings → Pages → Source: GitHub Actions.
- **Locally:** `npm ci`, then `npm run dev` (hot reload) or `npm run build` && `npm run preview`. Opening `dist/index.html` as a file does not work (browsers block ES modules from `file://`).

The Pages workflow (`.github/workflows/pages.yml`) builds with `VITE_BASE=/usage-dashboard-trial/` and deploys on every push to `main`. There is no custom domain and nothing else is deployed.

## Screens and routes

All routes are hash URLs, so they work under the GitHub Pages subpath with no server rewrites. Filters live in the query string inside the hash (`#/forecast?range=4w&src=cursor,grok-bot&q=Cody`). Defaults are omitted.

| Route | What you see |
| --- | --- |
| `#/` | Overview: summary tiles, weekly spend with a trend line, stacked spend by source, top 10 consumers |
| `#/assistant/<name>` | One assistant or project: share of spend, weekly breakdown by source, unit economics |
| `#/source/<id>` | One source: share of spend, weekly trend, assistants and projects in that source |
| `#/budgets` | Budget cards with progress, ok/warn/over badges, and projected end-of-period spend (`config/budgets.json`) |
| `#/forecast` | Next 4 weeks of spend with a 95% band (linear), plus EWMA for comparison |
| `#/anomalies` | Weeks whose spend is a statistical spike, with explanations and links |

Also: dark and light themes, CSV / JSON export of the current view, keyboard-accessible tables for every chart, and loading / empty / error states. Interaction details are in [docs/UI.md](docs/UI.md).

## Quick start

Requires Node 20 LTS (or newer) and npm.

```bash
npm ci            # install exact versions from package-lock.json
npm run dev       # local dev server with hot reload
npm run build     # static site in dist/
npm run preview   # serve dist/ locally to check the build
npm test          # unit tests with coverage thresholds
npm run test:e2e  # browser smoke tests against dist/ (system Chrome locally)
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Static build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Vitest unit tests with coverage thresholds |
| `npm run typecheck` | `tsc --noEmit` with strict TypeScript |
| `npm run collect` | Validate + dedupe every adapter, write `public/data/usage.v1.json` and `manifest.json` |
| `npm run collect:check` | Fail if the committed dataset is stale |
| `npm run check:limits` | Scan the repo for secrets, hardware identifiers, and key files |
| `npm run check:bundle` | Fail if the `dist/` bundle exceeds the size budget |
| `npm run check:links` | Check documentation links in README, docs, and decision/changelog files |
| `npm run test:e2e` | Browser smoke tests against the built `dist/` (uses system Chrome locally) |

CI (`.github/workflows/ci.yml`) runs `npm ci`, typecheck, the limits check, `collect:check`, tests with coverage thresholds, the build, a bundle-size budget check, a documentation link check, and end-to-end smoke tests, and confirms `dist/index.html` exists, on every pull request and every push to `main`.

## How the data flows

```
data/sample/<source>-*.*  →  src/adapters/<source>.ts  →  validateRecords()
 (raw, source-shaped)         (parse + map to schema)      (src/schema/usage.ts)
        ↓
npm run collect  →  public/data/usage.v1.json + manifest.json
        ↓
src/data/load.ts  →  engines (aggregate, budgets, forecast, anomaly, allocation)
        ↓
src/ui/  (hash-routed views, Chart.js)
```

The site fetches `./data/manifest.json` and `./data/usage.v1.json` from the same origin (relative URLs, so this works under `/usage-dashboard-trial/`). If that fails, it falls back to the bundled sample adapters. There is still no call to any live usage API.

Every adapter turns its source's raw format into the common `UsageRecord`:

| Field | Type | Meaning |
| --- | --- | --- |
| `date` | `string` | Calendar day, `YYYY-MM-DD` |
| `source` | `'grok-bot' \| 'cursor' \| 'azure' \| 'llm-api'` | Which collector produced it |
| `assistant_or_project` | `string` | Assistant, model, or Azure project/resource group |
| `units` | `number` (≥ 0) | Quantity used |
| `unit_type` | `string` | What `units` counts (tokens, requests, messages…) |
| `cost_usd` | `number` (≥ 0) | Cost in US dollars |

`validateRecord` / `validateRecords` throw a `UsageValidationError` naming the bad record and field (bad date, negative cost or units, unknown source, empty name).

## Budgets and forecast

- **Budgets** (`src/budgets.ts`, `config/budgets.json`): each budget has a scope (total, one source, or one assistant), a period (week or month), and a USD limit. The engine reports spend so far, percent used, a straight-line run-rate projection, and an alert level (`ok` under 80%, `warn` at 80%, `over` at 100%). The Budgets view shows the current period only; the date-range filter does not apply there.
- **Forecast** (`src/forecast.ts`): fits the weekly spend history and projects the next 4 weeks. The Forecast view uses ordinary least squares with a 95% band, and shows exponential smoothing (EWMA) for comparison.
- **Anomalies** (`src/anomaly.ts`): a rolling z-score over recent weeks (the current week is excluded from its own baseline) flags spend spikes, with a minimum dollar delta so tiny series don't fire.

Details, formulas, and the other engines (allocation, data quality, insights) are in [docs/analytics.md](docs/analytics.md).

## Where real data would plug in

Each adapter implements `UsageAdapter { source; load(): Promise<UsageRecord[]> }`. Today `load()` reads a bundled sample file. To go live, replace only the read step inside `load()` (or run `npm run collect` against exported files in the same shape); the mapping, validation, and app stay the same. Never commit credentials; a real collector would run outside this static site (for example a scheduled export job) and write `public/data/usage.v1.json`.

| Source | Adapter | Sample file | Real data would come from |
| --- | --- | --- | --- |
| Grok Bot | `src/adapters/grok-bot.ts` | `data/sample/grok-bot-usage.json` | Grok Bot plan usage export (per-bot / per-routine usage) |
| Cursor | `src/adapters/cursor.ts` | `data/sample/cursor-usage.csv` | Cursor dashboard usage export (team/admin usage CSV) |
| Azure | `src/adapters/azure.ts` | `data/sample/azure-cost-management.csv` | Azure Cost Management export or Cost Details API (daily, by resource group/meter) |
| LLM API | `src/adapters/llm-api.ts` | `data/sample/llm-api-usage.csv` | A direct model-API usage export (tokens); this source is fictional and vendor-neutral |

Each adapter file marks the exact plug-in spot with a `// REAL DATA PLUGS IN HERE` comment; [docs/adapters.md](docs/adapters.md) has the per-source details. The sample covers 2026-08-31 to 2026-11-22, so tiles that talk about the "latest week" are anchored to Nov 22, not today.

## Adding a source

1. Append the id to `SOURCES` in `src/schema/usage.ts`.
2. Add a `SOURCE_META` entry in `src/adapters/sources.ts` (label, unit, color, description). Typecheck fails until this exists.
3. Write `src/adapters/<id>.ts` implementing `UsageAdapter`, mapping raw rows to `UsageRecord`, with a `// REAL DATA PLUGS IN HERE` comment.
4. Add a fictional sample under `data/sample/` and register the adapter in `BUILTIN_ADAPTERS` in `src/adapters/registry.ts`.
5. Add `tests/adapters/<id>.test.ts`, run `npm run collect` to refresh `public/data/`, and note anything unusual in `DECISIONS.md`.

Do not hard-code a `Record<Source, …>` elsewhere; use the registry or `emptyBySource()` from `src/aggregate.ts`. Full detail is in [docs/adapters.md](docs/adapters.md#adding-a-source).

## Hard limits (enforced in CI)

`tests/limits.test.ts` (logic in `scripts/limits.ts`) fails the build on private key blocks, common token formats (GitHub, Slack, AWS, `sk-` keys, JWTs, Azure storage keys), hard-coded credentials, MAC addresses, serial-number / hardware-UUID fields, and committed `.env`, `.pem`, or key files.

## More

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit.
- [docs/UI.md](docs/UI.md): routes, views, filters, and test hooks.
- [docs/adapters.md](docs/adapters.md): each collector and its real-data plug-in point.
- [docs/analytics.md](docs/analytics.md): budgets, forecast, anomalies, allocation, data quality.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work in this repo.
- [CHANGELOG.md](CHANGELOG.md): 1.0.0 (trial) and 2.0.0 (this follow-on).
- [DECISIONS.md](DECISIONS.md): every notable choice and why.
