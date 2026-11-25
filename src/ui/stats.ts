/** Small numeric helpers for the UI (trend lines). Forecasting lives in track A's engine. */

/** Ordinary least-squares fit over index 0..n-1. Returns fitted values and the per-step slope. */
export function linearTrend(values: readonly number[]): { fitted: number[]; slope: number } {
  const n = values.length;
  if (n === 0) return { fitted: [], slope: 0 };
  if (n === 1) return { fitted: [values[0] ?? 0], slope: 0 };
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  values.forEach((y, x) => {
    sx += x;
    sy += y;
    sxy += x * y;
    sxx += x * x;
  });
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { fitted: values.map((_, x) => intercept + slope * x), slope };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
