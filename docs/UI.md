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

## Filter query

`range=4w|12w|all|custom`, `from` / `to` (YYYY-MM-DD, custom only), `src=grok-bot,cursor` (empty = none), `q=<assistant search>`. Defaults are omitted, so `#/` means all time, every source, no search.

## Adding a view

1. Create `src/ui/views/<name>.ts` exporting `render(ctx: ViewContext): ViewResult`. Use `ctx.filtered` (already filtered), `ctx.charts` for charts, `chartFigure()` so every chart has a table, and `emptyState()` when nothing matches.
2. Add the route to `Route` / `parseRoute` in `router.ts` and the loader to `VIEW_LOADERS` in `shell.ts`.
3. Return the view's tables in `ViewResult.tables` (first one = CSV export).
4. Add a happy-dom test under `tests/ui/` using `mountApp()` from `tests/ui/mount.ts`.

## Test hooks

`#app-shell`, `nav[aria-label="Views"]`, `#filters`, `main#view[data-state=loading|ready|empty|error]`, `[data-view=<name>]`, `figure[data-chart=<id>]`, `table[data-table=<id>]`, `[data-tile=<id>]`, `#theme-toggle`, `[data-export=csv|json]`.

## Bundle

Initial JS is the shell only (~27 kB). Chart.js, each view, and the sample-data fallback are separate chunks loaded on demand.
