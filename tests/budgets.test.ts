import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BudgetConfigError,
  alertLevel,
  budgetMatches,
  budgetSummary,
  evaluateBudget,
  evaluateBudgets,
  loadBudgetConfig,
  monthEnd,
  parseBudgetConfig,
  periodBounds,
  type BudgetConfig,
} from '../src/budgets';
import { parseDataset } from '../src/data/manifest';
import type { UsageRecord } from '../src/schema/usage';

const T = { warn_pct: 80, over_pct: 100 };
const rec = (date: string, cost: number, over: Partial<UsageRecord> = {}): UsageRecord => ({
  date,
  source: 'grok-bot',
  assistant_or_project: 'Cody',
  units: 1,
  unit_type: 'requests',
  cost_usd: cost,
  ...over,
});
const cfg = (budgets: BudgetConfig['budgets']): BudgetConfig => ({ thresholds: T, budgets });

describe('alert levels', () => {
  it('uses 80% warn and 100% over, inclusive', () => {
    expect(alertLevel(79.99, T)).toBe('ok');
    expect(alertLevel(80, T)).toBe('warn');
    expect(alertLevel(99.99, T)).toBe('warn');
    expect(alertLevel(100, T)).toBe('over');
    expect(alertLevel(250, T)).toBe('over');
  });
});

