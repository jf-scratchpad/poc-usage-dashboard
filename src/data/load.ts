/**
 * Site-side data loader. Prefers the collected dataset in public/data/
 * (same-origin static files shipped with the site, fetched with relative URLs
 * so it works under any base path). Falls back to the bundled adapters on any
 * problem. No third-party hosts, credentials, or APIs are ever contacted.
 */
import type { UsageRecord } from '../schema/usage';
import { MANIFEST_FILE, parseDataset, parseManifest, type Manifest } from './manifest';

export type LoadedUsage = {
  records: UsageRecord[];
  manifest: Manifest | null;
  origin: 'json' | 'bundled';
  /** Why the JSON path was skipped, when origin is 'bundled'. */
  fallbackReason?: string;
};

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function loadUsageData(options?: { fetchImpl?: FetchLike; baseUrl?: string }): Promise<LoadedUsage> {
  const base = options?.baseUrl ?? './data/';
  const fetchImpl: FetchLike | undefined =
    options?.fetchImpl ?? (typeof fetch === 'function' ? (url) => fetch(url) : undefined);
  try {
    if (!fetchImpl) throw new Error('fetch is unavailable');
    const mres = await fetchImpl(`${base}${MANIFEST_FILE}`);
    if (!mres.ok) throw new Error(`manifest HTTP ${mres.status}`);
    const manifest = parseManifest(await mres.json());
    const dres = await fetchImpl(`${base}${manifest.data_file}`);
    if (!dres.ok) throw new Error(`dataset HTTP ${dres.status}`);
    const records = parseDataset(await dres.json());
    if (records.length !== manifest.record_count) {
      throw new Error(`dataset has ${records.length} records, manifest says ${manifest.record_count}`);
    }
    return { records, manifest, origin: 'json' };
  } catch (err) {
    // Dynamic import keeps the raw sample files out of the initial chunk.
    const { loadAllUsage } = await import('../adapters/index');
    return {
      records: await loadAllUsage(),
      manifest: null,
      origin: 'bundled',
      fallbackReason: err instanceof Error ? err.message : String(err),
    };
  }
}
