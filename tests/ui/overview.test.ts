// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mountApp, q, type Mounted } from './mount';
import { totalSpend } from '../../src/aggregate';
import { FIXTURE_RECORDS } from '../fixtures';

describe('overview view', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('renders tiles, three charts with table fallbacks, and drill-down links', async () => {
    m = await mountApp('#/');
    const { root } = m;
    expect(Number(q(root, '[data-tile="total"]').dataset.value)).toBeCloseTo(totalSpend(FIXTURE_RECORDS), 2);
    for (const id of ['weekly', 'by-source', 'top-consumers']) {
      const fig = q(root, `figure[data-chart="${id}"]`);
      expect(fig.querySelector('canvas[role="img"][aria-label]')).toBeTruthy();
      expect(fig.querySelector('details table')).toBeTruthy();
    }
    // weekly table: one row per ISO week in the window (Oct 6 .. Nov 25 -> 8 weeks)
    expect(root.querySelectorAll('table[data-table="weekly"] tbody tr')).toHaveLength(8);
    const link = q<HTMLAnchorElement>(root, 'table[data-table="top-consumers"] a');
    expect(link.getAttribute('href')).toMatch(/^#\/assistant\//);
    expect(m.shell.currentResult?.tables.map((t) => t.id)).toEqual(['weekly', 'by-source', 'top-consumers']);
  });

  it('respects the 4-week preset and the source filter', async () => {
    m = await mountApp('#/?range=4w&src=cursor');
    const expected = totalSpend(FIXTURE_RECORDS.filter((r) => r.source === 'cursor' && r.date >= '2026-11-02'));
    expect(Number(q(m.root, '[data-tile="total"]').dataset.value)).toBeCloseTo(expected, 2);
    const head = [...m.root.querySelectorAll('table[data-table="by-source"] thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Week of', 'Cursor']);
    expect(m.root.querySelectorAll('table[data-table="weekly"] tbody tr')).toHaveLength(4);
  });

  it('exports the current filtered view as CSV and JSON', async () => {
    m = await mountApp('#/?range=4w');
    const csv = m.shell.buildExport('csv');
    expect(csv?.filename).toBe('usage-overview-weekly-2026-11-25.csv');
    const lines = csv?.text.trim().split('\r\n') ?? [];
    expect(lines[0]).toBe('Week of,Spend,Trend');
    expect(lines).toHaveLength(5);
    const json = JSON.parse(m.shell.buildExport('json')?.text ?? '{}');
    expect(json.url).toBe('#/?range=4w');
    expect(json.tables.map((t: { id: string }) => t.id)).toEqual(['weekly', 'by-source', 'top-consumers']);
  });
});
