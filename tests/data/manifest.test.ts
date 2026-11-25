import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAdapters } from '../../src/adapters/registry';
import {
  DatasetError,
  buildDataset,
  buildManifest,
  parseDataset,
  parseManifest,
  serializeDataset,
  serializeManifest,
} from '../../src/data/manifest';
import { collectFromAdapters } from '../../src/data/pipeline';
import { SOURCES, type UsageRecord } from '../../src/schema/usage';

const rec = (over: Partial<UsageRecord>): UsageRecord => ({
  date: '2026-09-01',
  source: 'cursor',
  assistant_or_project: 'ai-core',
  units: 10,
  unit_type: 'requests',
  cost_usd: 1,
  ...over,
});

describe('buildManifest', () => {
  it('computes counts, range, per-source totals, and a deterministic generated_at', () => {
    const rs = [
      rec({ date: '2026-09-03', cost_usd: 2.5 }),
      rec({ date: '2026-09-01', source: 'azure', unit_type: 'USD', units: 4, cost_usd: 4 }),
      rec({ date: '2026-09-02', cost_usd: 0.12345 }),
    ];
    const m = buildManifest(rs, { duplicatesRemoved: 2 });
    expect(m).toMatchObject({
      schema: 'usage.v1',
      schema_version: 1,
      generated_at: '2026-09-03T00:00:00Z',
      data_file: 'usage.v1.json',
      data_through: '2026-09-03',
      period_start: '2026-09-01',
      period_end: '2026-09-03',
      record_count: 3,
      total_cost_usd: 6.6235,
      duplicates_removed: 2,
    });
    expect(m.sources.map((s) => s.id)).toEqual([...SOURCES]);
    const cursor = m.sources.find((s) => s.id === 'cursor');
    expect(cursor).toEqual({
      id: 'cursor',
      label: 'Cursor',
      record_count: 2,
      cost_usd: 2.6235,
      units: 20,
      unit_type: 'requests',
      first_date: '2026-09-02',
      last_date: '2026-09-03',
    });
    expect(m.sources.find((s) => s.id === 'llm-api')).toMatchObject({ record_count: 0, first_date: null });
  });

  it('handles an empty dataset', () => {
    const m = buildManifest([]);
    expect(m.record_count).toBe(0);
    expect(m.data_through).toBeNull();
  });
});

describe('dataset round trip', () => {
  it('serializes one record per line and parses back', () => {
    const rs = [rec({}), rec({ date: '2026-09-02' })];
    const text = serializeDataset(buildDataset(rs));
    expect(text.split('\n').filter((l) => l.includes('"date"'))).toHaveLength(2);
    expect(parseDataset(JSON.parse(text))).toEqual(rs);
    expect(parseManifest(JSON.parse(serializeManifest(buildManifest(rs))))).toMatchObject({ record_count: 2 });
  });

  it('accepts a bare array and rejects other versions', () => {
    expect(parseDataset([rec({})])).toHaveLength(1);
    expect(() => parseDataset({ schema_version: 2, records: [] })).toThrow(DatasetError);
    expect(() => parseDataset({ schema_version: 1, records: [{ date: 'x' }] })).toThrow(/record\[0\]/);
  });

  it('rejects manifests with a path in data_file', () => {
    const m = { ...buildManifest([]), data_file: '../evil.json' };
    expect(() => parseManifest(m)).toThrow(/plain \.json/);
    expect(() => parseManifest(null)).toThrow(DatasetError);
  });
});

describe('committed public/data', () => {
  it('matches what npm run collect produces (run it after changing sample data)', async () => {
    const result = await collectFromAdapters(getAdapters());
    const manifest = buildManifest(result.records, { duplicatesRemoved: result.duplicatesRemoved });
    expect(readFileSync('public/data/manifest.json', 'utf8')).toBe(serializeManifest(manifest));
    expect(readFileSync('public/data/usage.v1.json', 'utf8')).toBe(serializeDataset(buildDataset(result.records)));
    expect(manifest.record_count).toBeGreaterThan(1000);
    const sum = manifest.sources.reduce((s, x) => s + x.cost_usd, 0);
    expect(sum).toBeCloseTo(manifest.total_cost_usd, 2);
  });
});
