/**
 * Global filters (date range, sources, assistant search) and their URL form.
 * Pure functions only, so they are easy to test and reuse in every view.
 */
import { formatDate, isoWeekStart, parseDate } from '../aggregate';
import { SOURCES, isSource, isValidDate, type Source, type UsageRecord } from '../schema/usage';

export const RANGE_PRESETS = ['4w', '12w', 'all', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Readonly<Record<RangePreset, string>> = {
  '4w': 'Last 4 weeks',
  '12w': 'Last 12 weeks',
  all: 'All time',
  custom: 'Custom',
};

export type Filters = {
  range: RangePreset;
  /** Only used when range is "custom". YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  /** Selected sources. Empty means none selected (renders the empty state). */
  sources: Source[];
  /** Case-insensitive substring match on assistant_or_project. */
  q: string;
};

export function defaultFilters(): Filters {
  return { range: 'all', sources: [...SOURCES], q: '' };
}

function isPreset(value: string | null): value is RangePreset {
  return value !== null && (RANGE_PRESETS as readonly string[]).includes(value);
}

/** Reads filters from URL search params. Unknown or malformed values fall back to defaults. */
export function parseFilters(params: URLSearchParams): Filters {
  const f = defaultFilters();
  const range = params.get('range');
  if (isPreset(range)) f.range = range;

  if (f.range === 'custom') {
    const from = params.get('from');
    const to = params.get('to');
    if (isValidDate(from)) f.from = from;
    if (isValidDate(to)) f.to = to;
    if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from];
  }

  if (params.has('src')) {
    const raw = params.get('src') ?? '';
    const wanted = new Set(raw.split(',').map((s) => s.trim()).filter(isSource));
    // Keep canonical SOURCES order so URLs and charts are stable.
    f.sources = SOURCES.filter((s) => wanted.has(s));
  }

  f.q = (params.get('q') ?? '').trim().slice(0, 100);
  return f;
}

/** Writes filters to URL search params, omitting defaults so shared URLs stay short. */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.range !== 'all') p.set('range', f.range);
  if (f.range === 'custom') {
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
  }
  const all = f.sources.length === SOURCES.length && SOURCES.every((s) => f.sources.includes(s));
  if (!all) p.set('src', SOURCES.filter((s) => f.sources.includes(s)).join(','));
  if (f.q) p.set('q', f.q);
  return p;
}

export function filtersEqual(a: Filters, b: Filters): boolean {
  return filtersToParams(a).toString() === filtersToParams(b).toString();
}

function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

export type DateWindow = { from: string; to: string };

/**
 * Inclusive date window for the filters. "4w"/"12w" are whole ISO weeks ending
 * with the week that contains `asOf` (the latest data day), so the current
 * partial week is included and the chart axis lines up with week buckets.
 */
export function dateWindow(f: Filters, asOf: string, earliest?: string): DateWindow {
  const start = earliest && earliest < asOf ? earliest : asOf;
  switch (f.range) {
    case '4w':
      return { from: addDays(isoWeekStart(asOf), -21), to: asOf };
    case '12w':
      return { from: addDays(isoWeekStart(asOf), -77), to: asOf };
    case 'custom':
      return { from: f.from ?? start, to: f.to ?? asOf };
    case 'all':
    default:
      return { from: start, to: asOf };
  }
}

export function matchesQuery(name: string, q: string): boolean {
  return q === '' || name.toLowerCase().includes(q.toLowerCase());
}

export type ApplyOptions = {
  /** Skip the assistant search (drill-down views pin one assistant instead). */
  ignoreQuery?: boolean;
  /** Skip the source filter (source detail pins one source instead). */
  ignoreSources?: boolean;
};

/** Applies every global filter. Views call this so they all respect the same state. */
export function applyFilters(
  records: readonly UsageRecord[],
  f: Filters,
  window: DateWindow,
  options: ApplyOptions = {},
): UsageRecord[] {
  const allow = new Set<Source>(f.sources);
  return records.filter(
    (r) =>
      r.date >= window.from &&
      r.date <= window.to &&
      (options.ignoreSources || allow.has(r.source)) &&
      (options.ignoreQuery || matchesQuery(r.assistant_or_project, f.q)),
  );
}

/** Earliest and latest record dates, or undefined for an empty list. */
export function dateExtent(records: readonly { date: string }[]): { min: string; max: string } | undefined {
  let min: string | undefined;
  let max: string | undefined;
  for (const r of records) {
    if (min === undefined || r.date < min) min = r.date;
    if (max === undefined || r.date > max) max = r.date;
  }
  return min !== undefined && max !== undefined ? { min, max } : undefined;
}

/** Short human description, used in export metadata and the live region. */
export function describeFilters(f: Filters, window: DateWindow): string {
  const parts = [`${window.from} to ${window.to}`];
  if (f.sources.length !== SOURCES.length) parts.push(`sources: ${f.sources.join(', ') || 'none'}`);
  if (f.q) parts.push(`assistant contains "${f.q}"`);
  return parts.join('; ');
}
