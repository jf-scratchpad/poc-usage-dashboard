/**
 * Lazy chart host. Views ask for charts through this; Chart.js is loaded on
 * first use via dynamic import, and every chart is destroyed with its view.
 */
import type { BarSpec, LineSpec } from './chartkit';
import { h } from './dom';
import { renderTable, type DataTable, type TableOptions } from './table';
import type { Theme } from './theme';

type Destroyable = { destroy(): void };

let kitPromise: Promise<typeof import('./chartkit')> | undefined;
export function loadChartKit(): Promise<typeof import('./chartkit')> {
  kitPromise ??= import('./chartkit');
  return kitPromise;
}

export class ChartHost {
  private charts: Destroyable[] = [];
  private destroyed = false;

  constructor(private readonly theme: Theme) {}

  async line(canvas: HTMLCanvasElement, spec: LineSpec): Promise<void> {
    const kit = await loadChartKit();
    if (this.destroyed || !canvas.isConnected) return;
    this.charts.push(kit.lineChart(canvas, spec, this.theme));
  }

  async bar(canvas: HTMLCanvasElement, spec: BarSpec): Promise<void> {
    const kit = await loadChartKit();
    if (this.destroyed || !canvas.isConnected) return;
    this.charts.push(kit.barChart(canvas, spec, this.theme));
  }

  get count(): number {
    return this.charts.length;
  }

  destroy(): void {
    this.destroyed = true;
    for (const c of this.charts) c.destroy();
    this.charts = [];
  }
}

export type FigureParts = { figure: HTMLElement; canvas: HTMLCanvasElement };

/**
 * A chart panel: heading, canvas with an accessible label, and the same data
 * as a table inside <details> (also shown when printing).
 */
export function chartFigure(
  id: string,
  title: string,
  description: string,
  table: DataTable,
  options: TableOptions & { height?: number; wide?: boolean } = {},
): FigureParts {
  const canvas = h('canvas', { id: `chart-${id}`, role: 'img', 'aria-label': `${title}. ${description}` });
  const tableId = `table-${id}`;
  const figure = h(
    'figure',
    { class: `panel${options.wide ? ' panel-wide' : ''}`, 'data-chart': id, 'aria-labelledby': `fig-${id}` },
    h('figcaption', {}, h('h3', { id: `fig-${id}` }, title), h('p', { class: 'muted' }, description)),
    h('div', { class: 'chart-box', style: `height:${options.height ?? 300}px` }, canvas),
    h(
      'details',
      { class: 'chart-table', id: tableId },
      h('summary', {}, 'Show data table'),
      h('div', { class: 'table-scroll' }, renderTable(table, options)),
    ),
  );
  return { figure, canvas };
}
