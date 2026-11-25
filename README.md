# usage-dashboard-trial

A static web dashboard of AI usage and spend **per assistant** and **per week**, with trend lines, across three sources: **Grok Bot**, **Cursor**, and **Azure Cost Management**.

> **Sample data only.** No real accounts, credentials, tokens, or runtime network calls. This is a one-day trial repo (CD-4, Wed Nov 25, 2026) and its v2 follow-on, and nothing else depends on it. The static site is published to GitHub Pages at [https://jf-scratchpad.github.io/usage-dashboard-trial/](https://jf-scratchpad.github.io/usage-dashboard-trial/) once Pages is enabled for this repo.

## What you get

- **Spend by week**: a weekly trend line (ISO weeks, Monday start), per source plus a total.
- **Spend by assistant**: total cost per assistant or project.
- **Top consumers**: the highest-cost assistants/projects, with cost and units.
- **Source filter**: show Grok Bot, Cursor, Azure, or any mix.
- **Empty state**: if `loadAllUsage()` returns no records, the page still renders and explains that none have loaded.

## Quick start

Requires Node 20 LTS (or newer) and npm.

```bash
npm ci            # install exact versions from package-lock.json
npm run dev       # local dev server with hot reload
npm run build     # static site in dist/
npm run preview   # serve dist/ locally to check the build
```

Open `dist/index.html` through `npm run preview` (browsers block ES modules from `file://`).

## Viewing the site

- **GitHub Pages** (no local install): [https://jf-scratchpad.github.io/usage-dashboard-trial/](https://jf-scratchpad.github.io/usage-dashboard-trial/). All numbers are fictional sample data. The published site is reachable by anyone with the link.
- **Locally:** `npm ci`, `npm run build`, then `npm run preview`. Opening `dist/index.html` as a file does not work (browsers block ES modules from `file://`).

The Pages workflow (`.github/workflows/pages.yml`) builds with `VITE_BASE=/usage-dashboard-trial/` and deploys on every push to `main`. Enable Pages once under Settings → Pages → Source: GitHub Actions if it is not on yet.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Static build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | All Vitest tests (schema, adapters, aggregation, limits, workflow) with coverage thresholds |
| `npm run typecheck` | `tsc --noEmit` with strict TypeScript |
| `npm run collect` | Validate + dedupe every adapter, write `public/data/usage.v1.json` and `manifest.json` (`collect:check` fails if they are stale) |
| `npm run check:limits` | Scan the repo for secrets, hardware identifiers, and key files |
| `npm run check:bundle` | Fail if the `dist/` bundle exceeds the size budget |
| `npm run check:links` | Check documentation links in README, docs, and decision/changelog files |

CI (`.github/workflows/ci.yml`) runs `npm ci`, typecheck, the limits check, `collect:check`, tests with coverage thresholds, the build, a bundle-size budget check, and a documentation link check, and confirms `dist/index.html` exists, on every pull request and every push to `main`. The limits scanner still runs as its own named step and as part of `npm test`.

## Data flow

```
data/sample/<source>-*.*  ->  src/adapters/<source>.ts  ->  validateRecords()  ->  loadAllUsage()  ->  src/aggregate.ts + src/app (charts)
 (raw, source-shaped)        (parse + map to schema)       (src/schema/usage.ts)  (src/adapters/index.ts)   (Chart.js, static)
```

Every adapter turns its source's raw format into the common `UsageRecord`:

| Field | Type | Meaning |
| --- | --- | --- |
| `date` | `string` | Calendar day, `YYYY-MM-DD` |
| `source` | `'grok-bot' \| 'cursor' \| 'azure'` | Which collector produced it |
| `assistant_or_project` | `string` | Assistant, model, or Azure project/resource group |
| `units` | `number` (≥ 0) | Quantity used |
| `unit_type` | `string` | What `units` counts (tokens, requests, messages…) |
| `cost_usd` | `number` (≥ 0) | Cost in US dollars |

`validateRecord` / `validateRecords` throw a `UsageValidationError` naming the bad record and field (bad date, negative cost or units, unknown source, empty name).

## Where real data would plug in

Each adapter implements `UsageAdapter { source; load(): Promise<UsageRecord[]> }`. Today `load()` reads a bundled sample file. To go live, replace only the read step inside `load()`; the mapping, validation, and app stay the same. Never commit credentials; a real collector would run outside this static site (for example a scheduled export job) and write a file in the same shape as the sample.

| Source | Adapter | Sample file | Real data would come from |
| --- | --- | --- | --- |
| Grok Bot | `src/adapters/grok-bot.ts` | `data/sample/grok-bot-usage.json` | Grok Bot plan usage export (per-bot / per-routine usage) |
| Cursor | `src/adapters/cursor.ts` | `data/sample/cursor-usage.csv` | Cursor dashboard usage export (team/admin usage CSV) |
| Azure | `src/adapters/azure.ts` | `data/sample/azure-cost-management.csv` | Azure Cost Management export or Cost Details API (daily, by resource group/meter) |

Each adapter file marks the exact plug-in spot with a `// REAL DATA PLUGS IN HERE` comment; [docs/adapters.md](docs/adapters.md) has the per-source details. The sample covers 2026-08-31 to 2026-11-22, so the weekly tiles are anchored to the latest data day (Nov 22) rather than today; with live data they follow today in America/New_York.

## Adding a source

1. Add the id to `SOURCES` in `src/schema/usage.ts`.
2. Add a raw sample file under `data/sample/`, named after the source's export (fake data only).
3. Write `src/adapters/<source>.ts` implementing `UsageAdapter`, mapping raw rows to `UsageRecord` and calling `validateRecords`.
4. Register it in `src/adapters/index.ts` so `loadAllUsage()` includes it.
5. Add `tests/adapters/<source>.test.ts` (parses the sample, validates, maps fields, rejects bad rows).
6. Note anything unusual in `DECISIONS.md`.

## Hard limits (enforced in CI)

`tests/limits.test.ts` (logic in `scripts/limits.ts`) fails the build on private key blocks, common token formats (GitHub, Slack, AWS, `sk-` keys, JWTs, Azure storage keys), hard-coded credentials, MAC addresses, serial-number / hardware-UUID fields, and committed `.env`, `.pem`, or key files.

## More

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit.
- [docs/adapters.md](docs/adapters.md): each collector and its real-data plug-in point.
- [DECISIONS.md](DECISIONS.md): every notable choice and why.
