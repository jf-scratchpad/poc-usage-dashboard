/**
 * Build-time normalization pipeline (pure). `npm run collect` feeds it every
 * registered adapter's output; tests feed it hand-made batches.
 *
 * Steps: validate every record (collecting ALL errors with row context, not
 * just the first), drop exact duplicates, reject conflicting duplicates, sort.
 */
import { UsageValidationError, validateRecord, type Source, type UsageAdapter, type UsageRecord } from '../schema/usage';

export type CollectBatch = { source: Source | string; records: unknown };

export type CollectIssue = {
  source: string;
  /** Index in that source's batch, or null for batch-level problems. */
  index: number | null;
  message: string;
  /** The offending row, JSON-encoded and truncated, for context. */
  row?: string;
};

export type CollectResult = {
  records: UsageRecord[];
  duplicatesRemoved: number;
  errors: CollectIssue[];
};

/** Natural key: one row per day × source × assistant/project × unit type. */
export function recordKey(r: UsageRecord): string {
  return [r.date, r.source, r.assistant_or_project, r.unit_type].join('\u0000');
}

export function compareRecords(a: UsageRecord, b: UsageRecord): number {
  return (
    a.date.localeCompare(b.date) ||
    a.source.localeCompare(b.source) ||
    a.assistant_or_project.localeCompare(b.assistant_or_project) ||
    a.unit_type.localeCompare(b.unit_type)
  );
}

function snippet(row: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(row) ?? String(row);
  } catch {
    s = String(row);
  }
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}

/** Costs within half a micro-dollar count as equal (float noise from rollups). */
const COST_EPSILON = 5e-7;

function sameValues(a: UsageRecord, b: UsageRecord): boolean {
  return Math.abs(a.units - b.units) < COST_EPSILON && Math.abs(a.cost_usd - b.cost_usd) < COST_EPSILON;
}

export function normalizeBatches(batches: readonly CollectBatch[]): CollectResult {
  const errors: CollectIssue[] = [];
  const byKey = new Map<string, { record: UsageRecord; source: string; index: number }>();
  let duplicatesRemoved = 0;

  for (const batch of batches) {
    if (!Array.isArray(batch.records)) {
      errors.push({ source: String(batch.source), index: null, message: 'adapter did not return an array' });
      continue;
    }
    batch.records.forEach((raw, index) => {
      let record: UsageRecord;
      try {
        record = validateRecord(raw, index);
      } catch (err) {
        errors.push({
          source: String(batch.source),
          index,
          message: err instanceof Error ? err.message : String(err),
          row: snippet(raw),
        });
        return;
      }
      if (record.source !== batch.source) {
        errors.push({
          source: String(batch.source),
          index,
          message: `record[${index}]: source ${record.source} does not match adapter ${String(batch.source)}`,
          row: snippet(raw),
        });
        return;
      }
      const key = recordKey(record);
      const seen = byKey.get(key);
      if (!seen) {
        byKey.set(key, { record, source: String(batch.source), index });
      } else if (sameValues(seen.record, record)) {
        duplicatesRemoved += 1;
      } else {
        errors.push({
          source: String(batch.source),
          index,
          message:
            `record[${index}]: conflicting duplicate of ${seen.source} record[${seen.index}] ` +
            `(${record.date} ${record.assistant_or_project}: cost ${seen.record.cost_usd} vs ${record.cost_usd})`,
          row: snippet(raw),
        });
      }
    });
  }

  const records = [...byKey.values()].map((v) => v.record).sort(compareRecords);
  return { records, duplicatesRemoved, errors };
}

/** Human-readable multi-line report of every issue. */
export function formatIssues(errors: readonly CollectIssue[]): string {
  return errors
    .map((e) => `- [${e.source}${e.index === null ? '' : ` #${e.index}`}] ${e.message}${e.row ? `\n    row: ${e.row}` : ''}`)
    .join('\n');
}

export class CollectError extends UsageValidationError {
  readonly issues: CollectIssue[];
  constructor(issues: CollectIssue[]) {
    super(`collect failed with ${issues.length} issue(s):\n${formatIssues(issues)}`);
    this.name = 'CollectError';
    this.issues = issues;
  }
}

/** Runs adapters, normalizes, and throws CollectError listing every problem. */
export async function collectFromAdapters(adapters: readonly UsageAdapter[]): Promise<CollectResult> {
  const batches: CollectBatch[] = [];
  const loadErrors: CollectIssue[] = [];
  for (const adapter of adapters) {
    try {
      batches.push({ source: adapter.source, records: await adapter.load() });
    } catch (err) {
      loadErrors.push({ source: adapter.source, index: null, message: err instanceof Error ? err.message : String(err) });
    }
  }
  const result = normalizeBatches(batches);
  const errors = [...loadErrors, ...result.errors];
  if (errors.length > 0) throw new CollectError(errors);
  return { ...result, errors };
}
