/**
 * Spend forecasting (pure, explainable). Two models over weekly totals:
 *
 * linear — ordinary least squares y = a + b·x over week index x = 0..n-1.
 *   Forecast for week n+h-1 is a + b·x. Band = ± z · s · √(1 + 1/n + (x − x̄)² / Sxx),
 *   the textbook prediction interval, where s = √(SSE / (n − 2)).
 *
 * ewma — simple exponential smoothing: L₀ = y₀, Lₜ = α·yₜ + (1 − α)·Lₜ₋₁.
 *   Forecast is flat at the last level. Band = ± z · s · √(1 + (h − 1)·α²), where
 *   s is the RMS of one-step-ahead errors (yₜ − Lₜ₋₁).
 *
 * Values and lower bands are clamped at 0 (spend cannot be negative).
 */
import { formatDate, parseDate, totalsByWeek } from './aggregate';
import { SOURCES, type Source, type UsageRecord } from './schema/usage';

export type ForecastMethod = 'linear' | 'ewma';

export type ForecastOptions = {
  method?: ForecastMethod;
  /** Weeks to forecast (default 4). */
  horizon?: number;
  /** EWMA smoothing factor in (0, 1] (default 0.5). */
  alpha?: number;
  /** Band width in standard errors (default 1.96 ≈ 95%). */
  z?: number;
};

export type SeriesForecast = {
  method: ForecastMethod;
  /** In-sample fit (linear: fitted line; ewma: one-step-ahead predictions). */
  fitted: number[];
  forecast: { value: number; low: number; high: number }[];
  /** Linear only: change per week. */
  slope?: number;
  intercept?: number;
  /** Standard error used for the band. */
  residualStdev: number;
};

export type ForecastPoint = { weekStart: string; value: number; low: number; high: number };

export type WeeklyForecast = {
  method: ForecastMethod;
  source: Source | 'all';
  history: { weekStart: string; value: number }[];
  forecast: ForecastPoint[];
  slope?: number;
  residualStdev: number;
};

export class ForecastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForecastError';
  }
}

function clampBand(value: number, half: number): { value: number; low: number; high: number } {
  const v = Math.max(0, value);
  return { value: v, low: Math.max(0, value - half), high: Math.max(0, value + half) };
}

export function linearRegression(values: readonly number[]): { slope: number; intercept: number; fitted: number[]; stdev: number; xMean: number; sxx: number } {
  const n = values.length;
  if (n === 0) throw new ForecastError('linear regression needs at least one point');
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  values.forEach((y, x) => {
    sxx += (x - xMean) ** 2;
    sxy += (x - xMean) * (y - yMean);
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yMean - slope * xMean;
  const fitted = values.map((_, x) => intercept + slope * x);
  const sse = values.reduce((s, y, x) => s + (y - (fitted[x] ?? 0)) ** 2, 0);
  const stdev = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, fitted, stdev, xMean, sxx };
}

export function ewma(values: readonly number[], alpha: number): { levels: number[]; oneStep: number[]; stdev: number } {
  if (!(alpha > 0 && alpha <= 1)) throw new ForecastError(`alpha must be in (0, 1], got ${alpha}`);
  if (values.length === 0) throw new ForecastError('ewma needs at least one point');
  const levels: number[] = [];
  const oneStep: number[] = [];
  let level = values[0] ?? 0;
  let sq = 0;
  values.forEach((y, t) => {
    oneStep.push(t === 0 ? y : level);
    if (t > 0) sq += (y - level) ** 2;
    level = t === 0 ? y : alpha * y + (1 - alpha) * level;
    levels.push(level);
  });
  const stdev = values.length > 1 ? Math.sqrt(sq / (values.length - 1)) : 0;
  return { levels, oneStep, stdev };
}

export function forecastSeries(values: readonly number[], options: ForecastOptions = {}): SeriesForecast {
  const method = options.method ?? 'linear';
  const horizon = options.horizon ?? 4;
  const z = options.z ?? 1.96;
  if (!Number.isInteger(horizon) || horizon < 1) throw new ForecastError('horizon must be a positive integer');
  if (values.some((v) => !Number.isFinite(v))) throw new ForecastError('values must be finite numbers');
  const n = values.length;

  if (method === 'linear') {
    const lr = linearRegression(values);
    const forecast = Array.from({ length: horizon }, (_, h) => {
      const x = n + h;
      const se = lr.stdev * Math.sqrt(1 + 1 / n + (lr.sxx === 0 ? 0 : (x - lr.xMean) ** 2 / lr.sxx));
      return clampBand(lr.intercept + lr.slope * x, z * se);
    });
    return { method, fitted: lr.fitted, forecast, slope: lr.slope, intercept: lr.intercept, residualStdev: lr.stdev };
  }

  const alpha = options.alpha ?? 0.5;
  const e = ewma(values, alpha);
  const last = e.levels.at(-1) ?? 0;
  const forecast = Array.from({ length: horizon }, (_, h) => clampBand(last, z * e.stdev * Math.sqrt(1 + h * alpha ** 2)));
  return { method, fitted: e.oneStep, forecast, residualStdev: e.stdev };
}

function addWeeks(weekStart: string, k: number): string {
  const d = parseDate(weekStart);
  d.setUTCDate(d.getUTCDate() + 7 * k);
  return formatDate(d);
}

/**
 * Weekly spend history (optionally one source) and the next `horizon` weeks.
 * A trailing partial week (data ends before Sunday) is dropped from the fit so
 * it doesn't drag the trend down.
 */
export function forecastWeekly(
  records: readonly UsageRecord[],
  options: ForecastOptions & { source?: Source; keepPartialWeek?: boolean } = {},
): WeeklyForecast {
  const rs = options.source ? records.filter((r) => r.source === options.source) : records;
  let weeks = totalsByWeek(rs);
  if (!options.keepPartialWeek && weeks.length > 0) {
    const lastDate = rs.reduce((m, r) => (r.date > m ? r.date : m), '');
    const lastWeek = weeks.at(-1);
    if (lastWeek && lastDate < lastWeek.weekEnd) weeks = weeks.slice(0, -1);
  }
  const history = weeks.map((w) => ({ weekStart: w.weekStart, value: w.totalCostUsd }));
  const method = options.method ?? 'linear';
  if (history.length === 0) return { method, source: options.source ?? 'all', history, forecast: [], residualStdev: 0 };
  const sf = forecastSeries(
    history.map((h) => h.value),
    options,
  );
  const lastStart = history.at(-1)?.weekStart ?? '';
  return {
    method,
    source: options.source ?? 'all',
    history,
    forecast: sf.forecast.map((f, i) => ({ weekStart: addWeeks(lastStart, i + 1), ...f })),
    slope: sf.slope,
    residualStdev: sf.residualStdev,
  };
}

export function forecastBySource(records: readonly UsageRecord[], options: ForecastOptions = {}): Record<Source, WeeklyForecast> {
  return Object.fromEntries(SOURCES.map((s) => [s, forecastWeekly(records, { ...options, source: s })])) as Record<Source, WeeklyForecast>;
}
