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
