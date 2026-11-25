# Decisions

Every notable choice and why. Newest additions go at the bottom of their section.

## Stack and tooling

- **Node 20 LTS, TypeScript (strict), npm with a committed `package-lock.json`, Vite, Chart.js, Vitest.** The approved stack for the trial. Reproducible installs (`npm ci`), one language end to end, fast static builds, and a small charting library with line and bar charts built in.
- **No backend, no runtime network calls.** The data is sample-only and bundled at build time, so a static site is enough and there's nothing to secure or host.
- **No ESLint.** Optional in the stack; skipped to save setup time on a one-day trial. `tsc --strict` (plus `noUncheckedIndexedAccess`) catches most of what matters here.
- **Vite 6, Vitest 3, TypeScript 5.9, Chart.js 4.** Current major versions at the time, all supporting Node 20.
- **`base: './'` in Vite.** The built `dist/` uses relative paths, so it works from any folder without a server path config. No deploy target is assumed.
- **Box tooling ran Node 24 / npm 11; CI runs Node 20.** The lockfile (v3) is compatible with npm 10 on Node 20, and CI is the source of truth.
- **Hand-rolled CSV parser (`src/adapters/csv.ts`) instead of a library.** Stays on the approved stack with no extra dependency. Understands quoted fields, comment lines, and a BOM so the fictional headers in the sample CSVs are skipped.
- **Vanilla TypeScript for the UI, no framework.** Preferred for this small static dashboard; keeps the bundle and CI surface small.
- **happy-dom for DOM-level tests.** Lighter than launching a browser, and enough to assert the filter, table, tiles, and chart canvases once CanvasRenderingContext2D is stubbed for Chart.js.

## Schema

- **Fields: `date`, `source`, `assistant_or_project`, `units`, `unit_type`, `cost_usd`.** The minimum that supports per-week, per-assistant, and per-source views. `unit_type` was added to the brief's list because units differ by source (tokens vs. requests vs. messages) and summing them blindly would mislead.
- **One record = one day × one source × one assistant/project.** Daily grain is what the source exports provide, and it rolls up cleanly to weeks.
- **`date` is a plain `YYYY-MM-DD` string, validated as a real calendar day.** No time zones in the data; avoids `Date` parsing surprises.
- **Cost in USD (`cost_usd`).** One currency makes totals and cross-source comparisons valid. The sample data is in USD; a real source billed in another currency (Azure can be) would convert in its adapter.
- **`source` is a closed union (`'grok-bot' | 'cursor' | 'azure'`).** Typos fail fast; adding a source is a deliberate change (see README).
- **Validation throws `UsageValidationError` naming the record index and field.** Bad sample or real data should stop the build or test run with a clear message instead of silently skewing charts. Zero units/cost are allowed (free days); negatives are not.
- **`UsageAdapter.load()` is async (`Promise<UsageRecord[]>`).** Sample adapters could be sync, but real collectors (API exports, downloads) are async, so the interface won't need to change when real data plugs in.

## Aggregation and views

- **Week = ISO week starting Monday, computed from the calendar date (equivalent to UTC).** A standard, locale-independent definition, so the same data gives the same weekly buckets for everyone. The week-year follows the ISO Thursday rule.
- **"This week" / "last week" tiles use today's date in America/New_York.** Record dates have no time zone, but the summary should follow Jose's local week rather than UTC.
- **Four views: spend by week (one line per source plus a dashed total), spend by assistant, top consumers, source filter.** Exactly the brief's list.
- **`src/aggregate.ts` is the canonical rollup module.** Collectors did not add a second copy; the web app's helpers are the ones to import.
- **Units are summed even when `unit_type` differs, and the table labels that as "mixed units".** Cost is always USD and is the ranking key; mixed unit counts would otherwise look like a single quantity.
- **The assistant bar chart caps at 15 rows; the top-consumers table caps at 10.** Keeps the layout readable when collectors later return long tails.
- **Tiles and trend axis are anchored to the latest data day when the data ends before today** (`dataAsOf` in `src/app/dates.ts`, added in integration). The sample stops on Sun 2026-11-22, so anchoring to today (Wed Nov 25) drew a fake $0 week and a -100% week-over-week. With live data the latest day is today, so the America/New_York rule above still applies.
- **The page renders an empty state when `loadAllUsage()` returns no records.** That path remains for an empty export; collectors now feed the charts from the bundled sample data.

