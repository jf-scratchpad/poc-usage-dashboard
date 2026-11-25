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
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import { topConsumers, totalsByWeek, type WeekTotals } from '../aggregate';
import type { Source, UsageRecord } from '../schema/usage';
import { SOURCE_COLORS, SOURCE_LABELS, TOTAL_COLOR, formatUsd, formatUsdAxis } from './format';

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

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function textColor(): string {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? '#1c2430' : '#c5ced9';
}

function gridColor(): string {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'rgba(28, 36, 48, 0.12)'
    : 'rgba(255, 255, 255, 0.08)';
}

function animation(): false | { duration: number } {
  return prefersReducedMotion() ? false : { duration: 250 };
}

function tooltipLabel(ctx: TooltipItem<'line' | 'bar'>): string {
  const parsed = ctx.parsed as { x: number | null; y: number | null };
  const raw =
    typeof parsed.y === 'number' && ctx.chart.options.indexAxis !== 'y'
      ? parsed.y
      : typeof parsed.x === 'number'
        ? parsed.x
        : 0;
  return `${ctx.dataset.label ?? ''}: ${formatUsd(raw)}`;
}

function lineOptions(): ChartOptions<'line'> {
  const color = textColor();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: animation(),
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color, boxWidth: 12, padding: 16 },
      },
      tooltip: {
        callbacks: { label: tooltipLabel },
      },
    },
    scales: {
      x: {
        ticks: { color },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color,
          callback: (value) => formatUsdAxis(typeof value === 'number' ? value : Number(value)),
        },
        grid: { color: gridColor() },
        title: { display: true, text: 'USD', color },
      },
    },
  };
}

function barOptions(): ChartOptions<'bar'> {
  const color = textColor();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: animation(),
    indexAxis: 'y',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: tooltipLabel },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          color,
          callback: (value) => formatUsdAxis(typeof value === 'number' ? value : Number(value)),
        },
        grid: { color: gridColor() },
        title: { display: true, text: 'USD', color },
      },
      y: {
        ticks: { color },
        grid: { display: false },
      },
    },
  };
}

const BAR_CAP = 15;

export class DashboardCharts {
  private weekChart: Chart<'line'> | null = null;
  private assistantChart: Chart<'bar'> | null = null;

  constructor(
    private readonly weekCanvas: HTMLCanvasElement,
    private readonly assistantCanvas: HTMLCanvasElement,
  ) {}

  update(records: readonly UsageRecord[], sources: readonly Source[], asOf: string): void {
    this.updateWeek(records, sources, asOf);
    this.updateAssistants(records);
  }

  destroy(): void {
    this.weekChart?.destroy();
    this.assistantChart?.destroy();
    this.weekChart = null;
    this.assistantChart = null;
  }

  private updateWeek(records: readonly UsageRecord[], sources: readonly Source[], asOf: string): void {
    const weeks: WeekTotals[] = totalsByWeek(records, records.length > 0 ? { to: asOf } : undefined);
    const labels = weeks.map((w) => w.weekKey);
    const datasets = [
      ...sources.map((src) => ({
        label: SOURCE_LABELS[src],
        data: weeks.map((w) => w.bySource[src]),
        borderColor: SOURCE_COLORS[src],
        backgroundColor: SOURCE_COLORS[src],
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      })),
      {
        label: 'Total',
        data: weeks.map((w) => w.totalCostUsd),
        borderColor: TOTAL_COLOR,
        backgroundColor: TOTAL_COLOR,
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5,
        borderDash: [6, 3],
      },
    ];

    if (this.weekChart) {
      this.weekChart.data.labels = labels;
      this.weekChart.data.datasets = datasets;
      this.weekChart.update();
      return;
    }

    this.weekChart = new Chart(this.weekCanvas, {
      type: 'line',
      data: { labels, datasets },
      options: lineOptions(),
    });
  }

  private updateAssistants(records: readonly UsageRecord[]): void {
    const rows = topConsumers(records, BAR_CAP).slice().reverse();
    const labels = rows.map((r) => r.assistant_or_project);
    const data = rows.map((r) => r.cost_usd);
    const colors = rows.map((r) => SOURCE_COLORS[r.source]);
    const datasets = [
      {
        label: 'Spend',
        data,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 0,
        borderRadius: 4,
        barPercentage: 0.7,
      },
    ];

    if (this.assistantChart) {
      this.assistantChart.data.labels = labels;
      this.assistantChart.data.datasets = datasets;
      this.assistantChart.update();
      return;
    }

    this.assistantChart = new Chart(this.assistantCanvas, {
      type: 'bar',
      data: { labels, datasets },
      options: barOptions(),
    });
  }
}

export const ASSISTANT_CHART_CAP = BAR_CAP;
