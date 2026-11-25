import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findGaps, qualityReport } from '../../src/data/quality';
import { buildManifest, parseDataset } from '../../src/data/manifest';
import type { UsageRecord } from '../../src/schema/usage';

const r = (date: string, over: Partial<UsageRecord> = {}): UsageRecord => ({
  date,
  source: 'cursor',
  assistant_or_project: 'ai-core',
  units: 1,
  unit_type: 'requests',
  cost_usd: 1,
  ...over,
});

describe('findGaps', () => {
  it('finds runs of missing days, including leading and trailing runs', () => {
    const days = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
    expect(findGaps(days, new Set(['d2', 'd3', 'd5']))).toEqual([
      { from: 'd1', to: 'd1', days: 1 },
      { from: 'd4', to: 'd4', days: 1 },
      { from: 'd6', to: 'd6', days: 1 },
    ]);
    expect(findGaps(days, new Set(days))).toEqual([]);
    expect(findGaps(days, new Set())).toEqual([{ from: 'd1', to: 'd6', days: 6 }]);
  });
});

describe('qualityReport', () => {
  it('reports coverage, gaps, zero-cost rows, and missing sources', () => {
    const rs = [r('2026-11-01'), r('2026-11-04', { cost_usd: 0 }), r('2026-11-01', { source: 'azure', unit_type: 'USD' }), r('2026-11-02', { source: 'azure', unit_type: 'USD' }), r('2026-11-03', { source: 'azure', unit_type: 'USD' }), r('2026-11-04', { source: 'azure', unit_type: 'USD' })];
    const q = qualityReport(rs);
    expect(q.period_start).toBe('2026-11-01');
    expect(q.period_end).toBe('2026-11-04');
    const cursor = q.sources.find((s) => s.id === 'cursor');
    expect(cursor).toMatchObject({ days_expected: 4, days_with_data: 2, coverage_pct: 50, zero_cost_records: 1 });
    expect(cursor?.gaps).toEqual([{ from: '2026-11-02', to: '2026-11-03', days: 2 }]);
    expect(q.sources.find((s) => s.id === 'azure')?.coverage_pct).toBe(100);
    expect(q.warnings).toContain('cursor: no data 2026-11-02..2026-11-03 (2 days)');
    expect(q.warnings).toContain('grok-bot: no records in 2026-11-01..2026-11-04');
  });

  it('handles empty input and an explicit range', () => {
    expect(qualityReport([]).warnings).toEqual(['no records']);
    const q = qualityReport([r('2026-11-02')], { from: '2026-11-01', to: '2026-11-03' });
    expect(q.sources.find((s) => s.id === 'cursor')?.gaps).toHaveLength(2);
  });
});

describe('sample data quality', () => {
  const records = parseDataset(JSON.parse(readFileSync('public/data/usage.v1.json', 'utf8')));
  it('every source covers the window; Cursor has a few weekend days with no usage', () => {
    const m = buildManifest(records);
    expect(m.quality.coverage_pct['grok-bot']).toBe(100);
    expect(m.quality.coverage_pct['llm-api']).toBe(100);
    expect(m.quality.gap_days.cursor).toBe(4);
    for (const w of m.quality.warnings) {
      const day = new Date(`${w.match(/\d{4}-\d{2}-\d{2}/)?.[0]}T00:00:00Z`).getUTCDay();
      expect([0, 6]).toContain(day);
    }
  });
});
