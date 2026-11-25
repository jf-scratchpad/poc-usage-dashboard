# Contributing

This is a private scratch repo for a one-day trial and its v2 follow-on. Nothing else depends on it. The notes below are for anyone continuing work here (including later sessions of this bot).

## Rules that do not move

- **Sample data only.** No secrets, tokens, or real account access in the repo or in running code. Mark real-data plug-in points with `// REAL DATA PLUGS IN HERE`; do not wire them up here.
- **No hardware identifiers** (serials, MACs, hardware UUIDs) in code or docs.
- **Stay on the approved stack** (Node 20, TypeScript strict, Vite, Chart.js, Vitest, npm with a committed lockfile). A new dependency needs a one-line justification in `DECISIONS.md`.
- **Do not change other repos, accounts, org settings, or Jira.** Do not change this repo's visibility. Do not add a custom domain or DNS.

## Day-to-day

1. Branch from `main` as `grok/<topic>` (for v2 work, `grok/v2-<track>-<topic>`).
2. Make a small change with tests and, when the behavior is user-facing or the choice is notable, a docs and `DECISIONS.md` update.
3. Open a pull request against `main`. The PR body should end with:

   `Authored by Cody · Developer (Grok Bot) under the cody-grok-scratchpad app for usage-dashboard v2.`

4. Wait for CI to go green. Merge with a **merge commit** (no squash, no rebase-and-force, no force-push, no direct pushes to `main`).

CI is `.github/workflows/ci.yml`. It typechecks, scans for secrets and hardware IDs, checks that `public/data/` is up to date (`npm run collect:check`), runs unit tests with coverage floors, builds, checks the bundle budget and doc links, and runs Playwright end-to-end smoke tests.

## Commands

```bash
npm ci
npm run typecheck
npm test              # unit tests + coverage thresholds
npm run collect:check # sample dataset must match the adapters
npm run build
npm run check:bundle
npm run check:links
npm run test:e2e      # needs a built dist/ and, locally, Google Chrome
```

Local e2e uses the machine's Google Chrome. In CI, Playwright's Chromium is installed on `ubuntu-24.04` and cached. Do not download browsers during `npm ci` (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).

If you change adapters or sample files, run `npm run collect` and commit the refreshed `public/data/usage.v1.json` and `manifest.json`.

## Adding a source or a view

- New usage source: follow [docs/adapters.md](docs/adapters.md#adding-a-source) (schema → `SOURCE_META` → adapter → sample → registry → tests → `npm run collect`).
- New UI view: follow [docs/UI.md](docs/UI.md#adding-a-view) (view module, route, loader, tables for export, happy-dom test). End-to-end coverage of a new route belongs in `tests/e2e/`.

## Versions

Product versions are recorded in [CHANGELOG.md](CHANGELOG.md) only (1.0.0 for the morning trial, 2.0.0 for this follow-on). Do not create git tags or GitHub Releases unless Jose asks.
