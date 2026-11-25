/**
 * Data access for the UI. Delegates to track A's `loadUsageData`
 * (src/data/load.ts): it fetches `./data/manifest.json` and the dataset
 * RELATIVE to the page (same origin, static files only) and falls back to the
 * bundled sample adapters through a dynamic import, so raw sample data stays
 * out of the initial bundle.
 */
import type { UsageRecord } from '../schema/usage';
import { loadUsageData } from '../data/load';
import type { Manifest } from '../data/manifest';
import { dataAsOf, todayInTimeZone } from '../app/dates';
import { dateExtent } from './filters';

export type LoadedData = {
  records: UsageRecord[];
  manifest: Manifest | null;
  origin: 'json' | 'bundled';
};

export type Dataset = LoadedData & {
  /** Latest data day (or today if data is current). Anchors week math. */
  asOf: string;
  /** Earliest record date, or asOf when empty. */
  earliest: string;
  /** Last data day as reported by the manifest, else asOf. */
  dataThrough: string;
};

export type Loader = () => Promise<LoadedData>;

/** Loads data and derives the anchors every view needs. */
export async function loadDataset(loader: Loader = () => loadUsageData(), today = todayInTimeZone()): Promise<Dataset> {
  const data = await loader();
  const asOf = dataAsOf(data.records, today);
  const extent = dateExtent(data.records);
  return { ...data, asOf, earliest: extent?.min ?? asOf, dataThrough: data.manifest?.data_through ?? asOf };
}
