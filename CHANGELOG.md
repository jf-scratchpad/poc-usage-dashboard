# Changelog

Versions in this file describe the product as built in this repo. They are not git tags or GitHub Releases.

## 2.0.1 — 2026-11-25

### Fixed

- The repository was renamed to `poc-usage-dashboard`, so the Pages build now uses `VITE_BASE=/poc-usage-dashboard/`. The old base made the published page load blank (scripts and styles pointed at `/usage-dashboard-trial/`). The site is now at https://jf-scratchpad.github.io/poc-usage-dashboard/.

## 2.0.0 — 2026-11-25

Usage Dashboard v2, still sample-data only, in the same private scratch repo.

### Data platform
- Adapter registry and a fourth fictional source, `llm-api` (vendor-neutral direct model-API usage).
- `npm run collect` writes a versioned `public/data/usage.v1.json` plus `manifest.json`; the site fetches those files with a bundled-adapter fallback.
- Budgets and alerts (`config/budgets.json`, ok/warn/over, run-rate projection).
- Weekly spend forecast (linear with a 95% band, plus EWMA).
- Rolling z-score anomaly detection.
- Cross-source allocation and unit economics.
- Data-quality report and a combined insights summary.

### UI
- Hash-routed multi-view site: overview, assistant drill-down, source detail, budgets, forecast, anomalies.
- Filters (date range, sources, assistant search) synced into the hash so every view is a shareable link.
- Dark/light theme, CSV/JSON export, print stylesheet, color-blind-safe palette, and a table behind every chart.
- Code-split bundles: the initial JS is the shell only; Chart.js, views, and the sample-data fallback load on demand.

### Quality and publishing
- Coverage thresholds (Vitest v8), a bundle-size budget, a documentation link checker, and Dependabot config for npm and GitHub Actions.
- End-to-end smoke tests against the built site (system Chrome locally; cached Playwright Chromium on `ubuntu-24.04` in CI).
- GitHub Pages workflow (`.github/workflows/pages.yml`) building with `VITE_BASE=/usage-dashboard-trial/`. Enabling the Pages site still needs a one-time Settings click (creating a site also requires `administration:write`, which the app does not have).

## 1.0.0 — 2026-11-25

The morning CD-4 trial: a working static dashboard of fictional AI usage and spend.

- Common `UsageRecord` schema and adapters for Grok Bot, Cursor, and Azure Cost Management, each with a `REAL DATA PLUGS IN HERE` marker and 12 weeks of sample data (2026-08-31 through 2026-11-22).
- Single-page view: spend by week (per source plus total), spend by assistant, top 10 consumers, and a source filter. Vanilla TypeScript + Vite + Chart.js.
- CI on GitHub Actions: typecheck, a repo-wide limits scanner (no secrets, no hardware identifiers), Vitest tests, and a static build. README, architecture note, and `DECISIONS.md`.
- Nothing was deployed in 1.0.0; the trial forbade deploys until Jose later approved GitHub Pages for this repo only.
