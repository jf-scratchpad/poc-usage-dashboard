/**
 * Versioned dataset + manifest formats written by `npm run collect` to
 * public/data/ and read by the site (src/data/load.ts).
 */
import { SOURCES, validateRecords, type Source, type UsageRecord } from '../schema/usage';
import { sourceLabel } from '../adapters/sources';
import { qualityReport } from './quality';

export const SCHEMA = 'usage.v1';
export const SCHEMA_VERSION = 1;
export const DATA_FILE = 'usage.v1.json';
export const MANIFEST_FILE = 'manifest.json';

export type UsageDataset = {
  schema: typeof SCHEMA;
  schema_version: typeof SCHEMA_VERSION;
  records: UsageRecord[];
};

export type ManifestSource = {
  id: Source;
  label: string;
  record_count: number;
  cost_usd: number;
  units: number;
  unit_type: string;
  first_date: string | null;
  last_date: string | null;
};

export type Manifest = {
  schema: typeof SCHEMA;
  schema_version: typeof SCHEMA_VERSION;
  /** Deterministic: midnight UTC of the last data day, so rebuilds are byte-identical. */
  generated_at: string;
  data_file: string;
  data_through: string | null;
  period_start: string | null;
  period_end: string | null;
  record_count: number;
  total_cost_usd: number;
  duplicates_removed: number;
  sources: ManifestSource[];
  /** Day coverage per source over the period; gaps are days with no record (not zero spend). */
  quality: {
    coverage_pct: Record<string, number>;
    gap_days: Record<string, number>;
    warnings: string[];
  };
};

/** Rounds to 4 decimal places (sub-cent), avoiding float noise in the JSON. */
export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function buildDataset(records: readonly UsageRecord[]): UsageDataset {
  return { schema: SCHEMA, schema_version: SCHEMA_VERSION, records: [...records] };
}

export function buildManifest(records: readonly UsageRecord[], options?: { duplicatesRemoved?: number }): Manifest {
  const dates = records.map((r) => r.date).sort();
  const first = dates[0] ?? null;
  const last = dates.at(-1) ?? null;
  const sources: ManifestSource[] = SOURCES.map((id) => {
    const rs = records.filter((r) => r.source === id);
    const ds = rs.map((r) => r.date).sort();
    const unitTypes = [...new Set(rs.map((r) => r.unit_type))].sort();
    return {
      id,
      label: sourceLabel(id),
      record_count: rs.length,
      cost_usd: round4(rs.reduce((s, r) => s + r.cost_usd, 0)),
      units: round4(rs.reduce((s, r) => s + r.units, 0)),
      unit_type: unitTypes.join('+'),
      first_date: ds[0] ?? null,
      last_date: ds.at(-1) ?? null,
    };
  });
  return {
    schema: SCHEMA,
    schema_version: SCHEMA_VERSION,
    generated_at: last ? `${last}T00:00:00Z` : '1970-01-01T00:00:00Z',
    data_file: DATA_FILE,
    data_through: last,
    period_start: first,
    period_end: last,
    record_count: records.length,
    total_cost_usd: round4(records.reduce((s, r) => s + r.cost_usd, 0)),
    duplicates_removed: options?.duplicatesRemoved ?? 0,
    sources,
    quality: manifestQuality(records),
  };
}

function manifestQuality(records: readonly UsageRecord[]): Manifest['quality'] {
  const q = qualityReport(records);
  return {
    coverage_pct: Object.fromEntries(q.sources.map((s) => [s.id, s.coverage_pct])),
    gap_days: Object.fromEntries(q.sources.map((s) => [s.id, s.gaps.reduce((n, g) => n + g.days, 0)])),
    warnings: q.warnings,
  };
}

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

/** Accepts the versioned envelope or a bare record array; re-validates every record. */
export function parseDataset(raw: unknown): UsageRecord[] {
  if (Array.isArray(raw)) return validateRecords(raw);
  if (typeof raw !== 'object' || raw === null) throw new DatasetError('dataset: expected an object or array');
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== SCHEMA_VERSION) {
    throw new DatasetError(`dataset: unsupported schema_version ${JSON.stringify(o.schema_version)}, expected ${SCHEMA_VERSION}`);
  }
  return validateRecords(o.records);
}

/** Light structural check; the site treats a bad manifest as missing. */
export function parseManifest(raw: unknown): Manifest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new DatasetError('manifest: expected an object');
  const m = raw as Partial<Manifest>;
  if (m.schema_version !== SCHEMA_VERSION) throw new DatasetError('manifest: unsupported schema_version');
  if (typeof m.data_file !== 'string' || !/^[\w.-]+\.json$/.test(m.data_file)) {
    throw new DatasetError('manifest: data_file must be a plain .json file name');
  }
  if (typeof m.record_count !== 'number' || !Array.isArray(m.sources)) throw new DatasetError('manifest: missing counts');
  return m as Manifest;
}

/** Serializes one record per line: stable, diff-friendly output. */
export function serializeDataset(ds: UsageDataset): string {
  const lines = ds.records.map((r) => `    ${JSON.stringify({ ...r, units: round4(r.units), cost_usd: round4(r.cost_usd) })}`);
  return `{\n  "schema": ${JSON.stringify(ds.schema)},\n  "schema_version": ${ds.schema_version},\n  "records": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export function serializeManifest(m: Manifest): string {
  return `${JSON.stringify(m, null, 2)}\n`;
}
