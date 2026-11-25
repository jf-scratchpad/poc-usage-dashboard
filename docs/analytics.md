# Analytics engines (v2 data platform)

All engines are pure TypeScript functions over `UsageRecord[]` (no DOM, no
fetch), so the UI imports them directly and tests pin their behaviour.

## Budgets and alerts — `src/budgets.ts`, `config/budgets.json`

`config/budgets.json` holds **fictional** budgets. Each entry:

| Field | Meaning |
| --- | --- |
| `id` | Unique id |
| `scope` | `total`, `source` (key = source id), or `assistant` (key = assistant/project name, matched case-insensitively across every source; optional `source` narrows it) |
| `period` | `week` (ISO, Mon–Sun) or `month` (calendar) |
| `amount_usd` | Budget for one period |
| `label` | Optional display label |

`thresholds.warn_pct` (default 80) and `thresholds.over_pct` (default 100) set the alert levels.

For a given `asOf` day (the UI uses the last data day, 2026-11-22 in the sample):

- `spentUsd` = cost of matching records from the period start through `asOf`.
- `pctUsed` = spent ÷ budget × 100 → `level`: `over` if ≥ 100, `warn` if ≥ 80, else `ok`.
- `projectedUsd` = spent ÷ elapsed days × days in period (straight-line run rate) → `projectedPct`, `projectedLevel`.

API: `loadBudgetConfig()`, `parseBudgetConfig(raw)`, `evaluateBudgets(records, config, asOf)` (worst first),
`evaluateBudget(...)`, `budgetSummary(statuses)`, `periodBounds(period, asOf)`, `alertLevel(pct, thresholds)`.

**Real data:** a real budget would be edited in `config/budgets.json` (no secrets involved). Nothing here reads a billing system.

## Forecasting — `src/forecast.ts`

Input is weekly total spend (ISO weeks, from `totalsByWeek`). A trailing
partial week is dropped so it doesn't drag the trend down. Two models:

- **`linear`** (default): ordinary least squares `y = a + b·x` over week index
  `x = 0..n−1`. The forecast for future week `x` is `a + b·x`. Band is the
  textbook prediction interval `± z · s · √(1 + 1/n + (x − x̄)² / Sxx)`, with
  `s = √(SSE / (n − 2))`. `slope` is the change in spend per week.
- **`ewma`**: simple exponential smoothing, `L₀ = y₀`, `Lₜ = α·yₜ + (1 − α)·Lₜ₋₁`
  (default `α = 0.5`). The forecast is flat at the last level; the band is
  `± z · s · √(1 + (h − 1)·α²)` with `s` the RMS one-step-ahead error.

`z` defaults to 1.96 (≈ 95% if residuals were normal; treat it as a rough
range, not a guarantee). Values and lower bounds are clamped at 0.

API: `forecastWeekly(records, { method, horizon = 4, alpha, z, source })` →
`{ history: {weekStart, value}[], forecast: {weekStart, value, low, high}[], slope?, residualStdev }`;
`forecastBySource(records, opts)`; lower-level `forecastSeries(values, opts)`, `linearRegression`, `ewma`.
