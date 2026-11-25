import { detectAllAnomalies, type Anomaly, type AnomalyScope } from '../../anomaly';
import { SOURCE_LABELS, formatUsd } from '../../app/format';
import { h } from '../dom';
import { chartFigure } from '../charts';
import { seriesColor, totalColor } from '../palette';
import { round2 } from '../stats';
import { renderTable, type DataTable } from '../table';
import type { Route } from '../router';
import { emptyState, shortDate, tile, viewHeader, weeksInWindow } from './common';
import type { ViewContext, ViewResult } from './types';

const SCOPE_TEXT: Record<AnomalyScope, string> = { total: 'All spend', source: 'Source', assistant: 'Assistant' };

function routeFor(a: Anomaly): Route | undefined {
  if (a.scope === 'source' && a.source) return { name: 'source', source: a.source };
  if (a.scope === 'assistant' && a.assistant) return { name: 'assistant', assistant: a.assistant };
  return undefined;
}

export function render(ctx: ViewContext): ViewResult {
  const title = 'Anomalies';
  ctx.root.append(
    viewHeader(title, 'Weeks where spend jumped well above the trailing 4-week average (rolling z-score ≥ 2), for all spend, each source, and each assistant.'),
  );
  const records = ctx.filtered;
  if (records.length === 0) {
    ctx.root.append(emptyState(ctx, 'No usage matches these filters.'));
    return { title, state: 'empty', tables: [] };
  }
  const found = detectAllAnomalies(records);
  const list = [...found.total, ...found.source, ...found.assistant].sort(
    (a, b) => b.weekStart.localeCompare(a.weekStart) || b.zScore - a.zScore,
  );
  const flaggedWeeks = new Set(list.map((a) => a.weekStart));

  ctx.root.append(
    h(
      'section',
      { class: 'tiles', 'aria-label': 'Anomaly summary' },
      tile('Flagged weeks', String(flaggedWeeks.size), undefined, { 'data-tile': 'weeks', 'data-value': String(flaggedWeeks.size) }),
      tile('All-spend spikes', String(found.total.length), undefined, { 'data-tile': 'total' }),
      tile('Source spikes', String(found.source.length), undefined, { 'data-tile': 'source' }),
      tile('Assistant spikes', String(found.assistant.length), undefined, { 'data-tile': 'assistant' }),
    ),
  );

  const table: DataTable = {
    id: 'anomalies',
    title: 'Flagged weeks',
    columns: [
      { key: 'week_start', label: 'Week of', kind: 'date' },
      { key: 'scope', label: 'Scope' },
      { key: 'label', label: 'What' },
      { key: 'spend_usd', label: 'Spend', kind: 'usd' },
      { key: 'mean_usd', label: '4-week average', kind: 'usd' },
      { key: 'z_score', label: 'z-score', kind: 'number' },
      { key: 'explanation', label: 'Explanation' },
    ],
    rows: list.map((a) => [a.weekStart, SCOPE_TEXT[a.scope], a.scope === 'source' && a.source ? SOURCE_LABELS[a.source] : a.label, round2(a.value), round2(a.mean), round2(a.zScore), a.reason]),
  };

  const weeks = weeksInWindow(records, ctx);
  const totals = weeks.map((w) => round2(w.totalCostUsd));
  const trendTable: DataTable = {
    id: 'anomaly-weeks',
    title: 'Weekly spend with flagged weeks',
    columns: [
      { key: 'week_start', label: 'Week of', kind: 'date' },
      { key: 'cost_usd', label: 'Spend', kind: 'usd' },
      { key: 'flags', label: 'Flags', kind: 'number' },
    ],
    rows: weeks.map((w) => [w.weekStart, round2(w.totalCostUsd), list.filter((a) => a.weekStart === w.weekStart).length]),
  };
  const fig = chartFigure('anomaly-weeks', 'Weekly spend with flagged weeks', 'Triangles mark weeks with at least one anomaly (any scope).', trendTable, { wide: true, height: 280 });
  ctx.root.append(h('div', { class: 'grid' }, fig.figure));

  if (list.length === 0) {
    ctx.root.append(h('div', { class: 'state', 'data-state': 'none', role: 'status' }, h('p', {}, 'No weeks were flagged for these filters.')));
  } else {
    ctx.root.append(
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'anomaly-list-h' },
        h('h3', { id: 'anomaly-list-h' }, 'Flagged weeks, newest first'),
        h(
          'ul',
          { class: 'anomaly-list' },
          ...list.map((a) => {
            const route = routeFor(a);
            return h(
              'li',
              { 'data-anomaly': `${a.scope}:${a.key}:${a.weekStart}` },
              h('span', { class: 'badge level-warn' }, `${SCOPE_TEXT[a.scope]} · z ${a.zScore.toFixed(1)}`),
              ' ',
              h('strong', {}, shortDate(a.weekStart)),
              ': ',
              route ? h('a', { href: ctx.hrefFor(route) }, a.label) : a.label,
              ` spent ${formatUsd(a.value)} vs ${formatUsd(a.mean)} average.`,
              h('br'),
              h('span', { class: 'muted' }, a.reason),
            );
          }),
        ),
        h('details', { class: 'chart-table' }, h('summary', {}, 'Show as a table'), h('div', { class: 'table-scroll' }, renderTable(table))),
      ),
    );
  }

  const flagged = weeks.map((w) => (flaggedWeeks.has(w.weekStart) ? round2(w.totalCostUsd) : null));
  const chartsReady = ctx.charts
    .line(fig.canvas, {
      labels: weeks.map((w) => shortDate(w.weekStart)),
      series: [
        { label: 'Weekly spend', data: totals, color: totalColor(ctx.theme), width: 2 },
        { label: 'Flagged week', data: flagged, color: seriesColor(4), point: 'triangle', pointsOnly: true },
      ],
    })
    .then(() => undefined);

  return { title, state: 'ready', tables: [table, trendTable], chartsReady };
}
