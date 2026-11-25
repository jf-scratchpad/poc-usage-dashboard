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

  it('renders tiles, four charts with table fallbacks, and drill-down links', async () => {
    m = await mountApp('#/');
    const { root } = m;
    expect(Number(q(root, '[data-tile="total"]').dataset.value)).toBeCloseTo(totalSpend(FIXTURE_RECORDS), 2);
    for (const id of ['weekly', 'by-source', 'by-assistant', 'top-consumers']) {
      const fig = q(root, `figure[data-chart="${id}"]`);
      expect(fig.querySelector('canvas[role="img"][aria-label]')).toBeTruthy();
      expect(fig.querySelector('details table')).toBeTruthy();
    }
    // weekly table: one row per ISO week in the window (Oct 6 .. Nov 25 -> 8 weeks)
    expect(root.querySelectorAll('table[data-table="weekly"] tbody tr')).toHaveLength(8);
    const link = q<HTMLAnchorElement>(root, 'table[data-table="top-consumers"] a');
    expect(link.getAttribute('href')).toMatch(/^#\/assistant\//);
    expect(m.shell.currentResult?.tables.map((t) => t.id)).toEqual(['weekly', 'by-source', 'by-assistant', 'top-consumers']);
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
    expect(json.tables.map((t: { id: string }) => t.id)).toEqual(['weekly', 'by-source', 'by-assistant', 'top-consumers']);
  });
});

describe('overview: spend by assistant (sources merged) and search shortcuts', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('merges an assistant across sources case-insensitively', async () => {
    const extra = [...FIXTURE_RECORDS, { date: '2026-11-18', source: 'llm-api' as const, assistant_or_project: 'cody', units: 1, unit_type: 'tokens', cost_usd: 4 }];
    m = await mountApp('#/', extra);
    const rows = [...m.root.querySelectorAll('table[data-table="by-assistant"] tbody tr')];
    const cody = rows.filter((r) => r.querySelector('th')?.textContent?.toLowerCase() === 'cody');
    expect(cody).toHaveLength(1);
    const total = totalSpend(extra.filter((r) => r.assistant_or_project.toLowerCase() === 'cody'));
    expect(cody[0]?.textContent).toContain(`$${total.toFixed(2)}`);
    expect(q<HTMLAnchorElement>(cody[0] as HTMLElement, 'a').getAttribute('href')).toBe('#/assistant/Cody');
  });

  it('Enter in the search box opens an exact assistant match and clears the search', async () => {
    m = await mountApp('#/?range=12w');
    const input = q<HTMLInputElement>(m.root, '#f-q');
    input.value = 'rocky';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    await m.shell.whenIdle();
    expect(window.location.hash).toBe('#/assistant/Rocky?range=12w');
    expect(input.value).toBe('');
    input.value = 'roc';
    expect(m.shell.openAssistantFromSearch()).toBe(false);
  });
});
