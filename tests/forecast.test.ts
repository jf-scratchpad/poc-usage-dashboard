import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ForecastError, ewma, forecastBySource, forecastSeries, forecastWeekly, linearRegression } from '../src/forecast';
import { parseDataset } from '../src/data/manifest';
import { SOURCES, type UsageRecord } from '../src/schema/usage';

describe('linearRegression', () => {
  it('recovers an exact line with zero residual', () => {
    const lr = linearRegression([1, 3, 5, 7]);
    expect(lr.slope).toBeCloseTo(2, 12);
    expect(lr.intercept).toBeCloseTo(1, 12);
    expect(lr.stdev).toBe(0);
  });

  it('matches a hand-computed fit', () => {
    // x = 0..4, y = 2,4,5,4,5 → slope 0.6, intercept 2.8, SSE 2.4, s = √(2.4/3)
    const lr = linearRegression([2, 4, 5, 4, 5]);
    expect(lr.slope).toBeCloseTo(0.6, 12);
    expect(lr.intercept).toBeCloseTo(2.8, 12);
    expect(lr.stdev).toBeCloseTo(Math.sqrt(0.8), 12);
  });

  it('single point is flat', () => {
    expect(linearRegression([5])).toMatchObject({ slope: 0, intercept: 5, stdev: 0 });
    expect(() => linearRegression([])).toThrow(ForecastError);
  });
});

describe('forecastSeries (linear)', () => {
  it('extends a perfect line with a zero-width band', () => {
    const f = forecastSeries([10, 20, 30, 40], { horizon: 3 });
    expect(f.forecast.map((p) => p.value)).toEqual([50, 60, 70].map((v) => expect.closeTo(v, 9)));
    expect(f.forecast.every((p) => p.low === p.value && p.high === p.value)).toBe(true);
  });

  it('band widens with distance and uses the prediction-interval formula', () => {
    const ys = [2, 4, 5, 4, 5];
    const f = forecastSeries(ys, { horizon: 2, z: 1 });
    const s = Math.sqrt(0.8);
    const se5 = s * Math.sqrt(1 + 1 / 5 + (5 - 2) ** 2 / 10);
    expect(f.forecast[0]?.value).toBeCloseTo(2.8 + 0.6 * 5, 9);
    expect((f.forecast[0]?.high ?? 0) - (f.forecast[0]?.value ?? 0)).toBeCloseTo(se5, 9);
    const w0 = (f.forecast[0]?.high ?? 0) - (f.forecast[0]?.low ?? 0);
    const w1 = (f.forecast[1]?.high ?? 0) - (f.forecast[1]?.low ?? 0);
    expect(w1).toBeGreaterThan(w0);
  });

  it('clamps a falling trend at zero', () => {
    const f = forecastSeries([30, 20, 10], { horizon: 3 });
    expect(f.forecast.map((p) => p.value)).toEqual([0, 0, 0]);
    expect(f.forecast.every((p) => p.low >= 0)).toBe(true);
  });

  it('validates options', () => {
    expect(() => forecastSeries([1, 2], { horizon: 0 })).toThrow(/horizon/);
    expect(() => forecastSeries([1, Number.NaN])).toThrow(/finite/);
  });
});

describe('ewma', () => {
  it('computes levels and one-step predictions by hand', () => {
    // α = 0.5: L = 10, 15, 12.5; one-step = 10, 10, 15; errors 10, -5 → s = √(125/2)
    const e = ewma([10, 20, 10], 0.5);
    expect(e.levels).toEqual([10, 15, 12.5]);
    expect(e.oneStep).toEqual([10, 10, 15]);
    expect(e.stdev).toBeCloseTo(Math.sqrt(62.5), 12);
  });

  it('forecast is flat at the last level with a growing band', () => {
    const f = forecastSeries([10, 20, 10], { method: 'ewma', alpha: 0.5, horizon: 3, z: 1 });
    expect(f.forecast.map((p) => p.value)).toEqual([12.5, 12.5, 12.5]);
    const s = Math.sqrt(62.5);
    expect((f.forecast[2]?.high ?? 0) - 12.5).toBeCloseTo(s * Math.sqrt(1 + 2 * 0.25), 9);
  });

  it('constant series has zero band; bad alpha rejected', () => {
    const f = forecastSeries([7, 7, 7, 7], { method: 'ewma' });
    expect(f.forecast[0]).toEqual({ value: 7, low: 7, high: 7 });
    expect(() => ewma([1], 0)).toThrow(/alpha/);
    expect(() => ewma([1], 1.5)).toThrow(/alpha/);
  });
});

const r = (date: string, cost: number, source: UsageRecord['source'] = 'cursor'): UsageRecord => ({
  date,
  source,
  assistant_or_project: 'x',
  units: 1,
  unit_type: 'requests',
  cost_usd: cost,
});

describe('forecastWeekly', () => {
  it('labels forecast weeks after the last complete week', () => {
    const rs = [r('2026-11-02', 10), r('2026-11-09', 20), r('2026-11-16', 30), r('2026-11-22', 0)];
    const f = forecastWeekly(rs, { horizon: 2 });
    expect(f.history.map((h) => h.weekStart)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(f.forecast.map((p) => p.weekStart)).toEqual(['2026-11-23', '2026-11-30']);
    expect(f.source).toBe('all');
  });

  it('drops a trailing partial week unless asked to keep it', () => {
    const rs = [r('2026-11-09', 20), r('2026-11-16', 30), r('2026-11-17', 1)];
    expect(forecastWeekly(rs).history.map((h) => h.weekStart)).toEqual(['2026-11-09']);
    expect(forecastWeekly(rs, { keepPartialWeek: true }).history).toHaveLength(2);
  });

  it('filters by source and handles empty input', () => {
    const rs = [r('2026-11-16', 30), r('2026-11-22', 5, 'azure')];
    expect(forecastWeekly(rs, { source: 'azure' }).history).toEqual([{ weekStart: '2026-11-16', value: 5 }]);
    expect(forecastWeekly([], {})).toMatchObject({ history: [], forecast: [] });
  });
});

describe('sample data forecast', () => {
  const records = parseDataset(JSON.parse(readFileSync('public/data/usage.v1.json', 'utf8')));

  it('12 complete weeks, an upward total trend, and 4 forecast weeks with ordered bands', () => {
    const f = forecastWeekly(records);
    expect(f.history).toHaveLength(12);
    expect(f.slope).toBeGreaterThan(0);
    expect(f.forecast).toHaveLength(4);
    for (const p of f.forecast) {
      expect(p.low).toBeLessThanOrEqual(p.value);
      expect(p.high).toBeGreaterThanOrEqual(p.value);
    }
    expect(f.forecast[0]?.weekStart).toBe('2026-11-23');
  });

  it('per-source forecasts cover every source and both methods work', () => {
    const lin = forecastBySource(records);
    const ew = forecastBySource(records, { method: 'ewma' });
    expect(Object.keys(lin).sort()).toEqual([...SOURCES].sort());
    for (const s of SOURCES) {
      expect(lin[s].forecast).toHaveLength(4);
      expect(ew[s].method).toBe('ewma');
      expect(ew[s].forecast[0]?.value).toBeGreaterThan(0);
    }
  });
});
