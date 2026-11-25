import { totalsByAssistant, weekOverWeekTrend } from '../../aggregate';
import { SOURCES } from '../../schema/usage';
import { SOURCE_LABELS, formatPct, formatUsd } from '../../app/format';
import { h } from '../dom';
import { chartFigure } from '../charts';
import { sourceColor, sourceDash, sourcePointStyle, totalColor } from '../palette';
import { linearTrend, round2 } from '../stats';
import type { DataTable } from '../table';
import { emptyState, shortDate, sum, tile, viewHeader, weeksInWindow } from './common';
import type { ViewContext, ViewResult } from './types';

export const TOP_N = 10;

export function render(ctx: ViewContext): ViewResult {
  const title = 'Overview';
  const records = ctx.filtered;
  ctx.root.append(viewHeader(title, `Spend across every source, ${shortDate(ctx.window.from)} – ${shortDate(ctx.window.to)}.`));

  if (records.length === 0) {
    ctx.root.append(emptyState(ctx, 'No usage matches these filters.'));
    return { title, state: 'empty', tables: [] };
  }

  const weeks = weeksInWindow(records, ctx);
  const labels = weeks.map((w) => shortDate(w.weekStart));
  const totals = weeks.map((w) => round2(w.totalCostUsd));
  const trend = linearTrend(totals);
  const total = sum(records.map((r) => r.cost_usd));
  const wow = weekOverWeekTrend(records, ctx.data.asOf);
  const consumers = totalsByAssistant(records);
  const activeSources = SOURCES.filter((s) => ctx.filters.sources.includes(s));
  const bySource = activeSources
    .map((s) => ({ s, cost: sum(weeks.map((w) => w.bySource[s] ?? 0)) }))
    .sort((a, b) => b.cost - a.cost);
  const top = bySource[0];

  const tiles = h(
    'section',
    { class: 'tiles', 'aria-label': 'Summary' },
    tile('Total spend', formatUsd(total), `${weeks.length} weeks`, { 'data-tile': 'total', 'data-value': String(round2(total)) }),
    tile('Average per week', formatUsd(weeks.length ? total / weeks.length : 0), undefined, { 'data-tile': 'avg' }),
    tile(
      'Latest week',
      formatUsd(wow.thisWeekCost),
      wow.deltaPct === null ? 'no prior week' : `${formatPct(wow.deltaPct)} vs prior week`,
      { 'data-tile': 'latest' },
    ),
    tile('Trend', `${trend.slope >= 0 ? '+' : '−'}${formatUsd(Math.abs(trend.slope))}/wk`, 'least-squares slope', { 'data-tile': 'trend' }),
    tile('Active assistants', String(new Set(consumers.map((c) => c.assistant_or_project)).size), undefined, { 'data-tile': 'assistants' }),
    tile('Top source', top ? SOURCE_LABELS[top.s] : '—', top ? formatUsd(top.cost) : undefined, { 'data-tile': 'top-source' }),
  );

  const weeklyTable: DataTable = {
    id: 'weekly',
    title: 'Weekly spend',
    columns: [
      { key: 'week_start', label: 'Week of', kind: 'date' },
      { key: 'cost_usd', label: 'Spend', kind: 'usd' },
      { key: 'trend_usd', label: 'Trend', kind: 'usd' },
    ],
    rows: weeks.map((w, i) => [w.weekStart, round2(w.totalCostUsd), round2(trend.fitted[i] ?? 0)]),
  };
  const weekly = chartFigure('weekly', 'Weekly spend with trend line', 'Total spend per ISO week; the dashed line is a least-squares trend.', weeklyTable, { wide: true });

  const sourceTable: DataTable = {
    id: 'by-source',
    title: 'Spend by source per week',
    columns: [{ key: 'week_start', label: 'Week of', kind: 'date' }, ...activeSources.map((s) => ({ key: s, label: SOURCE_LABELS[s], kind: 'usd' as const }))],
    rows: weeks.map((w) => [w.weekStart, ...activeSources.map((s) => round2(w.bySource[s] ?? 0))]),
  };
  const stacked = chartFigure('by-source', 'Spend by source', 'Stacked weekly spend per source.', sourceTable);

  const topRows = consumers.slice(0, TOP_N);
  const topTable: DataTable = {
    id: 'top-consumers',
    title: 'Top consumers',
    columns: [
      { key: 'rank', label: 'Rank', kind: 'number' },
      { key: 'assistant', label: 'Assistant or project' },
      { key: 'source', label: 'Source' },
      { key: 'cost_usd', label: 'Spend', kind: 'usd' },
      { key: 'share', label: 'Share', kind: 'pct' },
    ],
    rows: topRows.map((c, i) => [i + 1, c.assistant_or_project, SOURCE_LABELS[c.source], round2(c.cost_usd), total ? c.cost_usd / total : 0]),
  };
  const topFig = chartFigure('top-consumers', `Top ${TOP_N} consumers`, 'Highest spend by assistant or project; select a name to drill down.', topTable, {
    height: 340,
    linkFor: (row, col) => (col === 1 && typeof row[1] === 'string' ? ctx.hrefFor({ name: 'assistant', assistant: row[1] }) : undefined),
  });
  // Top consumers are important enough to show the table open by default.
  topFig.figure.querySelector('details')?.setAttribute('open', '');

  ctx.root.append(tiles, h('div', { class: 'grid' }, weekly.figure, stacked.figure, topFig.figure));

  const chartsReady = Promise.all([
    ctx.charts.line(weekly.canvas, {
      labels,
      series: [
        { label: 'Weekly spend', data: totals, color: totalColor(ctx.theme), point: 'circle', width: 2.5 },
        { label: 'Trend', data: trend.fitted.map(round2), color: totalColor(ctx.theme), dash: [6, 4], width: 1.5, noPoints: true },
      ],
    }),
    ctx.charts.line(stacked.canvas, {
      labels,
      stacked: true,
      series: activeSources.map((s) => ({
        label: SOURCE_LABELS[s],
        data: weeks.map((w) => round2(w.bySource[s] ?? 0)),
        color: sourceColor(s),
        dash: sourceDash(s),
        point: sourcePointStyle(s),
        fill: true,
      })),
    }),
    ctx.charts.bar(topFig.canvas, {
      labels: topRows.map((c) => `${c.assistant_or_project} (${SOURCE_LABELS[c.source]})`),
      horizontal: true,
      series: [{ label: 'Spend', data: topRows.map((c) => round2(c.cost_usd)), color: sourceColor(topRows[0]?.source ?? SOURCES[0]), colors: topRows.map((c) => sourceColor(c.source)) }],
    }),
  ]).then(() => undefined);

  return { title, state: 'ready', tables: [weeklyTable, sourceTable, topTable], chartsReady };
}