- **One ~600 kB JS bundle; Vite's 500 kB chunk-size warning is accepted.** Most of it is the bundled sample data plus Chart.js. Code-splitting a single-page static trial isn't worth the complexity.
- **Sample file names follow each source's native export** (`grok-bot-usage.json`, `cursor-usage.csv`, `azure-cost-management.csv`) rather than the brief's `data/sample/<source>.*`. Docs were updated to match instead of renaming the collectors' files.

## Data and security

- **Sample data only, clearly fake.** The trial forbids real account access; sample files are realistic in shape (they mimic each source's export format) so adapters exercise real parsing.
- **Hard limits enforced in CI by a repo scanner (`scripts/limits.ts`, `tests/limits.test.ts`).** Catches private keys, common token formats, hard-coded credentials, MAC addresses, serial-number/hardware-UUID fields, and key/env files. Test fixtures are assembled at runtime so the test file doesn't trip itself.
- **`package-lock.json` is not content-scanned.** It's generated and full of integrity hashes; it is still checked by file name like everything else.
- **CI uses `permissions: contents: read` and pinned major versions of official actions (`actions/checkout@v4`, `actions/setup-node@v4`).** Least privilege; no secrets are used in CI at all.

## Collectors

- **Sample data covers 2026-08-31 through 2026-11-22 (12 weeks) with weekday/weekend variation, a gentle upward trend, and three invented spikes** (mid-September Azure OpenAI, mid-October coding push, mid-November pre-trial week). IDs use the obviously fake placeholder `00000000-0000-0000-0000-000000000000`.
- **Vite JSON import for Grok Bot; `?raw` imports for the Cursor and Azure CSVs.** Sample data is bundled at build time. There is no filesystem access and no network call at runtime.
- **Cursor events roll up to one record per day × project.** The native export is finer-grained (kind/model); the schema is one day × source × assistant/project.
- **Azure line items roll up to one record per day × project tag (`unit_type` is `USD`).** Cost Management meters use incomparable units (hours, GB, tokens), so summing quantities would mislead. `units` equals the summed `PreTaxCost`. The project comes from `Tags.project`, falling back to `ResourceGroup`.
- **Azure dates accept `YYYY-MM-DD` and `yyyyMMdd`; non-USD currency is rejected.** Some Cost Management Query API responses use compact `UsageDate` values. Currency conversion belongs at the real-data plug-in point, not in the static app.

## Process

- **Repo identity: Jose's own GitHub App `cody-grok-scratchpad`, not Cursor cloud agents.** The Cursor GitHub App isn't installed on the `jf-scratchpad` org, and Jose chose to use his own app for this trial. Work runs as three parallel local executors (collectors, web app, quality) on the box with short-lived installation tokens; the key never enters the repo.
- **Initial scaffold pushed straight to `main`.** The repo was empty, so a base commit was needed before any branch or PR could exist. Everything after that goes through `grok/*` branches and PRs.
- **Self-merge after green CI, merge commits only, no force pushes.** Jose's approved exception for this repo, today only, until 6 PM ET (work stops at 5:50 PM ET).

## v2 data platform (track A)

- **Adapter registry with a typed metadata table (`Record<Source, SourceMeta>` + `satisfies`).** Adding a source to `SOURCES` makes typecheck fail until it has a label, unit, and color, so the UI can't silently miss it. UI label/color maps are derived from the registry.
- **4th source is `llm-api`, a vendor-neutral "direct model API" source, not a named provider.** Proves the plugin path while staying vendor agnostic; sample is fictional (`model-large-sample`, `model-small-sample`). Units are input + output tokens.
- **`npm run collect` runs through Vite's own SSR module loader (`scripts/collect.mjs`), not tsx.** Adapters use Vite `?raw`/JSON imports; reusing Vite (already a dependency) resolves them identically to the site build with no new dependency.
- **Collected JSON lives in `public/data/` and is committed; a test regenerates it and fails if stale.** Keeps CI untouched (no workflow edit) while guaranteeing the shipped dataset matches the adapters. Run `npm run collect` after changing sample data.
- **Deterministic manifest (`generated_at` = last data day, midnight UTC).** Byte-identical rebuilds; a wall-clock timestamp would make the staleness test flaky.
- **Dedupe on day × source × assistant × unit type; exact duplicates (within 5e-7) dropped and counted, conflicting ones are errors.** Silent last-wins would hide double-exported or mismatched rows.
- **The site fetches its own static `./data/*.json` (same origin, relative URL) with a bundled fallback.** This is not an external network call: no third-party host, credential, or API. Fallback via dynamic import keeps the initial JS chunk ~195 kB instead of ~640 kB.
- **Source metadata split into `src/adapters/sources.ts`.** The UI imports labels/colors without importing the adapters (and their bundled samples).
- **Budgets: straight-line run-rate projection, inclusive 80%/100% thresholds, assistant budgets matched case-insensitively across sources.** Simple and explainable; cross-source matching is what makes "Cody's total spend" possible. Config is JSON in `config/` so it's editable without code.
- **Forecast: hand-written OLS + simple exponential smoothing, no stats library.** Both are a few lines, explainable in docs/analytics.md, and exactly testable against hand-computed series; a dependency would add weight without accuracy on 12 points.
- **Anomalies: rolling z-score over the prior N weeks (current week excluded) with a σ floor and a minimum dollar delta.** Excluding the current week keeps a spike from inflating its own baseline; the floors stop near-constant or tiny series from flagging cents. Spikes only, since overspend is what matters for cost.
- **Allocation merges assistant/project names case-insensitively across sources; unit economics never mixes unit types.** Gives the per-assistant cross-source view with no alias config for fictional data; mixing requests/tokens/USD would make cost per unit meaningless.
- **Manifest carries a data-quality block (coverage and gap days per source); gaps are warnings, not failures.** A missing export day otherwise reads as $0 spend; failing the build on a weekend with no usage would be wrong.
- **`buildInsights()` composes the engines in one pure call.** Gives the UI one tested entry point for an overview panel instead of re-wiring five modules.

## v2 GitHub Pages (track C)

- **Jose approved publishing this site to GitHub Pages today** (this repo only). No other deploy, DNS, or custom domain.
- **Vite `base` stays `'./'` locally and in CI; the Pages workflow sets `VITE_BASE=/usage-dashboard-trial/`.** Relative paths keep `vite preview` working; the absolute project path is what GitHub Pages needs at `https://jf-scratchpad.github.io/usage-dashboard-trial/`.
- **`.github/workflows/pages.yml` uses official actions** (`actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`) on `push` to `main` and `workflow_dispatch`. Checkout and setup-node stay at `@v4`, same as CI. `pages: write` and `id-token: write` are granted only on the deploy job; the build job also has `pages: write` because `upload-pages-artifact` requires it. Workflow-level permissions stay `contents: read`.
- **Creating the Pages site via `POST /pages` also requires `administration:write`.** The app has `pages: write` (GET returns 404 until a site exists) but not Administration, so enablement is a one-time Settings → Pages → Source: GitHub Actions click (or a later grant of Administration). The workflow does not set `enablement: true`, which would fail for the same reason. Repo visibility will not be changed if the org plan does not support private Pages.

## v2 quality gates (track C)

- **`@vitest/coverage-v8` (official Vitest coverage provider).** Enforces a coverage floor in `npm test` (88% lines/statements/functions, 80% branches). The browser bootstrap (`src/ui/main.ts`) is excluded because end-to-end tests cover those paths. Justified as the official provider for the already-approved Vitest runner; no second test framework.
- **Bundle-size budget after `vite build`.** Caps the largest JS asset at 900 KiB (200 KiB gzip) and `dist/` at 2 MiB. That is a regression budget with headroom after the v2 code-split (initial chunk is much smaller; the adapters fallback chunk is the largest JS). Implemented as a small `scripts/bundle-budget.ts` with no new dependency (`vite-node` already comes with Vite).
- **Markdown link checker** (`scripts/check-links.ts`, no new dependency). Relative links in README, DECISIONS, CONTRIBUTING, CHANGELOG, `docs/`, and `data/sample/` must resolve to files; `http(s)` links are syntax-checked only, not fetched, so CI does not depend on the live Pages URL or the network.
- **`collect:check` is now a CI step.** Track A's collect pipeline already had the script; quality CI runs it so a stale `public/data/` dataset fails the build.
- **End-to-end smoke tests use Playwright against the built site, driven by Vitest (not the Playwright Test runner).** Locally the tests launch the box's already-installed Google Chrome via `channel: 'chrome'` (no browser download). CI installs Playwright's Chromium once, with the install cached on `package-lock.json`, on `ubuntu-24.04` rather than `ubuntu-latest` (which is Ubuntu 26.04; Playwright 1.65 has no official Chromium build for that image). Playwright is a new devDependency, justified because puppeteer-core would still need a CI browser and Playwright's install/cache path is the one the brief already allows. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set on `npm ci` so a regular install never fetches a browser.
- **Dependabot config only** (`.github/dependabot.yml`) for `npm` and `github-actions`, weekly, no auto-merge. Keeps actions and the lockfile from going stale without adding a bot identity or extra permissions.

## UI v2 (track B)

- **Own ~150-line hash router (`src/ui/router.ts`) instead of a framework or router library.** Hash routes (`#/assistant/Cody?range=4w`) work from any subpath, including GitHub Pages' `/usage-dashboard-trial/`, with no server rewrites and no new dependency.
- **All global filters live in the URL query inside the hash, and defaults are omitted.** Every view is a shareable link; the back button undoes discrete filter changes, while assistant-search typing uses `replaceState` so it doesn't flood history.
- **Default range is "All time"; presets 4w/12w are whole ISO weeks ending with the latest data week.** Week buckets and the chart axis line up, and the current partial week stays visible.
- **Views and Chart.js load through dynamic `import()`; the bundled sample adapters are a fallback chunk.** The initial JS dropped from ~615 kB to ~27 kB; Chart.js (~177 kB) and the sample data (~424 kB) load only when needed (the sample only when `data/usage.v1.json` is missing, via track A's `loadUsageData`).
- **Okabe–Ito color-blind-safe palette for charts, assigned by position in `SOURCES`, plus a distinct dash pattern and point shape per series.** Nothing depends on color alone, and new sources get a color automatically. Registry colors remain the source of truth for anything else.
- **Every chart has its data as a `<table>` inside `<details>`, expanded when printing.** Screen-reader, keyboard, and print users get the same numbers, and export reuses those tables.
- **CSV export = the view's primary table; JSON export = every table on the view plus the filters and URL.** CSV cells that start with `= + - @` get a leading `'` to prevent spreadsheet formula injection.
- **Theme is `html[data-theme]`, toggled by a button and saved in `localStorage` (`ud-theme`); first visit follows the OS preference.** Charts re-render on toggle so axis and grid colors match.
- **v1 UI removed once v2 covered every view** (`src/app/render.ts`, `charts.ts`, `main.ts`, `styles.css` and their test). `index.html` boots `src/ui/main.ts`; `src/app/format.ts` and `dates.ts` stay as shared helpers.
- **`tests/ui/bundle-boundaries.test.ts` fails if the UI entry point statically reaches Chart.js, an adapter (other than `sources.ts` metadata), sample data, or a view module.** Keeps the initial chunk small as tracks add modules.
- **Drill-down pages pin their subject and bypass the one filter that could hide it.** `#/assistant/<name>` ignores the assistant search (dates and sources still apply); `#/source/<id>` ignores the source filter and shows a note when that source is unchecked. Otherwise a shared link could open on an empty page.
- **Assistant names match case-insensitively across sources** (same rule as track A's allocation), so "Cody" in Grok Bot and "cody" in LLM API are one assistant with one rank. Units are never added across unit types; cost per unit is shown per source and unit type.
- **Budgets view evaluates the current week/month as of the latest data day and ignores the date-range filter.** Budgets are absolute limits for a period, so a custom range would make "spent" meaningless. The source filter hides source budgets for unchecked sources and the assistant search narrows assistant budgets; "All AI spend" budgets always show. Status is text + icon + color, and each bar is an ARIA `progressbar` with the projected end-of-period value as a marker.
- **Forecast view uses track A's linear forecast with its 95% band, and shows the EWMA total alongside for comparison** instead of a method switch, so the URL and export stay deterministic. Fewer than 3 complete weeks of history shows a "widen the range" empty state.
- **Anomalies view combines total, source, and assistant anomalies from track A's rolling z-score, newest first, each with its explanation and a drill-down link;** flagged weeks are marked with triangles on the weekly line (shape, not just color).
