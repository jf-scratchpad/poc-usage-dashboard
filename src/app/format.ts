import type { Source } from '../schema/usage';
import { isoWeekEnd, parseDate } from '../aggregate';
import { sourceColors, sourceLabels } from '../adapters/registry';

// Labels and colors come from the adapter registry so a new source shows up
// in every chart and filter without editing the UI.
export const SOURCE_LABELS: Record<Source, string> = sourceLabels();

export const SOURCE_COLORS: Record<Source, string> = sourceColors();

export const TOTAL_COLOR = '#e6c36a';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const USD_AXIS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const UNITS = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

const PCT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  signDisplay: 'exceptZero',
  maximumFractionDigits: 1,
});

export function formatUsd(value: number): string {
  return USD.format(value);
}

export function formatUsdAxis(value: number): string {
  if (Math.abs(value) >= 1000) {
    const k = value / 1000;
    const digits = Math.abs(k) >= 10 ? 0 : 1;
    return `$${k.toFixed(digits)}k`;
  }
  return USD_AXIS.format(value);
}

export function formatUnits(value: number): string {
  return UNITS.format(value);
}

export function formatPct(value: number): string {
  return PCT.format(value / 100);
}

export function formatWeekRange(weekStart: string): string {
  const start = parseDate(weekStart);
  const end = parseDate(isoWeekEnd(weekStart));
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  });
  const endFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${startFmt.format(start)}–${endFmt.format(end)}`;
}

export function formatUnitTypes(types: readonly string[]): string {
  if (types.length === 0) return '';
  if (types.length === 1) return types[0] ?? '';
  return 'mixed units';
}
