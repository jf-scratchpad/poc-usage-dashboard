import { SOURCES, type Source, type UsageRecord } from '../../schema/usage';
import { SOURCE_LABELS, formatUsd } from '../../app/format';
import { h } from '../dom';
import { chartFigure } from '../charts';
import { applyFilters } from '../filters';
import { sourceColor, sourceDash, sourcePointStyle, totalColor } from '../palette';
import { linearTrend, round2 } from '../stats';
import { renderTable, type DataTable } from '../table';
import { emptyState, shortDate, sum, tile, viewHeader, weeksInWindow } from './common';
import type { ViewContext, ViewResult } from './types';

const key = (name: string): string => name.trim().toLowerCase();

/** Rank of every assistant by spend (names merged case-insensitively across sources). */
export function assistantRanking(records: readonly UsageRecord[]): { name: string; cost: number }[] {
  const map = new Map<string, { name: string; cost: number }>();
  for (const r of records) {
    const k = key(r.assistant_or_project);
    const e = map.get(k);
    if (e) e.cost += r.cost_usd;
    else map.set(k, { name: r.assistant_or_project, cost: r.cost_usd });
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
}

export type UnitRow = { source: Source; unitType: string; units: number; cost: number; costPerUnit: number | null };

export function unitBreakdown(records: readonly UsageRecord[]): UnitRow[] {
  const map = new Map<string, UnitRow>();
  for (const r of records) {
    const k = `${r.source}\u0000${r.unit_type}`;
    const e = map.get(k) ?? { source: r.source, unitType: r.unit_type, units: 0, cost: 0, costPerUnit: null };
    e.units += r.units;
    e.cost += r.cost_usd;
    map.set(k, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, costPerUnit: e.units > 0 ? e.cost / e.units : null }))
    .sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source) || a.unitType.localeCompare(b.unitType));
}

function perUnit(v: number | null): string {
  if (v === null) return '—';
  return v >= 0.01 ? formatUsd(v) : `$${v.toPrecision(2)}`;
}

