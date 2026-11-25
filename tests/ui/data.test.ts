import { describe, expect, it } from 'vitest';
import { loadDataset } from '../../src/ui/data';
import { buildManifest } from '../../src/data/manifest';
import { FIXTURE_RECORDS } from '../fixtures';

describe('UI dataset anchors', () => {
  it('derives asOf, earliest, and dataThrough from the records when there is no manifest', async () => {
    const ds = await loadDataset(async () => ({ records: FIXTURE_RECORDS, manifest: null, origin: 'json' }), '2026-12-31');
    expect(ds.asOf).toBe('2026-11-25');
    expect(ds.earliest).toBe('2026-10-06');
    expect(ds.dataThrough).toBe('2026-11-25');
  });

  it('anchors to today when data is current, and prefers the manifest data_through for freshness', async () => {
    const manifest = buildManifest(FIXTURE_RECORDS);
    const ds = await loadDataset(async () => ({ records: FIXTURE_RECORDS, manifest, origin: 'json' }), '2026-11-20');
    expect(ds.asOf).toBe('2026-11-20');
    expect(ds.dataThrough).toBe(manifest.data_through);
  });

  it('handles an empty dataset', async () => {
    const ds = await loadDataset(async () => ({ records: [], manifest: null, origin: 'bundled' }), '2026-11-25');
    expect(ds.earliest).toBe('2026-11-25');
  });
});
