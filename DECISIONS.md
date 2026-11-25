# Decisions

Every notable choice and why. Newest additions go at the bottom of their section.

## Stack and tooling

- **Node 20 LTS, TypeScript (strict), npm with a committed `package-lock.json`, Vite, Chart.js, Vitest.** The approved stack for the trial. Reproducible installs (`npm ci`), one language end to end, fast static builds, and a small charting library with line and bar charts built in.
- **No backend, no runtime network calls.** The data is sample-only and bundled at build time, so a static site is enough and there's nothing to secure or host.
- **No ESLint.** Optional in the stack; skipped to save setup time on a one-day trial. `tsc --strict` (plus `noUncheckedIndexedAccess`) catches most of what matters here.
- **Vite 6, Vitest 3, TypeScript 5.9, Chart.js 4.** Current major versions at the time, all supporting Node 20.
- **`base: './'` in Vite.** The built `dist/` uses relative paths, so it works from any folder without a server path config. No deploy target is assumed.
- **Box tooling ran Node 24 / npm 11; CI runs Node 20.** The lockfile (v3) is compatible with npm 10 on Node 20, and CI is the source of truth.
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
- **`src/aggregate.ts` is the canonical rollup module.** Other tracks should import it rather than reimplement week, source, or top-consumer helpers.
- **Units are summed even when `unit_type` differs, and the table labels that as "mixed units".** Cost is always USD and is the ranking key; mixed unit counts would otherwise look like a single quantity.
- **The assistant bar chart caps at 15 rows; the top-consumers table caps at 10.** Keeps the layout readable when collectors later return long tails.
- **The page renders an empty state when `loadAllUsage()` returns no records.** The filter, chart canvases, and table stay in place so the UI works before collectors land.

## Data and security

- **Sample data only, clearly fake.** The trial forbids real account access; sample files are realistic in shape (they mimic each source's export format) so adapters exercise real parsing.
- **Hard limits enforced in CI by a repo scanner (`scripts/limits.ts`, `tests/limits.test.ts`).** Catches private keys, common token formats, hard-coded credentials, MAC addresses, serial-number/hardware-UUID fields, and key/env files. Test fixtures are assembled at runtime so the test file doesn't trip itself.
- **`package-lock.json` is not content-scanned.** It's generated and full of integrity hashes; it is still checked by file name like everything else.
- **CI uses `permissions: contents: read` and pinned major versions of official actions (`actions/checkout@v4`, `actions/setup-node@v4`).** Least privilege; no secrets are used in CI at all.

## Process

- **Repo identity: Jose's own GitHub App `cody-grok-scratchpad`, not Cursor cloud agents.** The Cursor GitHub App isn't installed on the `jf-scratchpad` org, and Jose chose to use his own app for this trial. Work runs as three parallel local executors (collectors, web app, quality) on the box with short-lived installation tokens; the key never enters the repo.
- **Initial scaffold pushed straight to `main`.** The repo was empty, so a base commit was needed before any branch or PR could exist. Everything after that goes through `grok/*` branches and PRs.
- **Self-merge after green CI, merge commits only, no force pushes.** Jose's approved exception for this repo, today only, until 6 PM ET (work stops at 5:50 PM ET).
