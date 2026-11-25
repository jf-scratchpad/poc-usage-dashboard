/**
 * Color-blind-safe chart palette (Okabe & Ito, 2008). Colors are assigned by
 * position in SOURCES, so a newly registered source gets the next color with
 * no UI change. Each series also gets its own dash pattern and point shape so
 * nothing relies on color alone.
 */
import { SOURCES, type Source } from '../schema/usage';
import type { Theme } from './theme';

const OKABE_ITO = ['#E69F00', '#56B4E9', '#009E73', '#CC79A7', '#D55E00', '#0072B2', '#F0E442'] as const;
const POINT_STYLES = ['circle', 'rect', 'triangle', 'rectRot', 'star', 'crossRot', 'cross'] as const;
const DASHES: number[][] = [[], [6, 3], [2, 2], [10, 3, 2, 3], [4, 4], [1, 3], [8, 2]];

export type PointStyle = (typeof POINT_STYLES)[number];

function idx(source: Source): number {
  const i = SOURCES.indexOf(source);
  return i < 0 ? 0 : i;
}

export function seriesColor(i: number): string {
  return OKABE_ITO[i % OKABE_ITO.length] ?? '#E69F00';
}

export function sourceColor(source: Source): string {
  return seriesColor(idx(source));
}

export function sourcePointStyle(source: Source): PointStyle {
  return POINT_STYLES[idx(source) % POINT_STYLES.length] ?? 'circle';
}

export function sourceDash(source: Source): number[] {
  return DASHES[idx(source) % DASHES.length] ?? [];
}

/** Total line: high-contrast neutral in either theme. */
export function totalColor(theme: Theme): string {
  return theme === 'light' ? '#1c2430' : '#f2f5f8';
}

export function chartText(theme: Theme): string {
  return theme === 'light' ? '#1c2430' : '#c5ced9';
}

export function chartGrid(theme: Theme): string {
  return theme === 'light' ? 'rgba(28, 36, 48, 0.12)' : 'rgba(255, 255, 255, 0.08)';
}

/** Adds alpha to a #RRGGBB color for fills. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || !m[1]) return hex;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
