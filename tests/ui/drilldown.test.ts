// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { go, mountApp, q, type Mounted } from './mount';
import { totalSpend } from '../../src/aggregate';
import { assistantRanking, unitBreakdown } from '../../src/ui/views/assistant';
import type { UsageRecord } from '../../src/schema/usage';
import { FIXTURE_RECORDS } from '../fixtures';

// Cody also appears in a second source (lower-case) to exercise cross-source merging.
const CROSS: UsageRecord[] = [
  ...FIXTURE_RECORDS,
  { date: '2026-11-18', source: 'llm-api', assistant_or_project: 'cody', units: 500_000, unit_type: 'tokens', cost_usd: 4 },
];

describe('assistant drill-down', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('shows cost across sources, rank, units, and cost per unit', async () => {
    m = await mountApp('#/assistant/Cody', CROSS);
    const { root } = m;
    q(root, '[data-view="assistant"]');
    expect(q(root, 'h2').textContent).toBe('Assistant: Cody');
    const expected = totalSpend(CROSS.filter((r) => r.assistant_or_project.toLowerCase() === 'cody'));
    expect(Number(q(root, '[data-tile="total"]').dataset.value)).toBeCloseTo(expected, 2);
    expect(q(root, '[data-tile="rank"]').textContent).toContain('#1 of');
    expect(q(root, '[data-tile="sources"]').textContent).toContain('Grok Bot, LLM API');
    expect(q(root, '[data-tile="cpu"]').textContent).toContain('mixed');
    const head = [...root.querySelectorAll('table[data-table="assistant-weekly"] thead th')].map((t) => t.textContent);
    expect(head).toEqual(['Week of', 'Grok Bot', 'LLM API', 'Total', 'Trend']);
    expect(root.querySelectorAll('table[data-table="assistant-units"] tbody tr')).toHaveLength(2);
    expect(q<HTMLAnchorElement>(root, 'table[data-table="assistant-sources"] a').getAttribute('href')).toBe('#/source/grok-bot');
    expect(root.querySelector('figure[data-chart="assistant-weekly"] canvas')).toBeTruthy();
  });

  it('keeps the pinned assistant visible when the search would hide it, but respects dates and sources', async () => {
    m = await mountApp('#/assistant/Cody?q=zzz&range=4w&src=grok-bot');
    const expected = totalSpend(FIXTURE_RECORDS.filter((r) => r.assistant_or_project === 'Cody' && r.date >= '2026-11-02'));
    expect(Number(q(m.root, '[data-tile="total"]').dataset.value)).toBeCloseTo(expected, 2);
  });

  it('shows an empty state for an unknown assistant and for filters that exclude it', async () => {
    m = await mountApp('#/assistant/Nobody');
    expect(q(m.root, 'main [data-state="empty"]').textContent).toContain('No assistant or project named “Nobody”');
    await go(m, '#/assistant/Cody?src=azure');
    expect(q(m.root, 'main [data-state="empty"]').textContent).toContain('Cody has no usage');
  });

  it('is reachable from the overview top-consumers table', async () => {
    m = await mountApp('#/?range=12w');
    const link = q<HTMLAnchorElement>(m.root, 'table[data-table="top-consumers"] a');
    expect(link.getAttribute('href')).toContain('?range=12w');
    await go(m, link.getAttribute('href') ?? '');
    expect(q(m.root, '[data-view="assistant"]')).toBeTruthy();
  });

  it('exports its weekly table as CSV', async () => {
    m = await mountApp('#/assistant/Rocky');
    const csv = m.shell.buildExport('csv');
    expect(csv?.filename).toBe('usage-assistant-rocky-assistant-weekly-2026-11-25.csv');
    expect(csv?.text.split('\r\n')[0]).toBe('Week of,Grok Bot,Total,Trend');
  });
});

describe('assistant helpers', () => {
  it('ranks names case-insensitively across sources', () => {
    const r = assistantRanking(CROSS);
    expect(r[0]?.name).toBe('Cody');
    expect(r[0]?.cost).toBeCloseTo(totalSpend(CROSS.filter((x) => x.assistant_or_project.toLowerCase() === 'cody')), 2);
    expect(r.filter((x) => x.name.toLowerCase() === 'cody')).toHaveLength(1);
  });
  it('computes cost per unit per source and unit type', () => {
    const rows = unitBreakdown([
      { date: '2026-11-01', source: 'cursor', assistant_or_project: 'X', units: 10, unit_type: 'requests', cost_usd: 5 },
      { date: '2026-11-02', source: 'cursor', assistant_or_project: 'X', units: 0, unit_type: 'seats', cost_usd: 1 },
    ]);
    expect(rows.find((r) => r.unitType === 'requests')?.costPerUnit).toBe(0.5);
    expect(rows.find((r) => r.unitType === 'seats')?.costPerUnit).toBeNull();
  });
});

describe('source detail', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('renders tiles, weekly trend, and an assistant table with drill-down links', async () => {
    m = await mountApp('#/source/cursor');
    const { root } = m;
    expect(q(root, 'h2').textContent).toBe('Source: Cursor');
    expect(q(root, 'nav a[aria-current="page"]').dataset.nav).toBe('source-cursor');
    const expected = totalSpend(FIXTURE_RECORDS.filter((r) => r.source === 'cursor'));
    expect(Number(q(root, '[data-tile="total"]').dataset.value)).toBeCloseTo(expected, 2);
    const names = [...root.querySelectorAll('table[data-table="source-assistants"] tbody a')].map((a) => a.textContent);
    expect(names).toEqual(['Cursor Agent', 'Composer']);
    expect(q<HTMLAnchorElement>(root, 'table[data-table="source-assistants"] a').getAttribute('href')).toBe('#/assistant/Cursor%20Agent');
    expect(q(root, '[data-tile="units"]').textContent).toContain('requests');
  });

  it('shows the source even when the source filter unchecks it, with a note', async () => {
    m = await mountApp('#/source/azure?src=cursor');
    expect(q(m.root, '.notice').textContent).toContain('unchecked');
    expect(m.root.querySelectorAll('table[data-table="source-weekly"] tbody tr').length).toBeGreaterThan(0);
  });

  it('shows the empty state when the search excludes everything, and not-found for unknown sources', async () => {
    m = await mountApp('#/source/azure?q=Cody');
    expect(q(m.root, 'main [data-state="empty"]').textContent).toContain('No Azure usage');
    await go(m, '#/source/aws');
    expect(q(m.root, '[data-view="notfound"]')).toBeTruthy();
  });
});
