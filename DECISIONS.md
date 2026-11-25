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

## v2 GitHub Pages (track C)

- **Jose approved publishing this site to GitHub Pages today** (this repo only). No other deploy, DNS, or custom domain.
- **Vite `base` stays `'./'` locally and in CI; the Pages workflow sets `VITE_BASE=/usage-dashboard-trial/`.** Relative paths keep `vite preview` working; the absolute project path is what GitHub Pages needs at `https://jf-scratchpad.github.io/usage-dashboard-trial/`.
- **`.github/workflows/pages.yml` uses official actions** (`actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`) on `push` to `main` and `workflow_dispatch`. Checkout and setup-node stay at `@v4`, same as CI. `pages: write` and `id-token: write` are granted only on the deploy job; the build job also has `pages: write` because `upload-pages-artifact` requires it. Workflow-level permissions stay `contents: read`.
- **Creating the Pages site via `POST /pages` also requires `administration:write`.** The app has `pages: write` (GET returns 404 until a site exists) but not Administration, so enablement is a one-time Settings → Pages → Source: GitHub Actions click (or a later grant of Administration). The workflow does not set `enablement: true`, which would fail for the same reason. Repo visibility will not be changed if the org plan does not support private Pages.

## v2 quality gates (track C)

- **`@vitest/coverage-v8` (official Vitest coverage provider).** Enforces a coverage floor in `npm test` (88% lines/statements/functions, 80% branches). `src/app/main.ts` is excluded because it is the browser bootstrap; end-to-end tests cover that path. Justified as the official provider for the already-approved Vitest runner; no second test framework.
- **Bundle-size budget after `vite build`.** Caps the largest JS asset at 900 KiB (200 KiB gzip) and `dist/` at 2 MiB. That is a regression budget around today's ~635 KiB / ~109 KiB gzip bundle, with headroom for v2 UI before sample data is code-split. Implemented as a small `scripts/bundle-budget.ts` with no new dependency (`vite-node` already comes with Vite).
- **Markdown link checker** (`scripts/check-links.ts`, no new dependency). Relative links in README, DECISIONS, CONTRIBUTING, CHANGELOG, `docs/`, and `data/sample/` must resolve to files; `http(s)` links are syntax-checked only, not fetched, so CI does not depend on the live Pages URL or the network.
- **`collect:check` is now a CI step.** Track A's collect pipeline already had the script; quality CI runs it so a stale `public/data/` dataset fails the build.
- **Dependabot config only** (`.github/dependabot.yml`) for `npm` and `github-actions`, weekly, no auto-merge. Keeps actions and the lockfile from going stale without adding a bot identity or extra permissions.

