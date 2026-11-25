import { describe, expect, it } from 'vitest';
import {
  filterBySources,
  isoWeekEnd,
  isoWeekKey,
  isoWeekStart,
  topConsumers,
  totalSpend,
  totalsByAssistant,
  totalsByWeek,
  weekOverWeekTrend,
} from '../src/aggregate';
import type { UsageRecord } from '../src/schema/usage';

function rec(partial: Partial<UsageRecord> & Pick<UsageRecord, 'date' | 'source' | 'assistant_or_project' | 'cost_usd'>): UsageRecord {
  return {
    units: 100,
    unit_type: 'tokens',
    ...partial,
  };
}

const sample: UsageRecord[] = [
  rec({ date: '2026-11-23', source: 'cursor', assistant_or_project: 'Cursor Agent', cost_usd: 10, units: 1000, unit_type: 'requests' }),
  rec({ date: '2026-11-24', source: 'cursor', assistant_or_project: 'Cursor Agent', cost_usd: 5, units: 500, unit_type: 'requests' }),
  rec({ date: '2026-11-23', source: 'grok-bot', assistant_or_project: 'Cody', cost_usd: 20, units: 2_000_000, unit_type: 'tokens' }),
  rec({ date: '2026-11-16', source: 'azure', assistant_or_project: 'ai-core', cost_usd: 8, units: 1, unit_type: 'USD' }),
  rec({ date: '2026-11-18', source: 'azure', assistant_or_project: 'ai-core', cost_usd: 2, units: 1, unit_type: 'USD' }),
  rec({ date: '2026-10-07', source: 'grok-bot', assistant_or_project: 'Rocky', cost_usd: 3, units: 100, unit_type: 'tokens' }),
];

