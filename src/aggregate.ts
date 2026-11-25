/**
 * Canonical aggregation helpers for the dashboard.
 * Collectors and other tracks should import these rather than reimplementing
 * week rollups, source filters, or top-consumer rankings.
 */
import { SOURCES, type Source, type UsageRecord } from './schema/usage';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function parseDate(date: string): Date {
  const m = DATE_RE.exec(date);
  if (!m) {
    throw new Error(`Invalid date: ${JSON.stringify(date)}, expected YYYY-MM-DD`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Invalid calendar day: ${date}`);
  }
  return dt;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week that contains the calendar date. */
export function isoWeekStart(date: string): string {
  const d = parseDate(date);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return formatDate(d);
}

/**
 * ISO week id, e.g. "2026-W48". The year is the ISO week-year
 * (the year of that week's Thursday).
 */
export function isoWeekKey(date: string): string {
  const monday = parseDate(isoWeekStart(date));
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = parseDate(isoWeekStart(formatDate(jan4)));
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * MS_PER_DAY)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Six days after the Monday, inclusive range Mon–Sun. */
export function isoWeekEnd(weekStart: string): string {
  const d = parseDate(isoWeekStart(weekStart));
  d.setUTCDate(d.getUTCDate() + 6);
  return formatDate(d);
}

export function filterBySources(records: readonly UsageRecord[], sources: readonly Source[]): UsageRecord[] {
  if (sources.length === 0) return [];
  const allow = new Set<Source>(sources);
  return records.filter((r) => allow.has(r.source));
}

export type WeekTotals = {
  weekStart: string;
  weekEnd: string;
  weekKey: string;
  totalCostUsd: number;
  totalUnits: number;
  bySource: Record<Source, number>;
};

function emptyBySource(): Record<Source, number> {
  return { 'grok-bot': 0, cursor: 0, azure: 0 };
}

function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Cost and units rolled up by ISO week (Monday start), sorted ascending.
 * Weeks between the earliest and latest dates are filled with zeros so trend
 * lines stay on a continuous axis. Optional `from` / `to` expand that range.
 */
export function totalsByWeek(
  records: readonly UsageRecord[],
  options?: { from?: string; to?: string },
): WeekTotals[] {
  const dates = records.map((r) => r.date);
  if (options?.from) dates.push(options.from);
  if (options?.to) dates.push(options.to);
  if (dates.length === 0) return [];

  dates.sort(compareDates);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === undefined || last === undefined) return [];

  const start = isoWeekStart(first);
  const end = isoWeekStart(last);
  const byWeek = new Map<string, WeekTotals>();

  for (let cursor = parseDate(start); cursor.getTime() <= parseDate(end).getTime(); cursor.setUTCDate(cursor.getUTCDate() + 7)) {
    const weekStart = formatDate(cursor);
    byWeek.set(weekStart, {
      weekStart,
      weekEnd: isoWeekEnd(weekStart),
      weekKey: isoWeekKey(weekStart),
      totalCostUsd: 0,
      totalUnits: 0,
      bySource: emptyBySource(),
    });
  }

  for (const r of records) {
    const weekStart = isoWeekStart(r.date);
    const row = byWeek.get(weekStart);
    if (!row) continue;
    row.totalCostUsd += r.cost_usd;
    row.totalUnits += r.units;
    row.bySource[r.source] += r.cost_usd;
  }

  return [...byWeek.values()];
}

export type ConsumerTotals = {
  source: Source;
  assistant_or_project: string;
  cost_usd: number;
  units: number;
  /** Distinct unit types seen; more than one means the units column is mixed. */
  unit_types: string[];
};

function consumerKey(source: Source, name: string): string {
  return `${source}\u0000${name}`;
}

export function totalsByAssistant(records: readonly UsageRecord[]): ConsumerTotals[] {
  const map = new Map<string, ConsumerTotals>();
  for (const r of records) {
    const key = consumerKey(r.source, r.assistant_or_project);
    const existing = map.get(key);
    if (existing) {
      existing.cost_usd += r.cost_usd;
      existing.units += r.units;
      if (!existing.unit_types.includes(r.unit_type)) {
        existing.unit_types.push(r.unit_type);
      }
    } else {
      map.set(key, {
        source: r.source,
        assistant_or_project: r.assistant_or_project,
        cost_usd: r.cost_usd,
        units: r.units,
        unit_types: [r.unit_type],
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (b.cost_usd !== a.cost_usd) return b.cost_usd - a.cost_usd;
    const name = a.assistant_or_project.localeCompare(b.assistant_or_project);
    if (name !== 0) return name;
    return a.source.localeCompare(b.source);
  });
}

export function topConsumers(records: readonly UsageRecord[], n: number): ConsumerTotals[] {
  if (n <= 0) return [];
  return totalsByAssistant(records).slice(0, n);
}

export type WeekOverWeek = {
  asOf: string;
  thisWeekStart: string;
  lastWeekStart: string;
  thisWeekCost: number;
  lastWeekCost: number;
  deltaUsd: number;
  /** Null when last week is zero, so a percentage is undefined. */
  deltaPct: number | null;
};

export function weekOverWeekTrend(records: readonly UsageRecord[], asOf: string): WeekOverWeek {
  const thisWeekStart = isoWeekStart(asOf);
  const last = parseDate(thisWeekStart);
  last.setUTCDate(last.getUTCDate() - 7);
  const lastWeekStart = formatDate(last);

  let thisWeekCost = 0;
  let lastWeekCost = 0;
  for (const r of records) {
    const start = isoWeekStart(r.date);
    if (start === thisWeekStart) thisWeekCost += r.cost_usd;
    else if (start === lastWeekStart) lastWeekCost += r.cost_usd;
  }

  const deltaUsd = thisWeekCost - lastWeekCost;
  const deltaPct = lastWeekCost === 0 ? null : (deltaUsd / lastWeekCost) * 100;
  return { asOf, thisWeekStart, lastWeekStart, thisWeekCost, lastWeekCost, deltaUsd, deltaPct };
}

export function totalSpend(records: readonly UsageRecord[]): number {
  return records.reduce((sum, r) => sum + r.cost_usd, 0);
}

export function totalUnits(records: readonly UsageRecord[]): number {
  return records.reduce((sum, r) => sum + r.units, 0);
}

export { SOURCES };
