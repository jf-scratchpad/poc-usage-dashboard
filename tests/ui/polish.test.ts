// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountApp, q, type Mounted } from './mount';
import { installCanvasMock } from '../canvas-mock';
import { barChart, lineChart } from '../../src/ui/chartkit';
import { download } from '../../src/ui/export';
import type { ViewModule } from '../../src/ui/views/types';

describe('print and export actions', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
    vi.restoreAllMocks();
  });

  it('Print opens the browser print dialog', async () => {
    m = await mountApp('#/');
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    q<HTMLButtonElement>(m.root, '[data-print]').click();
    expect(print).toHaveBeenCalledOnce();
  });

  it('Export CSV / JSON download a file named after the view and data date', async () => {
    m = await mountApp('#/source/azure');
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      created.push(b as Blob);
      return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    q<HTMLButtonElement>(m.root, '[data-export="csv"]').click();
    q<HTMLButtonElement>(m.root, '[data-export="json"]').click();
    expect(names).toEqual(['usage-source-azure-source-weekly-2026-11-25.csv', 'usage-source-azure-2026-11-25.json']);
    expect(created.map((b) => b.type)).toEqual(['text/csv', 'application/json']);
    expect(await created[0]?.text()).toMatch(/^Week of,Spend,Trend,Units\r\n/);
  });

  it('download() reports false where Blob URLs are unavailable', () => {
    const fake = { defaultView: { URL: {} } } as unknown as Document;
    expect(download(fake, 'x.csv', 'a', 'text/csv')).toBe(false);
  });

  it('the print stylesheet hides controls and expands chart tables', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(/\.filters, \.toolbar[^{]*\{ display: none !important; \}/);
    expect(print).toContain('.chart-table > :not(summary) { display: block !important; }');
    expect(print).toContain('break-inside: avoid');
  });
});

describe('view navigation hook', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('ctx.navigate keeps the current filters (used by chart clicks)', async () => {
    const jump: ViewModule = {
      render(ctx) {
        setTimeout(() => ctx.navigate({ name: 'source', source: 'cursor' }), 0);
        return { title: 'Jump', state: 'ready', tables: [] };
      },
    };
    m = await mountApp('#/budgets?range=4w', undefined, { views: { budgets: async () => jump } });
    await new Promise((r) => setTimeout(r, 5));
    await m.shell.whenIdle();
    expect(window.location.hash).toBe('#/source/cursor?range=4w');
    expect(q(m.root, '[data-view="source"]')).toBeTruthy();
  });
});

describe('chartkit', () => {
  it('builds line and bar charts, including a trend overlay, band fill, and click handler', () => {
    installCanvasMock();
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const line = lineChart(
      canvas,
      {
        labels: ['a', 'b'],
        stacked: true,
        series: [
          { label: 'x', data: [1, 2], color: '#E69F00', fill: true },
          { label: 'lo', data: [1, 1], color: '#56B4E9', helper: true },
          { label: 'hi', data: [2, 3], color: '#56B4E9', fill: '-1', noPoints: true },
          { label: 'flag', data: [null, 2], color: '#D55E00', pointsOnly: true },
        ],
      },
      'light',
    ) as unknown as { data: { datasets: { fill: unknown; showLine?: boolean }[] }; destroy(): void };
    expect(line.data.datasets.map((d) => d.fill)).toEqual(['stack', false, '-1', false]);
    expect(line.data.datasets[3]?.showLine).toBe(false);
    line.destroy();

    const clicks: number[] = [];
    const bar = barChart(
      canvas,
      { labels: ['a', 'b'], stacked: true, series: [{ label: 'y', data: [3, 4], color: '#009E73', colors: ['#009E73', '#CC79A7'] }], trend: { label: 't', data: [3, 4], color: '#000000' }, onClickLabel: (_l, i) => clicks.push(i) },
      'dark',
    ) as unknown as { data: { datasets: { type?: string }[] }; options: { onClick: (e: unknown, els: { index: number }[]) => void }; destroy(): void };
    expect(bar.data.datasets.map((d) => d.type)).toEqual([undefined, 'line']);
    bar.options.onClick({}, [{ index: 1 }]);
    expect(clicks).toEqual([1]);
    bar.destroy();
    canvas.remove();
  });
});