describe('iso weeks (Monday start)', () => {
  it('maps mid-week and weekend dates to the Monday', () => {
    expect(isoWeekStart('2026-11-25')).toBe('2026-11-23'); // Wednesday
    expect(isoWeekStart('2026-11-23')).toBe('2026-11-23'); // Monday
    expect(isoWeekStart('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(isoWeekStart('2026-11-28')).toBe('2026-11-23'); // Saturday
  });

  it('uses the ISO week-year (Thursday rule) at year boundaries', () => {
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01');
    expect(isoWeekStart('2026-01-01')).toBe('2025-12-29');
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    expect(isoWeekKey('2026-11-25')).toBe('2026-W48');
    expect(isoWeekKey('2026-12-28')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01');
  });

  it('returns the Sunday at the end of the week', () => {
    expect(isoWeekEnd('2026-11-23')).toBe('2026-11-29');
  });
});

describe('filterBySources', () => {
  it('keeps only the requested sources', () => {
    const cursor = filterBySources(sample, ['cursor']);
    expect(cursor).toHaveLength(2);
    expect(cursor.every((r) => r.source === 'cursor')).toBe(true);
  });

  it('returns an empty list when no sources are selected', () => {
    expect(filterBySources(sample, [])).toEqual([]);
  });

  it('can keep more than one source', () => {
    const mixed = filterBySources(sample, ['cursor', 'azure']);
    expect(mixed).toHaveLength(4);
  });
});

describe('totalsByWeek', () => {
  it('rolls up cost by week and by source', () => {
    const thisWeek = totalsByWeek(sample).find((w) => w.weekStart === '2026-11-23');
    expect(thisWeek?.totalCostUsd).toBe(35);
    expect(thisWeek?.bySource.cursor).toBe(15);
    expect(thisWeek?.bySource['grok-bot']).toBe(20);
    expect(thisWeek?.bySource.azure).toBe(0);
    expect(thisWeek?.weekKey).toBe('2026-W48');
  });

  it('fills zero weeks between the first and last dates', () => {
    const weeks = totalsByWeek(sample);
    expect(weeks[0]?.weekStart).toBe('2026-10-05');
    expect(weeks.at(-1)?.weekStart).toBe('2026-11-23');
    const empty = weeks.find((w) => w.weekStart === '2026-10-12');
    expect(empty).toBeDefined();
    expect(empty?.totalCostUsd).toBe(0);
  });

  it('returns an empty list when there are no records and no bounds', () => {
    expect(totalsByWeek([])).toEqual([]);
  });

  it('extends the range to an explicit as-of date', () => {
    const weeks = totalsByWeek(sample, { to: '2026-11-30' });
    expect(weeks.at(-1)?.weekStart).toBe('2026-11-30');
    expect(weeks.at(-1)?.totalCostUsd).toBe(0);
  });
});

describe('totalsByAssistant and topConsumers', () => {
  it('groups by source and name, sorted by cost descending', () => {
    const ranked = totalsByAssistant(sample);
    expect(ranked.map((r) => r.assistant_or_project)).toEqual(['Cody', 'Cursor Agent', 'ai-core', 'Rocky']);
    expect(ranked[0]?.cost_usd).toBe(20);
    expect(ranked[1]?.cost_usd).toBe(15);
    expect(ranked[1]?.units).toBe(1500);
    expect(ranked[1]?.unit_types).toEqual(['requests']);
  });

  it('keeps the same name on two sources as separate consumers', () => {
    const rows = totalsByAssistant([
      rec({ date: '2026-11-23', source: 'grok-bot', assistant_or_project: 'Cody', cost_usd: 4 }),
      rec({ date: '2026-11-23', source: 'cursor', assistant_or_project: 'Cody', cost_usd: 6 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.source).toBe('cursor');
    expect(rows[1]?.source).toBe('grok-bot');
  });

  it('records mixed unit types without dropping either', () => {
    const [row] = totalsByAssistant([
      rec({ date: '2026-11-23', source: 'azure', assistant_or_project: 'ai-core', cost_usd: 1, units: 1, unit_type: 'USD' }),
      rec({ date: '2026-11-24', source: 'azure', assistant_or_project: 'ai-core', cost_usd: 1, units: 10, unit_type: 'requests' }),
    ]);
    expect(row?.unit_types).toEqual(['USD', 'requests']);
    expect(row?.units).toBe(11);
  });

  it('caps top consumers and handles a non-positive n', () => {
    expect(topConsumers(sample, 2).map((r) => r.assistant_or_project)).toEqual(['Cody', 'Cursor Agent']);
    expect(topConsumers(sample, 0)).toEqual([]);
    expect(topConsumers(sample, -3)).toEqual([]);
  });

  it('breaks cost ties by name', () => {
    const rows = totalsByAssistant([
      rec({ date: '2026-11-23', source: 'cursor', assistant_or_project: 'Zed', cost_usd: 5 }),
      rec({ date: '2026-11-23', source: 'cursor', assistant_or_project: 'Ada', cost_usd: 5 }),
    ]);
    expect(rows.map((r) => r.assistant_or_project)).toEqual(['Ada', 'Zed']);
  });
});

describe('weekOverWeekTrend and totalSpend', () => {
  it('compares this week to last week for a pinned as-of date', () => {
    const wow = weekOverWeekTrend(sample, '2026-11-25');
    expect(wow.thisWeekStart).toBe('2026-11-23');
    expect(wow.lastWeekStart).toBe('2026-11-16');
    expect(wow.thisWeekCost).toBe(35);
    expect(wow.lastWeekCost).toBe(10);
    expect(wow.deltaUsd).toBe(25);
    expect(wow.deltaPct).toBe(250);
  });

  it('returns a null percentage when last week is zero', () => {
    const wow = weekOverWeekTrend(sample, '2026-10-07');
    expect(wow.thisWeekCost).toBe(3);
    expect(wow.lastWeekCost).toBe(0);
    expect(wow.deltaPct).toBeNull();
  });

  it('handles an empty record list', () => {
    const wow = weekOverWeekTrend([], '2026-11-25');
    expect(wow.thisWeekCost).toBe(0);
    expect(wow.lastWeekCost).toBe(0);
    expect(wow.deltaUsd).toBe(0);
    expect(wow.deltaPct).toBeNull();
  });

  it('sums total spend', () => {
    expect(totalSpend(sample)).toBe(48);
    expect(totalSpend([])).toBe(0);
  });
});
