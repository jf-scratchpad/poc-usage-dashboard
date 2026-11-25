# UI (v2)

Vanilla TypeScript + Chart.js, no framework. Code lives in `src/ui/`; the entry point is `src/ui/main.ts`.

## Layout

| Module | Role |
| --- | --- |
| `shell.ts` | Header (title, data freshness, theme toggle), nav, filter bar, export toolbar, `<main id="view">`, loading / error states. |
| `router.ts` | Hash router: `#/<view>[/<param>]?<filters>`. `parseHash`, `formatHash`, `HashRouter`. |
| `filters.ts` | `Filters` type, URL (de)serialization, `dateWindow`, `applyFilters`. Pure functions. |
| `data.ts` | Wraps track A's `loadUsageData` (`./data/manifest.json` + `./data/usage.v1.json`, relative, same origin; bundled sample fallback) and derives `asOf`, `earliest`, `dataThrough`. |
| `charts.ts` / `chartkit.ts` | `ChartHost` creates and destroys charts; `chartkit` (Chart.js) is dynamic-imported. `chartFigure` builds a panel with canvas + data table. |
| `table.ts`, `export.ts` | Data tables, CSV / JSON export. |
| `palette.ts`, `theme.ts`, `stats.ts`, `dom.ts` | Okabe–Ito palette, theme persistence, trend line, safe DOM builders. |
| `views/*.ts` | One lazy chunk per view. Each exports `render(ctx): ViewResult`. |

## Routes

`#/` overview · `#/assistant/<name>` · `#/source/<id>` · `#/budgets` · `#/forecast` · `#/anomalies` · anything else shows "not found".

## Views

- **Overview** (`#/`): tiles, weekly spend + trend line, stacked spend by source, spend by assistant with sources merged (track A's `costByAssistantAcrossSources`), top 10 consumers (links to drill-down).
- **Assistant** (`#/assistant/<name>`): total, rank, share, sources, cost per unit; weekly spend by source (stacked) with a trend line; spend by source; units and cost per unit per source/unit type. Ignores the assistant search; names match case-insensitively.
- **Source** (`#/source/<id>`): description from the registry, total, share of all spend, latest week, assistants, units; weekly spend + trend; assistants table with drill-down links. Ignores the source filter.
- **Budgets** (`#/budgets`): one card per budget from `config/budgets.json` via `evaluateBudgets` (progress bar, status badge, projected end-of-period spend and status), summary tiles, table. Current period only; date range does not apply.
- **Forecast** (`#/forecast`): next 4 weeks via `forecastWeekly` (linear, 95% band) with EWMA for comparison; per-source forecast totals.
- **Anomalies** (`#/anomalies`): `detectAllAnomalies` across total, source, and assistant scopes; weekly line with flagged weeks marked; list with explanations and drill-down links.

## Filter query

`range=4w|12w|all|custom`, `from` / `to` (YYYY-MM-DD, custom only), `src=grok-bot,cursor` (empty = none), `q=<assistant search>`. Defaults are omitted, so `#/` means all time, every source, no search.

## Adding a view

1. Create `src/ui/views/<name>.ts` exporting `render(ctx: ViewContext): ViewResult`. Use `ctx.filtered` (already filtered), `ctx.charts` for charts, `chartFigure()` so every chart has a table, and `emptyState()` when nothing matches.
2. Add the route to `Route` / `parseRoute` in `router.ts` and the loader to `VIEW_LOADERS` in `shell.ts`.
3. Return the view's tables in `ViewResult.tables` (first one = CSV export).
4. Add a happy-dom test under `tests/ui/` using `mountApp()` from `tests/ui/mount.ts`.

## Interaction and print

- In the assistant search, **Enter** on an exact assistant name opens its drill-down (and clears the search); otherwise typing just filters every view.

- Bars in "Top consumers" (overview) and "Assistants and projects" (source page) open the assistant drill-down on click; the same names are links in the data tables for keyboard and screen-reader users.
- **Print** (toolbar button or Ctrl/Cmd+P) uses a light print stylesheet: filters, nav, and toolbar are hidden, panels avoid page breaks, and every chart's data table is expanded.
- The layout collapses to one column under 760 px wide; nothing scrolls horizontally except wide tables inside their own scroller.

## Test hooks

`#app-shell`, `nav[aria-label="Views"]`, `#filters`, `main#view[data-state=loading|ready|empty|error]`, `[data-view=<name>]`, `figure[data-chart=<id>]`, `table[data-table=<id>]`, `[data-tile=<id>]`, `#theme-toggle`, `[data-export=csv|json]`.

## Bundle

Initial JS is the shell only (~27 kB). Chart.js, each view, and the sample-data fallback are separate chunks loaded on demand.
