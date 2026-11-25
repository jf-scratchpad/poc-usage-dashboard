import { forecastWeekly, type ForecastMethod, type WeeklyForecast } from '../../forecast';
import { SOURCES } from '../../schema/usage';
import { SOURCE_LABELS, formatUsd } from '../../app/format';
import { h } from '../dom';
import { chartFigure } from '../charts';
import { seriesColor, sourceColor, totalColor } from '../palette';
import { round2 } from '../stats';
import type { DataTable } from '../table';
import { emptyState, shortDate, sum, tile, viewHeader } from './common';
import type { ViewContext, ViewResult } from './types';

export const HORIZON = 4;
const MIN_WEEKS = 3;

function sumForecast(f: WeeklyForecast): { value: number; low: number; high: number } {
  return {
    value: sum(f.forecast.map((p) => p.value)),
    low: sum(f.forecast.map((p) => p.low)),
    high: sum(f.forecast.map((p) => p.high)),
  };
}

export function render(ctx: ViewContext): ViewResult {
  const title = 'Forecast';
  const method: ForecastMethod = 'linear';
  ctx.root.append(
    viewHeader(
      title,
      `Next ${HORIZON} weeks of spend from the filtered history (linear trend, 95% band). A trailing partial week is left out of the fit.`,
    ),
  );
  const records = ctx.filtered;
  const fc = forecastWeekly(records, { method, horizon: HORIZON });
  if (records.length === 0 || fc.history.length < MIN_WEEKS) {
    ctx.root.append(
      emptyState(ctx, records.length === 0 ? 'No usage matches these filters.' : `A forecast needs at least ${MIN_WEEKS} complete weeks of history; widen the date range.`),
    );
    return { title, state: 'empty', tables: [] };
  }
  const ewma = forecastWeekly(records, { method: 'ewma', horizon: HORIZON });
  const next = fc.forecast[0];
  const total = sumForecast(fc);
  const totalEwma = sumForecast(ewma);
  const lastActual = fc.history.at(-1)?.value ?? 0;

  ctx.root.append(
    h(
      'section',
      { class: 'tiles', 'aria-label': 'Forecast summary' },
      tile('Next week', next ? formatUsd(next.value) : '—', next ? `${formatUsd(next.low)} – ${formatUsd(next.high)}` : undefined, {
        'data-tile': 'next',
        'data-value': String(round2(next?.value ?? 0)),
      }),
      tile(`Next ${HORIZON} weeks`, formatUsd(total.value), `${formatUsd(total.low)} – ${formatUsd(total.high)}`, { 'data-tile': 'horizon', 'data-value': String(round2(total.value)) }),
      tile('Trend', `${(fc.slope ?? 0) >= 0 ? '+' : '−'}${formatUsd(Math.abs(fc.slope ?? 0))}/wk`, 'linear slope', { 'data-tile': 'slope' }),
      tile('Smoothed (EWMA)', formatUsd(totalEwma.value), `next ${HORIZON} weeks, for comparison`, { 'data-tile': 'ewma' }),
    ),
  );

  const weeks = [...fc.history.map((p) => p.weekStart), ...fc.forecast.map((p) => p.weekStart)];
  const nH = fc.history.length;
  const table: DataTable = {
    id: 'forecast',
    title: 'Weekly spend and forecast',
    columns: [
      { key: 'week_start', label: 'Week of', kind: 'date' },
      { key: 'kind', label: 'Type' },
      { key: 'actual_usd', label: 'Actual', kind: 'usd' },
      { key: 'forecast_usd', label: 'Forecast', kind: 'usd' },
      { key: 'low_usd', label: 'Low (95%)', kind: 'usd' },
      { key: 'high_usd', label: 'High (95%)', kind: 'usd' },
      { key: 'ewma_usd', label: 'EWMA forecast', kind: 'usd' },
    ],
    rows: [
      ...fc.history.map((p) => [p.weekStart, 'actual', round2(p.value), null, null, null, null]),
      ...fc.forecast.map((p, i) => [p.weekStart, 'forecast', null, round2(p.value), round2(p.low), round2(p.high), round2(ewma.forecast[i]?.value ?? 0)]),
    ],
  };
  const fig = chartFigure('forecast', `Next ${HORIZON} weeks`, 'Solid line is actual weekly spend; dashed line is the forecast; shaded band is the 95% range.', table, { wide: true, height: 320 });

  const active = SOURCES.filter((s) => ctx.filters.sources.includes(s));
  const perSource = active.map((s) => ({ s, f: forecastWeekly(records, { method, horizon: HORIZON, source: s }) }));
  const sourceTable: DataTable = {
    id: 'forecast-by-source',
    title: `Next ${HORIZON} weeks by source`,
    columns: [
      { key: 'source', label: 'Source' },
      { key: 'last_week_usd', label: 'Last full week', kind: 'usd' },
      { key: 'forecast_usd', label: `Next ${HORIZON} weeks`, kind: 'usd' },
      { key: 'low_usd', label: 'Low', kind: 'usd' },
      { key: 'high_usd', label: 'High', kind: 'usd' },
      { key: 'slope_usd', label: 'Trend per week', kind: 'usd' },
    ],
    rows: perSource
      .filter(({ f }) => f.history.length > 0)
      .map(({ s, f }) => {
        const t = sumForecast(f);
        return [SOURCE_LABELS[s], round2(f.history.at(-1)?.value ?? 0), round2(t.value), round2(t.low), round2(t.high), round2(f.slope ?? 0)];
      }),
  };
  const srcFig = chartFigure('forecast-by-source', `Next ${HORIZON} weeks by source`, 'Forecast total per source with its range.', sourceTable, {
    height: 220,
    linkFor: (row, col) => {
      const s = active.find((x) => SOURCE_LABELS[x] === row[0]);
      return col === 0 && s ? ctx.hrefFor({ name: 'source', source: s }) : undefined;
    },
  });
  srcFig.figure.querySelector('details')?.setAttribute('open', '');
  ctx.root.append(h('div', { class: 'grid' }, fig.figure, srcFig.figure));

  const pad = (n: number): null[] => Array.from({ length: n }, () => null);
  const line = totalColor(ctx.theme);
  const band = seriesColor(1);
  const chartsReady = Promise.all([
    ctx.charts.line(fig.canvas, {
      labels: weeks.map(shortDate),
      series: [
        { label: 'Actual', data: [...fc.history.map((p) => round2(p.value)), ...pad(HORIZON)], color: line, width: 2.5 },
        // Forecast starts at the last actual point so the lines join.
        { label: 'Forecast', data: [...pad(nH - 1), round2(lastActual), ...fc.forecast.map((p) => round2(p.value))], color: band, dash: [6, 4], point: 'rectRot' },
        { label: '95% low', data: [...pad(nH - 1), round2(lastActual), ...fc.forecast.map((p) => round2(p.low))], color: band, helper: true, width: 0 },
        { label: '95% range', data: [...pad(nH - 1), round2(lastActual), ...fc.forecast.map((p) => round2(p.high))], color: band, fill: '-1', width: 0, noPoints: true },
      ],
    }),
    ctx.charts.bar(srcFig.canvas, {
      labels: sourceTable.rows.map((r) => String(r[0])),
      horizontal: true,
      series: [{ label: `Next ${HORIZON} weeks`, data: sourceTable.rows.map((r) => Number(r[2])), color: sourceColor(active[0] ?? SOURCES[0]), colors: active.filter((s) => perSource.find((p) => p.s === s)?.f.history.length).map(sourceColor) }],
    }),
  ]).then(() => undefined);

  return { title, state: 'ready', tables: [table, sourceTable], chartsReady };
}