describe('periods', () => {
  it('month and ISO week bounds', () => {
    expect(periodBounds('month', '2026-11-22')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(periodBounds('month', '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodBounds('week', '2026-11-22')).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    expect(periodBounds('week', '2026-11-16')).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    expect(monthEnd('2026-12-05')).toBe('2026-12-31');
  });
});

describe('evaluateBudget', () => {
  it('computes spend, percent, run-rate projection, and levels', () => {
    // $10/day for Nov 1..15 = $150 by the 15th; 30-day month projects $300.
    const rs = Array.from({ length: 15 }, (_, i) => rec(`2026-11-${String(i + 1).padStart(2, '0')}`, 10));
    rs.push(rec('2026-10-31', 999)); // previous month ignored
    rs.push(rec('2026-11-20', 999)); // after asOf ignored
    const s = evaluateBudget(rs, { id: 'm', scope: 'total', period: 'month', amount_usd: 200 }, cfg([]), '2026-11-15');
    expect(s).toMatchObject({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      elapsedDays: 15,
      periodDays: 30,
      spentUsd: 150,
      remainingUsd: 50,
      pctUsed: 75,
      projectedUsd: 300,
      projectedPct: 150,
      level: 'ok',
      projectedLevel: 'over',
      label: 'All sources (monthly)',
    });
  });

  it('weekly budget on the last day of the week has projection = spend', () => {
    const rs = [rec('2026-11-16', 40), rec('2026-11-22', 50)];
    const s = evaluateBudget(rs, { id: 'w', scope: 'total', period: 'week', amount_usd: 100 }, cfg([]), '2026-11-22');
    expect(s.spentUsd).toBe(90);
    expect(s.projectedUsd).toBe(90);
    expect(s.level).toBe('warn');
  });

  it('a period with no spend is ok at 0%', () => {
    const s = evaluateBudget([], { id: 'w', scope: 'total', period: 'week', amount_usd: 100 }, cfg([]), '2026-11-22');
    expect(s).toMatchObject({ spentUsd: 0, pctUsed: 0, projectedUsd: 0, level: 'ok' });
  });

  it('rejects a bad asOf', () => {
    expect(() => evaluateBudget([], { id: 'w', scope: 'total', period: 'week', amount_usd: 1 }, cfg([]), '11/22/2026')).toThrow(
      BudgetConfigError,
    );
  });
});

describe('budget matching', () => {
  it('source scope matches by source id', () => {
    expect(budgetMatches({ id: 'a', scope: 'source', key: 'cursor', period: 'month', amount_usd: 1 }, rec('2026-11-01', 1, { source: 'cursor' }))).toBe(true);
    expect(budgetMatches({ id: 'a', scope: 'source', key: 'cursor', period: 'month', amount_usd: 1 }, rec('2026-11-01', 1))).toBe(false);
  });

  it('assistant scope spans sources, case-insensitively, optionally narrowed', () => {
    const def = { id: 'c', scope: 'assistant' as const, key: 'cody', period: 'month' as const, amount_usd: 10 };
    const rs = [rec('2026-11-01', 3), rec('2026-11-01', 4, { source: 'llm-api', unit_type: 'tokens' }), rec('2026-11-01', 100, { assistant_or_project: 'Rocky' })];
    expect(evaluateBudget(rs, def, cfg([]), '2026-11-01').spentUsd).toBe(7);
    expect(evaluateBudget(rs, { ...def, source: 'llm-api' }, cfg([]), '2026-11-01').spentUsd).toBe(4);
  });
});

describe('evaluateBudgets', () => {
  it('sorts worst first and summarizes', () => {
    const rs = [rec('2026-11-22', 50)];
    const c = cfg([
      { id: 'ok', scope: 'total', period: 'week', amount_usd: 1000 },
      { id: 'over', scope: 'total', period: 'week', amount_usd: 40 },
      { id: 'warn', scope: 'total', period: 'week', amount_usd: 55 },
    ]);
    const out = evaluateBudgets(rs, c, '2026-11-22');
    expect(out.map((s) => s.id)).toEqual(['over', 'warn', 'ok']);
    expect(budgetSummary(out)).toEqual({ ok: 1, warn: 1, over: 1, projectedOver: 1 });
  });
});

describe('parseBudgetConfig', () => {
  const base = { thresholds: T, budgets: [{ id: 'a', scope: 'total', period: 'week', amount_usd: 5 }] };
  it('accepts a valid config and defaults thresholds', () => {
    expect(parseBudgetConfig(base).budgets).toHaveLength(1);
    expect(parseBudgetConfig({ budgets: [] }).thresholds).toEqual(T);
  });
  it.each([
    [{ ...base, thresholds: { warn_pct: 100, over_pct: 80 } }, /thresholds/],
    [{ budgets: [{ id: 'a', scope: 'team', period: 'week', amount_usd: 5 }] }, /scope/],
    [{ budgets: [{ id: 'a', scope: 'total', period: 'day', amount_usd: 5 }] }, /period/],
    [{ budgets: [{ id: 'a', scope: 'total', period: 'week', amount_usd: 0 }] }, /amount_usd/],
    [{ budgets: [{ id: 'a', scope: 'source', key: 'nope', period: 'week', amount_usd: 5 }] }, /known source/],
    [{ budgets: [{ id: 'a', scope: 'assistant', key: ' ', period: 'week', amount_usd: 5 }] }, /assistant/],
    [{ budgets: [base.budgets[0], base.budgets[0]] }, /duplicate id/],
    [{ budgets: 'x' }, /budgets array/],
  ])('rejects bad config %#', (raw, re) => {
    expect(() => parseBudgetConfig(raw)).toThrow(re);
  });
});

describe('bundled config against the sample data (as of 2026-11-22)', () => {
  const records = parseDataset(JSON.parse(readFileSync('public/data/usage.v1.json', 'utf8')));
  const statuses = evaluateBudgets(records, loadBudgetConfig(), '2026-11-22');

  it('evaluates every budget and has a mix of levels', () => {
    expect(statuses).toHaveLength(loadBudgetConfig().budgets.length);
    const sum = budgetSummary(statuses);
    expect(sum.ok).toBeGreaterThan(0);
    expect(sum.warn).toBeGreaterThan(0);
    expect(sum.over).toBeGreaterThan(0);
  });

  it('flags the LLM API weekly budget as over (mid-November Cody spike)', () => {
    expect(statuses.find((s) => s.id === 'llm-api-week')?.level).toBe('over');
    expect(statuses[0]?.level).toBe('over');
  });

  it('Cody monthly spans Grok Bot and LLM API', () => {
    const cody = statuses.find((s) => s.id === 'cody-month');
    const direct = records.filter((r) => r.date >= '2026-11-01' && r.assistant_or_project === 'Cody').reduce((s, r) => s + r.cost_usd, 0);
    expect(cody?.spentUsd).toBeCloseTo(direct, 6);
    expect(cody?.level).toBe('warn');
    expect(cody?.projectedLevel).toBe('over');
  });
});
