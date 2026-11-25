# Decisions

Notable choices and why. One line each where possible.

- **Stack: Node 20 LTS, TypeScript (strict), npm with a committed lockfile, Vite, Chart.js, Vitest.** The approved stack for this trial; no backend, no runtime network calls.
- **`UsageAdapter.load()` is async (`Promise<UsageRecord[]>`).** Sample adapters could be sync, but real collectors (API exports, CSV downloads) are async, so the interface won't need to change when real data plugs in.

- **Vanilla TypeScript for the UI, no framework.** Preferred for this small static dashboard; keeps the bundle and CI surface small.
- **happy-dom for DOM-level tests.** Lighter than launching a browser, and enough to assert the filter, table, tiles, and chart canvases once CanvasRenderingContext2D is stubbed for Chart.js.
- **"Today" and week-over-week use the America/New_York calendar date.** Tiles should follow Jose's local week, not UTC.
- **ISO weeks start on Monday, and the week-year follows the ISO Thursday rule.** Matches the "spend by week" requirement and avoids a mid-week year split.
- **`src/aggregate.ts` is the canonical rollup module.** Other tracks should import it rather than reimplement week, source, or top-consumer helpers.
- **Units are summed even when `unit_type` differs, and the table labels that as "mixed units".** Cost is always USD and is the ranking key; mixed unit counts would otherwise look like a single quantity.
- **The assistant bar chart caps at 15 rows; the top-consumers table caps at 10.** Keeps the layout readable when collectors later return long tails.
