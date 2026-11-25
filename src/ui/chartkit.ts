/**
 * Chart.js wrapper. This module is only ever reached through dynamic
 * `import('./chartkit')` (see charts.ts), so Chart.js lands in its own lazy
 * chunk instead of the initial bundle.
 */
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartDataset,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import { formatUsd, formatUsdAxis } from '../app/format';
import { chartGrid, chartText, withAlpha, type PointStyle } from './palette';
import type { Theme } from './theme';

Chart.register(
  LineController,
  BarController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Legend,
  Tooltip,
  Filler,
);

export type Series = {
  label: string;
  data: (number | null)[];
  color: string;
  dash?: number[];
  point?: PointStyle;
  /** Area fill: true = to origin (or to previous when stacked), '-1' = to previous dataset (bands). */
  fill?: boolean | '-1';
  /** Hide from legend and tooltip (used for the lower edge of a band). */
  helper?: boolean;
  /** Draw the line without point markers (trend lines). */
  noPoints?: boolean;
  width?: number;
  /** Per-bar colors (bar charts only). */
  colors?: string[];
};

export type LineSpec = {
  labels: string[];
  series: Series[];
  stacked?: boolean;
  yTitle?: string;
  money?: boolean;
};

export type BarSpec = {
  labels: string[];
  series: Series[];
  horizontal?: boolean;
  stacked?: boolean;
  money?: boolean;
  onClickLabel?: (label: string, index: number) => void;
};

function reducedMotion(): boolean {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function fmt(money: boolean) {
  return (v: number): string => (money ? formatUsd(v) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v));
}

function axisFmt(money: boolean) {
  return (value: string | number): string => {
    const n = typeof value === 'number' ? value : Number(value);
    return money ? formatUsdAxis(n) : new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n);
  };
}

function baseOptions(theme: Theme, money: boolean, horizontal = false, stacked = false): ChartOptions<'line' | 'bar'> {
  const color = chartText(theme);
  const grid = chartGrid(theme);
  const valueAxis = {
    beginAtZero: true,
    stacked,
    ticks: { color, callback: axisFmt(money) },
    grid: { color: grid },
    title: { display: money, text: 'USD', color },
  };
  const catAxis = { stacked, ticks: { color, autoSkip: true, maxRotation: 0 }, grid: { display: false } };
  const label = fmt(money);
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion() ? false : { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color,
          usePointStyle: true,
          boxWidth: 10,
          padding: 14,
          filter: (item, data) => !(data.datasets[item.datasetIndex ?? 0] as { helper?: boolean } | undefined)?.helper,
        },
      },
      tooltip: {
        filter: (item: TooltipItem<'line' | 'bar'>) => !(item.dataset as { helper?: boolean }).helper,
        callbacks: {
          label: (ctx: TooltipItem<'line' | 'bar'>) => {
            const p = ctx.parsed as { x: number | null; y: number | null };
            const v = horizontal ? p.x : p.y;
            return `${ctx.dataset.label ?? ''}: ${v === null ? '—' : label(v)}`;
          },
        },
      },
    },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
  } as ChartOptions<'line' | 'bar'>;
}

function lineDataset(s: Series, stacked: boolean): ChartDataset<'line'> {
  const fill = s.fill === '-1' ? '-1' : s.fill ? (stacked ? (s.fill === true ? 'stack' : false) : 'origin') : false;
  return {
    label: s.label,
    data: s.data,
    borderColor: s.color,
    backgroundColor: s.fill ? withAlpha(s.color, 0.28) : s.color,
    borderDash: s.dash ?? [],
    borderWidth: s.width ?? 2,
    pointStyle: s.point ?? 'circle',
    pointRadius: s.helper || s.noPoints ? 0 : 3,
    pointHoverRadius: s.helper || s.noPoints ? 0 : 5,
    fill,
    tension: 0.2,
    spanGaps: false,
    stack: stacked ? 'stack' : undefined,
    helper: s.helper,
  } as ChartDataset<'line'>;
}

export type ChartLike = { destroy(): void };

export function lineChart(canvas: HTMLCanvasElement, spec: LineSpec, theme: Theme): ChartLike {
  const stacked = Boolean(spec.stacked);
  return new Chart<'line'>(canvas, {
    type: 'line',
    data: { labels: spec.labels, datasets: spec.series.map((s) => lineDataset(s, stacked)) },
    options: baseOptions(theme, spec.money ?? true, false, stacked) as ChartOptions<'line'>,
  });
}

export function barChart(canvas: HTMLCanvasElement, spec: BarSpec, theme: Theme): ChartLike {
  const options = baseOptions(theme, spec.money ?? true, spec.horizontal, spec.stacked) as ChartOptions<'bar'>;
  if (spec.series.length <= 1 && options.plugins?.legend) options.plugins.legend.display = false;
  if (spec.onClickLabel) {
    const cb = spec.onClickLabel;
    options.onClick = (_evt, elements) => {
      const first = elements[0];
      if (first) cb(spec.labels[first.index] ?? '', first.index);
    };
  }
  return new Chart<'bar'>(canvas, {
    type: 'bar',
    data: {
      labels: spec.labels,
      datasets: spec.series.map((s) => ({
        label: s.label,
        data: s.data,
        backgroundColor: s.colors ? s.colors.map((c) => withAlpha(c, 0.85)) : withAlpha(s.color, 0.85),
        borderColor: s.colors ?? s.color,
        borderWidth: 1,
        borderRadius: 4,
        stack: spec.stacked ? 'stack' : undefined,
      })),
    },
    options,
  });
}
