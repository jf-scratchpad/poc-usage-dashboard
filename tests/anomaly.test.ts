import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectAllAnomalies, detectAnomalies, detectSeriesAnomalies, meanStdev, weeklySeries } from '../src/anomaly';
import { parseDataset } from '../src/data/manifest';
import type { UsageRecord } from '../src/schema/usage';

describe('meanStdev', () => {
  it('sample standard deviation', () => {
    const { mean, stdev } = meanStdev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(mean).toBe(5);
    expect(stdev).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(meanStdev([])).toEqual({ mean: 0, stdev: 0 });
    expect(meanStdev([3]).stdev).toBe(0);
  });
});

describe('detectSeriesAnomalies', () => {
  const base = [100, 110, 90, 100];

  it('flags a spike above mean + 2σ of the prior window', () => {
    // prior [100,110,90,100]: mean 100, s = √(200/3) ≈ 8.165 → 2σ ≈ 116.3
    expect(detectSeriesAnomalies([...base, 116])).toEqual([]);
    const hit = detectSeriesAnomalies([...base, 117]);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ index: 4, value: 117, mean: 100 });
    expect(hit[0]?.zScore).toBeCloseTo(17 / Math.sqrt(200 / 3), 9);
  });

  it('ignores drops and respects minHistory', () => {
    expect(detectSeriesAnomalies([...base, 10])).toEqual([]);
    expect(detectSeriesAnomalies([100, 100, 500])).toEqual([]); // only 2 prior weeks
    expect(detectSeriesAnomalies([100, 100, 500], { minHistory: 2 })).toHaveLength(1);
  });

  it('uses only the rolling window, so old spikes do not mask new ones', () => {
    const vs = [1000, 100, 100, 100, 100, 300];
    const hits = detectSeriesAnomalies(vs, { window: 4 });
    expect(hits.map((h) => h.index)).toEqual([5]);
  });

  it('floors σ so a flat series does not flag cents, and minDeltaUsd skips tiny spikes', () => {
    expect(detectSeriesAnomalies([10, 10, 10, 10, 10.5])).toEqual([]);
    expect(detectSeriesAnomalies([10, 10, 10, 10, 14])).toEqual([]); // delta $4 < $5
    expect(detectSeriesAnomalies([10, 10, 10, 10, 16])).toHaveLength(1);
    expect(detectSeriesAnomalies([10, 10, 10, 10, 14], { minDeltaUsd: 1 })).toHaveLength(1);
  });

  it('threshold is configurable', () => {
    expect(detectSeriesAnomalies([...base, 112], { threshold: 1 })).toHaveLength(1);
    expect(detectSeriesAnomalies([...base, 117], { threshold: 3 })).toEqual([]);
  });

  it('validates options', () => {
    expect(() => detectSeriesAnomalies(base, { window: 1 })).toThrow(RangeError);
    expect(() => detectSeriesAnomalies(base, { threshold: 0 })).toThrow(RangeError);
    expect(() => detectSeriesAnomalies(base, { minHistory: 9 })).toThrow(RangeError);
  });
});

const r = (date: string, cost: number, over: Partial<UsageRecord> = {}): UsageRecord => ({
  date,
  source: 'cursor',
  assistant_or_project: 'ai-core',
  units: 1,
  unit_type: 'requests',
  cost_usd: cost,
  ...over,
});

describe('weeklySeries', () => {
  it('zero-fills weeks per key across the global range', () => {
    const rs = [r('2026-11-02', 5), r('2026-11-16', 7, { source: 'azure', unit_type: 'USD' })];
    const s = weeklySeries(rs, 'source');
    expect(s.map((x) => x.key)).toEqual(['azure', 'cursor']);
    expect(s[0]?.values).toEqual([0, 0, 7]);
    expect(s[1]?.values).toEqual([5, 0, 0]);
    expect(weeklySeries(rs, 'assistant')[0]?.label).toBe('ai-core (Azure)');
  });
});

describe('detectAnomalies', () => {
  it('reports source, assistant, and a readable reason', () => {
    const rs = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].map((d) => r(d, 50));
    rs.push(r('2026-11-02', 200));
    const [a] = detectAnomalies(rs, { scope: 'assistant' });
    expect(a).toMatchObject({ weekStart: '2026-11-02', key: 'cursor:ai-core', source: 'cursor', assistant: 'ai-core', value: 200, mean: 50 });
    expect(a?.reason).toMatch(/ai-core \(Cursor\) spent \$200\.00 in the week of 2026-11-02, .*σ above its 4-week average of \$50\.00/);
  });
});

describe('sample data spikes', () => {
  const records = parseDataset(JSON.parse(readFileSync('public/data/usage.v1.json', 'utf8')));
  const all = detectAllAnomalies(records);
  const has = (list: typeof all.source, week: string, key: string) => list.some((a) => a.weekStart === week && a.key === key);

  it('catches the invented mid-September Azure OpenAI spike', () => {
    expect(has(all.source, '2026-09-21', 'azure')).toBe(true);
    expect(has(all.total, '2026-09-21', 'total')).toBe(true);
  });

  it('catches the mid-October coding push', () => {
    expect(has(all.source, '2026-10-12', 'cursor')).toBe(true);
    expect(has(all.source, '2026-10-12', 'grok-bot')).toBe(true);
  });

  it('catches the late-October batch-evals run and the mid-November Cody spike', () => {
    expect(has(all.source, '2026-10-26', 'llm-api')).toBe(true);
    expect(has(all.assistant, '2026-10-26', 'llm-api:batch-evals')).toBe(true);
    expect(has(all.assistant, '2026-11-16', 'llm-api:Cody')).toBe(true);
  });

  it('is sorted by z-score and quiet weeks stay quiet at the source level', () => {
    const zs = all.source.map((a) => a.zScore);
    expect(zs).toEqual([...zs].sort((a, b) => b - a));
    expect(all.source.length).toBeLessThan(10);
  });
});
