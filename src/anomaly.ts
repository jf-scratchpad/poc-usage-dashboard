/**
 * Anomaly detection (pure): flags weeks whose spend is more than `threshold`
 * standard deviations above the rolling mean of the previous `window` weeks.
 *
 * For each series (total, per source, or per source × assistant) and week t:
 *   prior   = the up-to-`window` weeks before t (t itself excluded)
 *   mean, s = mean and sample standard deviation of prior
 *   s'      = max(s, minStdevUsd, minStdevPct% × mean)   (floor, so flat series don't flag $0.01 blips)
 *   z       = (value − mean) / s'
 * Week t is anomalous when prior has ≥ `minHistory` weeks, z > threshold, and
 * value − mean ≥ minDeltaUsd. Only spikes (above the mean) are reported.
 */
import { isoWeekStart, totalsByWeek } from './aggregate';
import { sourceLabel } from './adapters/sources';
import type { Source, UsageRecord } from './schema/usage';

export type AnomalyScope = 'total' | 'source' | 'assistant';

export type AnomalyOptions = {
  /** Rolling window length in weeks (default 4). */
  window?: number;
  /** Standard deviations above the mean that count as anomalous (default 2). */
  threshold?: number;
  /** Prior weeks required before a week can be judged (default 3). */
  minHistory?: number;
  scope?: AnomalyScope;
  /** Ignore spikes smaller than this many dollars above the mean (default 5). */
  minDeltaUsd?: number;
  /** Std-dev floor in dollars (default 1). */
  minStdevUsd?: number;
  /** Std-dev floor as a percent of the mean (default 5). */
  minStdevPct?: number;
};

export type Anomaly = {
  weekStart: string;
  scope: AnomalyScope;
  /** 'total', a source id, or `${source}:${assistant}`. */
  key: string;
  label: string;
  source?: Source;
  assistant?: string;
  value: number;
  /** Rolling mean of the prior window (the "expected" spend). */
  mean: number;
  stdev: number;
  zScore: number;
  reason: string;
};

export type WeeklySeries = { key: string; label: string; source?: Source; assistant?: string; weeks: string[]; values: number[] };

function weekRange(records: readonly UsageRecord[]): string[] {
  return totalsByWeek(records).map((w) => w.weekStart);
}

/** Builds one zero-filled weekly cost series per key for the chosen scope. */
export function weeklySeries(records: readonly UsageRecord[], scope: AnomalyScope): WeeklySeries[] {
  const weeks = weekRange(records);
  const index = new Map(weeks.map((w, i) => [w, i]));
  const series = new Map<string, WeeklySeries>();
  for (const r of records) {
    let key: string;
    let label: string;
    let extra: Partial<WeeklySeries> = {};
    if (scope === 'total') {
      key = 'total';
      label = 'All sources';
    } else if (scope === 'source') {
      key = r.source;
      label = sourceLabel(r.source);
      extra = { source: r.source };
    } else {
      key = `${r.source}:${r.assistant_or_project}`;
      label = `${r.assistant_or_project} (${sourceLabel(r.source)})`;
      extra = { source: r.source, assistant: r.assistant_or_project };
    }
    let s = series.get(key);
    if (!s) {
      s = { key, label, ...extra, weeks, values: weeks.map(() => 0) };
      series.set(key, s);
    }
    const i = index.get(isoWeekStart(r.date));
    if (i !== undefined) s.values[i] = (s.values[i] ?? 0) + r.cost_usd;
  }
  return [...series.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function meanStdev(values: readonly number[]): { mean: number; stdev: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, stdev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const stdev = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, stdev };
}

/** Anomalies in one numeric series; returns indexes with stats. */
export function detectSeriesAnomalies(
  values: readonly number[],
  options: AnomalyOptions = {},
): { index: number; value: number; mean: number; stdev: number; zScore: number }[] {
  const window = options.window ?? 4;
  const threshold = options.threshold ?? 2;
  const minHistory = options.minHistory ?? 3;
  const minDelta = options.minDeltaUsd ?? 5;
  const minStdevUsd = options.minStdevUsd ?? 1;
  const minStdevPct = options.minStdevPct ?? 5;
  if (!(window >= 2) || !Number.isInteger(window)) throw new RangeError('window must be an integer >= 2');
  if (!(threshold > 0)) throw new RangeError('threshold must be > 0');
  if (minHistory < 2 || minHistory > window) throw new RangeError('minHistory must be between 2 and window');

  const out: { index: number; value: number; mean: number; stdev: number; zScore: number }[] = [];
  values.forEach((value, t) => {
    const prior = values.slice(Math.max(0, t - window), t);
    if (prior.length < minHistory) return;
    const { mean, stdev } = meanStdev(prior);
    const floored = Math.max(stdev, minStdevUsd, (minStdevPct / 100) * Math.abs(mean));
    const zScore = (value - mean) / floored;
    if (zScore > threshold && value - mean >= minDelta) out.push({ index: t, value, mean, stdev: floored, zScore });
  });
  return out;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Spikes across every series of the chosen scope, highest z-score first. */
export function detectAnomalies(records: readonly UsageRecord[], options: AnomalyOptions = {}): Anomaly[] {
  const scope = options.scope ?? 'source';
  const out: Anomaly[] = [];
  for (const s of weeklySeries(records, scope)) {
    for (const a of detectSeriesAnomalies(s.values, options)) {
      const weekStart = s.weeks[a.index] ?? '';
      out.push({
        weekStart,
        scope,
        key: s.key,
        label: s.label,
        ...(s.source ? { source: s.source } : {}),
        ...(s.assistant ? { assistant: s.assistant } : {}),
        value: a.value,
        mean: a.mean,
        stdev: a.stdev,
        zScore: a.zScore,
        reason: `${s.label} spent ${usd(a.value)} in the week of ${weekStart}, ${a.zScore.toFixed(1)}σ above its ${options.window ?? 4}-week average of ${usd(a.mean)}`,
      });
    }
  }
  return out.sort((a, b) => b.zScore - a.zScore || a.weekStart.localeCompare(b.weekStart) || a.key.localeCompare(b.key));
}

/** Anomalies at every scope. Not de-duplicated: each scope answers a different question. */
export function detectAllAnomalies(records: readonly UsageRecord[], options: Omit<AnomalyOptions, 'scope'> = {}): Record<AnomalyScope, Anomaly[]> {
  return {
    total: detectAnomalies(records, { ...options, scope: 'total' }),
    source: detectAnomalies(records, { ...options, scope: 'source' }),
    assistant: detectAnomalies(records, { ...options, scope: 'assistant' }),
  };
}
