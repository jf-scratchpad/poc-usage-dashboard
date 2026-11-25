import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadUsageData } from '../../src/data/load';

const files: Record<string, string> = {
  './data/manifest.json': readFileSync('public/data/manifest.json', 'utf8'),
  './data/usage.v1.json': readFileSync('public/data/usage.v1.json', 'utf8'),
};

const fakeFetch = (overrides: Record<string, string | number> = {}) => async (url: string) => {
  const o = overrides[url];
  if (typeof o === 'number') return { ok: false, status: o, json: async () => ({}) };
  const body = o ?? files[url];
  if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(body) as unknown };
};

describe('loadUsageData', () => {
  it('loads the collected JSON when it is present and consistent', async () => {
    const r = await loadUsageData({ fetchImpl: fakeFetch() });
    expect(r.origin).toBe('json');
    expect(r.manifest?.record_count).toBe(r.records.length);
  });

  it('falls back to bundled adapters when the manifest is missing', async () => {
    const r = await loadUsageData({ fetchImpl: fakeFetch({ './data/manifest.json': 404 }) });
    expect(r.origin).toBe('bundled');
    expect(r.manifest).toBeNull();
    expect(r.fallbackReason).toMatch(/404/);
    expect(r.records.length).toBeGreaterThan(1000);
  });

  it('falls back when record counts disagree', async () => {
    const m = JSON.parse(files['./data/manifest.json'] ?? '{}') as Record<string, unknown>;
    const r = await loadUsageData({
      fetchImpl: fakeFetch({ './data/manifest.json': JSON.stringify({ ...m, record_count: 3 }) }),
    });
    expect(r.origin).toBe('bundled');
    expect(r.fallbackReason).toMatch(/manifest says 3/);
  });

  it('falls back when the dataset has an invalid record', async () => {
    const r = await loadUsageData({
      fetchImpl: fakeFetch({ './data/usage.v1.json': JSON.stringify({ schema_version: 1, records: [{}] }) }),
    });
    expect(r.origin).toBe('bundled');
  });

  it('json and bundled paths give the same totals', async () => {
    const a = await loadUsageData({ fetchImpl: fakeFetch() });
    const b = await loadUsageData({ fetchImpl: fakeFetch({ './data/manifest.json': 500 }) });
    const sum = (xs: typeof a.records) => xs.reduce((s, r) => s + r.cost_usd, 0);
    expect(sum(a.records)).toBeCloseTo(sum(b.records), 2);
    expect(a.records.length).toBe(b.records.length);
  });
});
