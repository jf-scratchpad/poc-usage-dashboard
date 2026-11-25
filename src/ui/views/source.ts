import { totalsByAssistant, weekOverWeekTrend } from '../../aggregate';
import { getSourceMeta } from '../../adapters/sources';
import { formatPct, formatUnits, formatUsd } from '../../app/format';
import { h } from '../dom';
import { chartFigure } from '../charts';
import { applyFilters } from '../filters';
import { sourceColor, sourcePointStyle, totalColor } from '../palette';
import { linearTrend, round2 } from '../stats';
import type { DataTable } from '../table';
import { emptyState, shortDate, sum, tile, viewHeader, weeksInWindow } from './common';
import type { ViewContext, ViewResult } from './types';

export const SOURCE_TOP_N = 12;

export function render(ctx: ViewContext): ViewResult {
  if (ctx.route.name !== 'source') throw new Error('source view needs a source route');
  const source = ctx.route.source;
  const meta = getSourceMeta(source);
  const title = `Source: ${meta.displayName}`;
  const crumbs = h('p', { class: 'crumbs' }, h('a', { href: ctx.hrefFor({ name: 'overview' }) }, 'Overview'), ' › ', meta.displayName);
  ctx.root.append(viewHeader(title, meta.description, crumbs));

  // The page pins one source, so the source filter is bypassed; date and search still apply.
  const window = applyFilters(ctx.data.records, ctx.filters, ctx.window, { ignoreSources: true });
  const records = window.filter((r) => r.source === source);
  if (!ctx.filters.sources.includes(source)) {
    ctx.root.append(h('p', { class: 'notice muted', role: 'note' }, `${meta.displayName} is unchecked in the source filter; this page shows it anyway.`));
  }
  if (records.length === 0) {
    ctx.root.append(emptyState(ctx, `No ${meta.displayName} usage matches these filters.`));
    return { title, state: 'empty', tables: [] };
  }

  const weeks = weeksInWindow(records, ctx);
  const labels = weeks.map((w) => shortDate(w.weekStart));
  const totals = weeks.map((w) => round2(w.totalCostUsd));
  const trend = linearTrend(totals);
  const total = sum(records.map((r) => r.cost_usd));
  const allTotal = sum(window.map((r) => r.cost_usd));
  const units = sum(records.map((r) => r.units));
  const unitTypes = [...new Set(records.map((r) => r.unit_type))];
  const wow = weekOverWeekTrend(records, ctx.data.asOf);
  const consumers = totalsByAssistant(records);

  ctx.root.append(
    h(
      'section',
      { class: 'tiles', 'aria-label': 'Summary' },
      tile('Total spend', formatUsd(total), `${weeks.length} weeks`, { 'data-tile': 'total', 'data-value': String(round2(total)) }),
      tile('Share of all spend', `${((allTotal ? total / allTotal : 0) * 100).toFixed(1)}%`, 'across every source', { 'data-tile': 'share' }),
      tile('Latest week', formatUsd(wow.thisWeekCost), wow.deltaPct === null ? 'no prior week' : `${formatPct(wow.deltaPct)} vs prior week`, { 'data-tile': 'latest' }),
      tile('Assistants / projects', String(consumers.length), undefined, { 'data-tile': 'assistants' }),
      tile(
        'Units',
        unitTypes.length === 1 ? formatUnits(units) : 'mixed',
        unitTypes.length === 1 ? `${unitTypes[0]}, ${units > 0 ? `${formatUsd(total / units)} each` : 'n/a'}` : unitTypes.join(', '),
        { 'data-tile': 'units' },
      ),
    ),
  );

  const weeklyTable: DataTable = {
    id: 'source-weekly',
    title: `${meta.displayName}: weekly spend`,
    columns: [
      { key: 'week_start', label: 'Week of', kind: 'date' },
      { key: 'cost_usd', label: 'Spend', kind: 'usd' },
      { key: 'trend_usd', label: 'Trend', kind: 'usd' },
      { key: 'units', label: 'Units', kind: 'number' },
    ],
    rows: weeks.map((w, i) => [w.weekStart, round2(w.totalCostUsd), round2(trend.fitted[i] ?? 0), round2(w.totalUnits)]),
  };
  const weekly = chartFigure('source-weekly', 'Weekly spend with trend line', `${meta.displayName} spend per ISO week; dashed line is the least-squares trend.`, weeklyTable, { wide: true });

  const top = consumers.slice(0, SOURCE_TOP_N);
  const consumersTable: DataTable = {
    id: 'source-assistants',
    title: `${meta.displayName}: assistants and projects`,
    columns: [
      { key: 'rank', label: 'Rank', kind: 'number' },
      { key: 'assistant', label: 'Assistant or project' },
      { key: 'cost_usd', label: 'Spend', kind: 'usd' },
      { key: 'units', label: 'Units', kind: 'number' },
      { key: 'unit_type', label: 'Unit' },
      { key: 'share', label: 'Share', kind: 'pct' },
    ],
    rows: consumers.map((c, i) => [i + 1, c.assistant_or_project, round2(c.cost_usd), round2(c.units), c.unit_types.join(', '), total ? c.cost_usd / total : 0]),
  };
  const topFig = chartFigure('source-assistants', 'Assistants and projects', 'Spend per assistant or project; select a name to drill down.', consumersTable, {
    height: Math.max(200, top.length * 28),
    linkFor: (row, col) => (col === 1 && typeof row[1] === 'string' ? ctx.hrefFor({ name: 'assistant', assistant: row[1] }) : undefined),
  });
  topFig.figure.querySelector('details')?.setAttribute('open', '');
  ctx.root.append(h('div', { class: 'grid' }, weekly.figure, topFig.figure));

  const color = sourceColor(source);
  const chartsReady = Promise.all([
    ctx.charts.line(weekly.canvas, {
      labels,
      series: [
        { label: `${meta.displayName} spend`, data: totals, color, point: sourcePointStyle(source), fill: true },
        { label: 'Trend', data: trend.fitted.map(round2), color: totalColor(ctx.theme), dash: [6, 4], width: 1.5, noPoints: true },
      ],
    }),
    ctx.charts.bar(topFig.canvas, {
      labels: top.map((c) => c.assistant_or_project),
      horizontal: true,
      series: [{ label: 'Spend', data: top.map((c) => round2(c.cost_usd)), color }],
    }),
  ]).then(() => undefined);

  return { title, state: 'ready', tables: [weeklyTable, consumersTable], chartsReady };
}
