/**
 * Data access for the UI.
 *
 * Track A owns `src/data/load.ts` (`loadUsageData`). Until that module lands
 * on main, `loadUsageDataStandIn` below implements the same contract:
 * fetch `./data/manifest.json` and its data file RELATIVE to the page (same
 * origin, static files only), and fall back to the bundled sample adapters on
 * any error. The adapters are reached via dynamic import so the ~430 kB of raw
 * sample data stays out of the initial bundle.
 */
import { validateRecords, type UsageRecord } from '../schema/usage';
import { dataAsOf, todayInTimeZone } from '../app/dates';
import { dateExtent } from './filters';

/** The subset of track A's manifest the UI reads. Every field is optional. */
export type ManifestLike = {
  generated_at?: string;
  data_file?: string;
  record_count?: number;
  date_range?: { from?: string; to?: string };
  total_cost_usd?: number;
};

export type LoadedData = {
  records: UsageRecord[];
  manifest: ManifestLike | null;
  origin: 'json' | 'bundled';
};

export type Dataset = LoadedData & {
  /** Latest data day (or today if data is current). Anchors week math. */
  asOf: string;
  /** Earliest record date, or asOf when empty. */
  earliest: string;
};

type FetchLike = (input: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

function extractRecords(body: unknown): unknown {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && 'records' in body) return (body as { records: unknown }).records;
  throw new Error('usage data file has no records array');
}

async function bundled(): Promise<LoadedData> {
  const { loadAllUsage } = await import('../adapters/index');
  return { records: await loadAllUsage(), manifest: null, origin: 'bundled' };
}

/** Same contract as track A's `loadUsageData`. */
export async function loadUsageDataStandIn(fetchImpl?: FetchLike): Promise<LoadedData> {
  const f: FetchLike | undefined =
    fetchImpl ?? (typeof fetch === 'function' ? (url: string) => fetch(url) : undefined);
  if (!f) return bundled();
  try {
    const mRes = await f('./data/manifest.json');
    const manifest = mRes.ok ? ((await mRes.json()) as ManifestLike) : null;
    const file = manifest?.data_file && /^[\w.-]+\.json$/.test(manifest.data_file) ? manifest.data_file : 'usage.v1.json';
    const dRes = await f(`./data/${file}`);
    if (!dRes.ok) throw new Error(`data file HTTP ${dRes.status}`);
    const records = validateRecords(extractRecords(await dRes.json()));
    return { records, manifest, origin: 'json' };
  } catch {
    return bundled();
  }
}

export type Loader = () => Promise<LoadedData>;

/** Loads data and derives the anchors every view needs. */
export async function loadDataset(loader: Loader = () => loadUsageDataStandIn(), today = todayInTimeZone()): Promise<Dataset> {
  const data = await loader();
  const asOf = dataAsOf(data.records, today);
  const extent = dateExtent(data.records);
  return { ...data, asOf, earliest: extent?.min ?? asOf };
}