export function render(ctx: ViewContext): ViewResult {
  if (ctx.route.name !== 'assistant') throw new Error('assistant view needs an assistant route');
  const wanted = key(ctx.route.assistant);
  const known = ctx.data.records.find((r) => key(r.assistant_or_project) === wanted);
  const name = known?.assistant_or_project ?? ctx.route.assistant;
  const title = `Assistant: ${name}`;
  const crumbs = h('p', { class: 'crumbs' }, h('a', { href: ctx.hrefFor({ name: 'overview' }) }, 'Overview'), ' › ', name);
  ctx.root.append(viewHeader(title, `Cost across sources, ${shortDate(ctx.window.from)} – ${shortDate(ctx.window.to)}.`, crumbs));

  if (!known) {
    ctx.root.append(
      h(
        'div',
        { class: 'state state-empty', 'data-state': 'empty', role: 'status' },
        h('p', {}, `No assistant or project named “${ctx.route.assistant}” is in the data.`),
        h('p', {}, h('a', { href: ctx.hrefFor({ name: 'overview' }), class: 'button' }, 'Back to the overview')),
      ),
    );
    return { title, state: 'empty', tables: [] };
  }

  // The assistant search must not hide the pinned assistant; date and source filters still apply.
  const scope = applyFilters(ctx.data.records, ctx.filters, ctx.window, { ignoreQuery: true });
  const records = scope.filter((r) => key(r.assistant_or_project) === wanted);
  if (records.length === 0) {
    ctx.root.append(emptyState(ctx, `${name} has no usage in this date range or for the selected sources.`));
    return { title, state: 'empty', tables: [] };
  }

  const weeks = weeksInWindow(records, ctx);
  const labels = weeks.map((w) => shortDate(w.weekStart));
  const totals = weeks.map((w) => round2(w.totalCostUsd));
  const trend = linearTrend(totals);
  const total = sum(records.map((r) => r.cost_usd));
  const ranking = assistantRanking(scope);
  const rank = ranking.findIndex((r) => key(r.name) === wanted) + 1;
  const scopeTotal = sum(scope.map((r) => r.cost_usd));
  const present = SOURCES.filter((s) => records.some((r) => r.source === s));
  const units = unitBreakdown(records);
  const single = units.length === 1 ? units[0] : undefined;

  ctx.root.append(
    h(
      'section',
      { class: 'tiles', 'aria-label': 'Summary' },
      tile('Total spend', formatUsd(total), `${weeks.length} weeks`, { 'data-tile': 'total', 'data-value': String(round2(total)) }),
      tile('Rank', `#${rank} of ${ranking.length}`, 'by spend, current filters', { 'data-tile': 'rank', 'data-value': String(rank) }),
      tile('Share of spend', `${((scopeTotal ? total / scopeTotal : 0) * 100).toFixed(1)}%`, undefined, { 'data-tile': 'share' }),
      tile('Sources', String(present.length), present.map((s) => SOURCE_LABELS[s]).join(', '), { 'data-tile': 'sources' }),
      tile(
        'Cost per unit',
        single ? perUnit(single.costPerUnit) : 'mixed',
        single ? `per ${single.unitType.replace(/s$/, '')}` : `${units.length} unit types, see table`,
        { 'data-tile': 'cpu' },
      ),
    ),
  );

  const weeklyTable: DataTable = {
    id: 'assistant-weekly',
    title: `${name}: weekly spend by source`,
    columns: [
      { key: 'week_start', label: 'Week of', kind: 'date' },
      ...present.map((s) => ({ key: s, label: SOURCE_LABELS[s], kind: 'usd' as const })),
      { key: 'total_usd', label: 'Total', kind: 'usd' },
      { key: 'trend_usd', label: 'Trend', kind: 'usd' },
    ],
    rows: weeks.map((w, i) => [w.weekStart, ...present.map((s) => round2(w.bySource[s] ?? 0)), round2(w.totalCostUsd), round2(trend.fitted[i] ?? 0)]),
  };
  const weekly = chartFigure('assistant-weekly', 'Weekly spend by source', 'Stacked bars per source; the line is the least-squares trend of the total.', weeklyTable, { wide: true });

  const unitTable: DataTable = {
    id: 'assistant-units',
    title: `${name}: units and cost per unit`,
    columns: [
      { key: 'source', label: 'Source' },
      { key: 'unit_type', label: 'Unit' },
      { key: 'units', label: 'Units', kind: 'number' },
      { key: 'cost_usd', label: 'Spend', kind: 'usd' },
      { key: 'cost_per_unit', label: 'Cost per unit' },
    ],
    rows: units.map((u) => [SOURCE_LABELS[u.source], u.unitType, round2(u.units), round2(u.cost), perUnit(u.costPerUnit)]),
  };
  const sourceTable: DataTable = {
    id: 'assistant-sources',
    title: `${name}: spend by source`,
    columns: [
      { key: 'source', label: 'Source' },
      { key: 'cost_usd', label: 'Spend', kind: 'usd' },
      { key: 'share', label: 'Share', kind: 'pct' },
    ],
    rows: present.map((s) => {
      const c = sum(records.filter((r) => r.source === s).map((r) => r.cost_usd));
      return [SOURCE_LABELS[s], round2(c), total ? c / total : 0];
    }),
  };
  const bySource = chartFigure('assistant-sources', 'Spend by source', `Where ${name}'s spend comes from.`, sourceTable, {
    height: 220,
    linkFor: (row, col) => {
      const s = present.find((p) => SOURCE_LABELS[p] === row[0]);
      return col === 0 && s ? ctx.hrefFor({ name: 'source', source: s }) : undefined;
    },
  });
  bySource.figure.querySelector('details')?.setAttribute('open', '');

  const unitsPanel = h(
    'section',
    { class: 'panel', 'aria-labelledby': 'units-h' },
    h('h3', { id: 'units-h' }, 'Units and cost per unit'),
    h('p', { class: 'muted' }, 'Units are counted in each source’s own unit, so they are not added across sources.'),
    h('div', { class: 'table-scroll' }, renderTable(unitTable)),
  );

  ctx.root.append(h('div', { class: 'grid' }, weekly.figure, bySource.figure, unitsPanel));

  const chartsReady = Promise.all([
    ctx.charts.bar(weekly.canvas, {
      labels,
      stacked: true,
      series: present.map((s) => ({ label: SOURCE_LABELS[s], data: weeks.map((w) => round2(w.bySource[s] ?? 0)), color: sourceColor(s), dash: sourceDash(s), point: sourcePointStyle(s) })),
      trend: { label: 'Trend (total)', data: trend.fitted.map(round2), color: totalColor(ctx.theme) },
    }),
    ctx.charts.bar(bySource.canvas, {
      labels: present.map((s) => SOURCE_LABELS[s]),
      horizontal: true,
      series: [{ label: 'Spend', data: sourceTable.rows.map((r) => Number(r[1])), color: sourceColor(present[0] ?? SOURCES[0]), colors: present.map(sourceColor) }],
    }),
  ]).then(() => undefined);

  return { title, state: 'ready', tables: [weeklyTable, sourceTable, unitTable], chartsReady };
}
