/**
 * Data-quality report (pure): per-source day coverage over the dataset's date
 * range, so a missing export day shows up instead of looking like zero spend.
 */
import { formatDate, parseDate } from '../aggregate';
import { SOURCES, type Source, type UsageRecord } from '../schema/usage';

export type DateGap = { from: string; to: string; days: number };

export type SourceQuality = {
  id: Source;
  days_expected: number;
  days_with_data: number;
  coverage_pct: number;
  /** Consecutive runs of days with no record for this source. */
  gaps: DateGap[];
  zero_cost_records: number;
};

export type QualityReport = {
  period_start: string | null;
  period_end: string | null;
  sources: SourceQuality[];
  /** Human-readable warnings (empty = clean). */
  warnings: string[];
};

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = parseDate(from); formatDate(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(formatDate(d));
  return out;
}

export function findGaps(days: readonly string[], present: ReadonlySet<string>): DateGap[] {
  const gaps: DateGap[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  let n = 0;
  for (const d of days) {
    if (!present.has(d)) {
      if (start === null) start = d;
      prev = d;
      n += 1;
    } else if (start !== null && prev !== null) {
      gaps.push({ from: start, to: prev, days: n });
      start = null;
      n = 0;
    }
  }
  if (start !== null && prev !== null) gaps.push({ from: start, to: prev, days: n });
  return gaps;
}

export function qualityReport(records: readonly UsageRecord[], options?: { from?: string; to?: string }): QualityReport {
  const dates = records.map((r) => r.date).sort();
  const from = options?.from ?? dates[0] ?? null;
  const to = options?.to ?? dates.at(-1) ?? null;
  if (from === null || to === null) return { period_start: null, period_end: null, sources: [], warnings: ['no records'] };
  const days = eachDay(from, to);
  const warnings: string[] = [];
  const sources = SOURCES.map((id): SourceQuality => {
    const rs = records.filter((r) => r.source === id);
    const present = new Set(rs.map((r) => r.date));
    const gaps = findGaps(days, present);
    const withData = days.filter((d) => present.has(d)).length;
    const q: SourceQuality = {
      id,
      days_expected: days.length,
      days_with_data: withData,
      coverage_pct: days.length === 0 ? 0 : Math.round((withData / days.length) * 10_000) / 100,
      gaps,
      zero_cost_records: rs.filter((r) => r.cost_usd === 0).length,
    };
    if (rs.length === 0) warnings.push(`${id}: no records in ${from}..${to}`);
    else for (const g of gaps) warnings.push(`${id}: no data ${g.from}..${g.to} (${g.days} day${g.days === 1 ? '' : 's'})`);
    return q;
  });
  return { period_start: from, period_end: to, sources, warnings };
}
