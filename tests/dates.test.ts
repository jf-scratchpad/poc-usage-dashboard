import { describe, expect, it } from 'vitest';
import { dataAsOf, todayInTimeZone } from '../src/app/dates';

describe('dataAsOf', () => {
  const recs = [{ date: '2026-11-20' }, { date: '2026-11-22' }, { date: '2026-11-01' }];

  it('uses the latest record date when data ends before today', () => {
    expect(dataAsOf(recs, '2026-11-25')).toBe('2026-11-22');
  });

  it('uses today when data reaches today or later', () => {
    expect(dataAsOf(recs, '2026-11-22')).toBe('2026-11-22');
    expect(dataAsOf(recs, '2026-11-21')).toBe('2026-11-21');
  });

  it('uses today when there are no records', () => {
    expect(dataAsOf([], '2026-11-25')).toBe('2026-11-25');
  });
});

describe('todayInTimeZone', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayInTimeZone()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
