import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildInsights } from '../src/insights';
import { parseDataset } from '../src/data/manifest';
import type { UsageRecord } from '../src/schema/usage';

const records = parseDataset(JSON.parse(readFileSync('public/data/usage.v1.json', 'utf8')));

describe('buildInsights (sample data, as of 2026-11-22)', () => {
  const ins = buildInsights(records, '2026-11-22');

  it('summarizes budgets with the worst first', () => {
    expect(ins.budgets.statuses.length).toBeGreaterThan(0);
    expect(ins.budgets.worst?.level).toBe('over');
    expect(ins.headlines[0]).toMatch(/budget.*over; worst: /);
  });

  it('forecasts next week and reports the trend', () => {
    expect(ins.nextWeek?.weekStart).toBe('2026-11-23');
    expect(ins.weeklyTrendUsd).toBeGreaterThan(0);
    expect(ins.headlines.some((h) => h.startsWith("Next week's spend is forecast at $"))).toBe(true);
  });

  it('lists recent anomalies newest first and cross-source assistants', () => {
    const weeks = ins.recentAnomalies.map((a) => a.weekStart);
    expect(weeks).toEqual([...weeks].sort().reverse());
    expect(ins.recentAnomalies.length).toBeLessThanOrEqual(3);
    expect(ins.crossSourceAssistants.length).toBeGreaterThan(0);
    expect(ins.totalSpendUsd).toBeCloseTo(records.reduce((s, r) => s + r.cost_usd, 0), 6);
  });

  it('ignores records after asOf', () => {
    const earlier = buildInsights(records, '2026-10-31');
    expect(earlier.totalSpendUsd).toBeLessThan(ins.totalSpendUsd);
    expect(earlier.nextWeek?.weekStart).toBe('2026-10-26');
  });
});

describe('buildInsights edge cases', () => {
  it('says all budgets are fine when spend is tiny, and copes with no anomalies', () => {
    const rs: UsageRecord[] = [{ date: '2026-11-22', source: 'cursor', assistant_or_project: 'x', units: 1, unit_type: 'requests', cost_usd: 0.01 }];
    const ins = buildInsights(rs, '2026-11-22');
    expect(ins.headlines[0]).toBe('All budgets are within limits');
    expect(ins.recentAnomalies).toEqual([]);
  });
});
