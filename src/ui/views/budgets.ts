import { budgetSummary, evaluateBudgets, loadBudgetConfig, type AlertLevel, type BudgetStatus } from '../../budgets';
import { SOURCE_LABELS, formatUsd } from '../../app/format';
import { isSource } from '../../schema/usage';
import { h } from '../dom';
import { matchesQuery } from '../filters';
import { round2 } from '../stats';
import { renderTable, type DataTable } from '../table';
import { emptyState, longDate, tile, viewHeader } from './common';
import type { ViewContext, ViewResult } from './types';

export const LEVEL_TEXT: Record<AlertLevel, string> = { ok: 'On track', warn: 'Warning', over: 'Over budget' };
const LEVEL_ICON: Record<AlertLevel, string> = { ok: '✓', warn: '!', over: '✕' };

/**
 * Budgets measure the current week or month as of the latest data day, so the
 * date-range filter does not apply. The source filter hides source budgets for
 * unchecked sources, and the assistant search narrows assistant budgets.
 */
export function visibleBudgets(statuses: readonly BudgetStatus[], ctx: Pick<ViewContext, 'filters'>): BudgetStatus[] {
  return statuses.filter((s) => {
    if (s.scope === 'source') return isSource(s.key) && ctx.filters.sources.includes(s.key);
    if (s.scope === 'assistant') return matchesQuery(s.key, ctx.filters.q);
    return true;
  });
}

function badge(level: AlertLevel, prefix = ''): HTMLElement {
  return h('span', { class: `badge level-${level}`, 'data-level': level }, `${LEVEL_ICON[level]} ${prefix}${LEVEL_TEXT[level]}`);
}

function pct(n: number): string {
  return `${n.toFixed(0)}%`;
}

function budgetCard(s: BudgetStatus, ctx: ViewContext): HTMLElement {
  const fill = Math.min(100, Math.max(0, s.pctUsed));
  const marker = Math.min(100, Math.max(0, s.projectedPct));
  const scopeLink =
    s.scope === 'source' && isSource(s.key)
      ? h('a', { href: ctx.hrefFor({ name: 'source', source: s.key }) }, SOURCE_LABELS[s.key])
      : s.scope === 'assistant'
        ? h('a', { href: ctx.hrefFor({ name: 'assistant', assistant: s.key }) }, s.key)
        : 'All sources';
  const barId = `budget-${s.id}`;
  return h(
    'article',
    { class: 'panel budget', 'data-budget': s.id, 'data-level': s.level, 'aria-labelledby': `${barId}-h` },
    h('div', { class: 'budget-head' }, h('h3', { id: `${barId}-h` }, s.label), badge(s.level)),
    h('p', { class: 'muted budget-meta' }, scopeLink, ` · ${s.period === 'month' ? 'Month' : 'Week'} of ${longDate(s.periodStart)} – ${longDate(s.periodEnd)} · day ${s.elapsedDays} of ${s.periodDays}`),
    h(
      'div',
      {
        class: `progress level-${s.level}`,
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(Math.round(fill)),
        'aria-valuetext': `${pct(s.pctUsed)} used, projected ${pct(s.projectedPct)}`,
        'aria-labelledby': `${barId}-h`,
      },
      h('span', { style: `width:${fill}%` }),
      h('i', { style: `left:calc(${marker}% - 1px)`, title: `Projected ${pct(s.projectedPct)}` }),
    ),
    h(
      'p',
      { class: 'budget-figures' },
      h('strong', {}, formatUsd(s.spentUsd)),
      ` of ${formatUsd(s.budgetUsd)} (${pct(s.pctUsed)})`,
      ' · projected ',
      h('strong', { 'data-projected': String(round2(s.projectedUsd)) }, formatUsd(s.projectedUsd)),
      ` by ${longDate(s.periodEnd)} `,
      s.projectedLevel !== s.level || s.projectedLevel !== 'ok' ? badge(s.projectedLevel, 'Projected: ') : null,
    ),
  );
}

export function render(ctx: ViewContext): ViewResult {
  const title = 'Budgets';
  const config = loadBudgetConfig();
  const all = evaluateBudgets(ctx.data.records, config, ctx.data.asOf);
  const shown = visibleBudgets(all, ctx);
  ctx.root.append(
    viewHeader(
      title,
      `Current week and month as of ${longDate(ctx.data.asOf)}. Warning at ${config.thresholds.warn_pct}% and over at ${config.thresholds.over_pct}%; the marker shows the projected end-of-period spend. The date range filter does not apply here.`,
    ),
  );
  if (shown.length === 0) {
    ctx.root.append(emptyState(ctx, 'No budgets match the selected sources or search.'));
    return { title, state: 'empty', tables: [] };
  }

  const sum = budgetSummary(shown);
  ctx.root.append(
    h(
      'section',
      { class: 'tiles', 'aria-label': 'Budget summary' },
      tile('Over budget', String(sum.over), 'already past 100%', { 'data-tile': 'over' }),
      tile('Warning', String(sum.warn), `past ${config.thresholds.warn_pct}%`, { 'data-tile': 'warn' }),
      tile('On track', String(sum.ok), undefined, { 'data-tile': 'ok' }),
      tile('Projected over', String(sum.projectedOver), 'at end of period', { 'data-tile': 'projected-over' }),
    ),
  );

  const table: DataTable = {
    id: 'budgets',
    title: 'Budget status',
    columns: [
      { key: 'label', label: 'Budget' },
      { key: 'period', label: 'Period' },
      { key: 'period_end', label: 'Ends', kind: 'date' },
      { key: 'budget_usd', label: 'Budget', kind: 'usd' },
      { key: 'spent_usd', label: 'Spent', kind: 'usd' },
      { key: 'pct_used', label: '% used', kind: 'pct' },
      { key: 'projected_usd', label: 'Projected', kind: 'usd' },
      { key: 'projected_pct', label: 'Projected %', kind: 'pct' },
      { key: 'level', label: 'Status' },
      { key: 'projected_level', label: 'Projected status' },
    ],
    rows: shown.map((s) => [
      s.label,
      s.period,
      s.periodEnd,
      round2(s.budgetUsd),
      round2(s.spentUsd),
      round2(s.pctUsed / 100),
      round2(s.projectedUsd),
      round2(s.projectedPct / 100),
      LEVEL_TEXT[s.level],
      LEVEL_TEXT[s.projectedLevel],
    ]),
  };

  ctx.root.append(
    h('div', { class: 'budget-list' }, ...shown.map((s) => budgetCard(s, ctx))),
    h('details', { class: 'panel chart-table', 'data-chart': 'budgets' }, h('summary', {}, 'Show budgets as a table'), h('div', { class: 'table-scroll' }, renderTable(table))),
  );
  return { title, state: 'ready', tables: [table] };
}
