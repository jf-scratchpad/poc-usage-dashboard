import { describe, expect, it } from 'vitest';
import { loadDataset, loadUsageDataStandIn } from '../../src/ui/data';
import { FIXTURE_RECORDS } from '../fixtures';

type Resp = { ok: boolean; status: number; json(): Promise<unknown> };
const res = (status: number, body?: unknown): Resp => ({ ok: status < 400, status, json: async () => body });

describe('UI data loading', () => {
  it('reads the manifest and its data file through relative URLs', async () => {
    const urls: string[] = [];
    const out = await loadUsageDataStandIn(async (url) => {
      urls.push(url);
      if (url === './data/manifest.json') return res(200, { data_file: 'usage.v1.json', date_range: { to: '2026-11-25' } });
      return res(200, { schema_version: 1, records: FIXTURE_RECORDS });
    });
    expect(urls).toEqual(['./data/manifest.json', './data/usage.v1.json']);
    expect(out.origin).toBe('json');
    expect(out.records).toHaveLength(FIXTURE_RECORDS.length);
    expect(out.manifest?.date_range?.to).toBe('2026-11-25');
  });

  it('accepts a bare record array without a manifest', async () => {
    const out = await loadUsageDataStandIn(async (url) => (url.endsWith('manifest.json') ? res(404) : res(200, FIXTURE_RECORDS)));
    expect(out.origin).toBe('json');
    expect(out.manifest).toBeNull();
  });

  it('falls back to the bundled sample on 404 or invalid data, and ignores unsafe data_file names', async () => {
    const missing = await loadUsageDataStandIn(async () => res(404));
    expect(missing.origin).toBe('bundled');
    expect(missing.records.length).toBeGreaterThan(100);

    const urls: string[] = [];
    const invalid = await loadUsageDataStandIn(async (url) => {
      urls.push(url);
      return url.endsWith('manifest.json') ? res(200, { data_file: '../../etc/x.json' }) : res(200, { records: [{ bad: true }] });
    });
    expect(urls[1]).toBe('./data/usage.v1.json');
    expect(invalid.origin).toBe('bundled');
  }, 20_000);

  it('derives asOf and earliest from the records', async () => {
    const ds = await loadDataset(async () => ({ records: FIXTURE_RECORDS, manifest: null, origin: 'json' }), '2026-12-31');
    expect(ds.asOf).toBe('2026-11-25');
    expect(ds.earliest).toBe('2026-10-06');
  });
});
