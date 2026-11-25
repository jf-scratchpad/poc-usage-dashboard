/**
 * Common schema shared by every collector adapter and the web app.
 *
 * One UsageRecord = one day of usage for one assistant (or project) from one source.
 * Costs are always normalised to US dollars.
 */

/**
 * Every known source id. Adding a source: append it here, then follow
 * "Adding a source" in docs/adapters.md (the registry's metadata table is
 * typed `Record<Source, …>`, so typecheck fails until it is described).
 */
export const SOURCES = ['grok-bot', 'cursor', 'azure', 'llm-api'] as const;
export type Source = (typeof SOURCES)[number];

export type UsageRecord = {
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  source: Source;
  /** Assistant, bot, model, or Azure project/resource group the usage belongs to. */
  assistant_or_project: string;
  /** Quantity consumed, in `unit_type` units. Must be >= 0. */
  units: number;
  /** What `units` counts, e.g. "tokens", "requests", "messages", "USD". */
  unit_type: string;
  /** Cost in US dollars. Must be >= 0. */
  cost_usd: number;
};

/**
 * Every source implements this. `load()` is async so a future real collector
 * (API export, CSV download) can plug in without changing callers.
 */
export interface UsageAdapter {
  readonly source: Source;
  load(): Promise<UsageRecord[]>;
}

export class UsageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageValidationError';
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isSource(value: unknown): value is Source {
  return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

function describe(r: unknown, index?: number): string {
  return index === undefined ? 'record' : `record[${index}]`;
}

function checkNumber(field: string, value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UsageValidationError(`${where}: ${field} must be a finite number, got ${JSON.stringify(value)}`);
  }
  if (value < 0) {
    throw new UsageValidationError(`${where}: ${field} must not be negative, got ${value}`);
  }
  return value;
}

/** Validates one record and returns a clean copy. Throws UsageValidationError with a clear message. */
export function validateRecord(r: unknown, index?: number): UsageRecord {
  const where = describe(r, index);
  if (typeof r !== 'object' || r === null || Array.isArray(r)) {
    throw new UsageValidationError(`${where}: expected an object`);
  }
  const o = r as Record<string, unknown>;

  if (!isValidDate(o.date)) {
    throw new UsageValidationError(`${where}: bad date ${JSON.stringify(o.date)}, expected a real YYYY-MM-DD day`);
  }
  if (!isSource(o.source)) {
    throw new UsageValidationError(
      `${where}: unknown source ${JSON.stringify(o.source)}, expected one of ${SOURCES.join(', ')}`,
    );
  }
  if (typeof o.assistant_or_project !== 'string' || o.assistant_or_project.trim() === '') {
    throw new UsageValidationError(`${where}: assistant_or_project must be a non-empty string`);
  }
  const units = checkNumber('units', o.units, where);
  if (typeof o.unit_type !== 'string' || o.unit_type.trim() === '') {
    throw new UsageValidationError(`${where}: unit_type must be a non-empty string`);
  }
  const cost_usd = checkNumber('cost_usd', o.cost_usd, where);

  return {
    date: o.date,
    source: o.source,
    assistant_or_project: o.assistant_or_project.trim(),
    units,
    unit_type: o.unit_type.trim(),
    cost_usd,
  };
}

/** Validates an array of records. The error message names the first bad index. */
export function validateRecords(rs: unknown): UsageRecord[] {
  if (!Array.isArray(rs)) {
    throw new UsageValidationError('expected an array of usage records');
  }
  return rs.map((r, i) => validateRecord(r, i));
}
