/**
 * Body of `npm run collect`, loaded through Vite's SSR module loader by
 * scripts/collect.mjs so the adapters' `?raw` / JSON imports resolve exactly
 * as they do in the site build. Returns file contents; the caller writes them.
 */
import { getAdapters } from '../src/adapters/registry';
import { collectFromAdapters } from '../src/data/pipeline';
import { buildDataset, buildManifest, serializeDataset, serializeManifest, DATA_FILE, MANIFEST_FILE } from '../src/data/manifest';

export async function run(): Promise<{ files: Record<string, string>; summary: string }> {
  const result = await collectFromAdapters(getAdapters());
  const manifest = buildManifest(result.records, { duplicatesRemoved: result.duplicatesRemoved });
  const files = {
    [DATA_FILE]: serializeDataset(buildDataset(result.records)),
    [MANIFEST_FILE]: serializeManifest(manifest),
  };
  const per = manifest.sources.map((s) => `${s.id}=${s.record_count}`).join(' ');
  const summary = `${manifest.record_count} records (${per}), ${manifest.period_start}..${manifest.period_end}, $${manifest.total_cost_usd.toFixed(2)}, ${manifest.duplicates_removed} duplicates removed`;
  const warnings = manifest.quality.warnings.map((w) => `\n  warning: ${w}`).join('');
  return { files, summary: summary + warnings };
}
