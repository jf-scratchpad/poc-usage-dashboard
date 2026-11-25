// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { go, mountApp, q, type Mounted } from './mount';
import { evaluateBudgets, loadBudgetConfig } from '../../src/budgets';
import { forecastWeekly } from '../../src/forecast';
import { detectAllAnomalies } from '../../src/anomaly';
import { visibleBudgets } from '../../src/ui/views/budgets';
import { defaultFilters } from '../../src/ui/filters';
import type { UsageRecord } from '../../src/schema/usage';
import { FIXTURE_AS_OF, FIXTURE_RECORDS } from '../fixtures';

// A clear spike in the week of 2026-11-09 so anomaly detection has something to flag.
const SPIKY: UsageRecord[] = [
  ...FIXTURE_RECORDS,
  { date: '2026-11-11', source: 'azure', assistant_or_project: 'ai-core', units: 400, unit_type: 'USD', cost_usd: 400 },
];

describe('budgets view', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('renders one card per budget with an accessible progress bar, badges, and projected spend', async () => {
    m = await mountApp('#/budgets');
    const statuses = evaluateBudgets(FIXTURE_RECORDS, loadBudgetConfig(), FIXTURE_AS_OF);
    const cards = m.root.querySelectorAll('[data-budget]');
    expect(cards).toHaveLength(statuses.length);
    const first = statuses[0];
    if (!first) throw new Error('no budgets');
    const card = q(m.root, `[data-budget="${first.id}"]`);
    const bar = q(card, '[role="progressbar"]');
    expect(bar.getAttribute('aria-valuetext')).toContain('used, projected');
    expect(q(card, '.badge').textContent).toMatch(/On track|Warning|Over budget/);
    expect(Number(q(card, '[data-projected]').dataset.projected)).toBeCloseTo(first.projectedUsd, 2);
    const sum = ['over', 'warn', 'ok'].map((k) => Number(q(m!.root, `[data-tile="${k}"] .tile-value`).textContent));
    expect(sum.reduce((a, b) => a + b, 0)).toBe(statuses.length);
    expect(m.shell.buildExport('csv')?.text.split('\r\n')[0]).toBe('Budget,Period,Ends,Budget,Spent,% used,Projected,Projected %,Status,Projected status');
  });

  it('hides source budgets for unchecked sources and narrows assistant budgets by search', async () => {
    const statuses = evaluateBudgets(FIXTURE_RECORDS, loadBudgetConfig(), FIXTURE_AS_OF);
    const shown = visibleBudgets(statuses, { filters: { ...defaultFilters(), sources: ['azure'], q: 'cody' } });
    expect(shown.every((s) => s.scope === 'total' || (s.scope === 'source' && s.key === 'azure') || (s.scope === 'assistant' && s.key.toLowerCase().includes('cody')))).toBe(true);
    expect(shown.some((s) => s.scope === 'assistant')).toBe(true);
    m = await mountApp('#/budgets?src=azure&q=cody');
    expect(m.root.querySelectorAll('[data-budget]')).toHaveLength(shown.length);
  });
});

describe('forecast view', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('shows the next 4 weeks with a band and per-source totals', async () => {
    m = await mountApp('#/forecast');
    const fc = forecastWeekly(FIXTURE_RECORDS, { method: 'linear', horizon: 4 });
    expect(Number(q(m.root, '[data-tile="next"]').dataset.value)).toBeCloseTo(fc.forecast[0]?.value ?? -1, 2);
    const rows = [...m.root.querySelectorAll('table[data-table="forecast"] tbody tr')];
    expect(rows.filter((r) => r.textContent?.includes('forecast'))).toHaveLength(4);
    expect(rows.length).toBe(fc.history.length + 4);
    expect(q(m.root, 'figure[data-chart="forecast"] canvas')).toBeTruthy();
    expect(m.root.querySelectorAll('table[data-table="forecast-by-source"] tbody tr').length).toBeGreaterThan(0);
  });

  it('asks for a wider range when there is too little history', async () => {
    m = await mountApp('#/forecast?range=custom&from=2026-11-16&to=2026-11-25');
    expect(q(m.root, 'main [data-state="empty"]').textContent).toContain('at least 3 complete weeks');
  });
});

describe('anomalies view', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('lists flagged weeks with explanations and drill-down links', async () => {
    m = await mountApp('#/anomalies', SPIKY);
    const found = detectAllAnomalies(SPIKY);
    const total = found.total.length + found.source.length + found.assistant.length;
    expect(total).toBeGreaterThan(0);
    expect(m.root.querySelectorAll('[data-anomaly]')).toHaveLength(total);
    const item = q(m.root, '[data-anomaly^="source:azure:2026-11-09"]');
    expect(item.textContent).toContain('above its 4-week average');
    expect(q<HTMLAnchorElement>(item, 'a').getAttribute('href')).toBe('#/source/azure');
    const flagged = [...m.root.querySelectorAll('table[data-table="anomaly-weeks"] tbody tr')].find((r) => r.textContent?.includes('2026-11-09'));
    expect(Number(flagged?.lastElementChild?.textContent)).toBeGreaterThan(0);
  });

  it('says so when nothing is flagged, and shows the empty state when filters match nothing', async () => {
    m = await mountApp('#/anomalies');
    if (detectAllAnomalies(FIXTURE_RECORDS).total.length === 0) {
      expect(m.root.querySelectorAll('[data-anomaly]').length).toBe(
        detectAllAnomalies(FIXTURE_RECORDS).source.length + detectAllAnomalies(FIXTURE_RECORDS).assistant.length,
      );
    }
    await go(m, '#/anomalies?src=');
    expect(q(m.root, 'main [data-state="empty"]')).toBeTruthy();
  });
});
