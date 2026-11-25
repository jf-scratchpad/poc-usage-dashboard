// @vitest-environment happy-dom

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installCanvasMock } from './canvas-mock';
import { FIXTURE_AS_OF, FIXTURE_RECORDS } from './fixtures';
import { renderApp, type AppHandle } from '../src/app/render';
import { filterBySources, totalSpend } from '../src/aggregate';
import { formatUsd } from '../src/app/format';

beforeAll(() => {
  installCanvasMock();
});

describe('dashboard render', () => {
  let root: HTMLElement;
  let app: AppHandle | undefined;

  afterEach(() => {
    app?.destroy();
    app = undefined;
    root?.remove();
  });

  function mount(records = FIXTURE_RECORDS): AppHandle {
    root = document.createElement('div');
    document.body.append(root);
    app = renderApp(root, records, { asOf: FIXTURE_AS_OF });
    return app;
  }

  it('renders the filter, both chart canvases, the table, tiles, and the sample-data footer', () => {
    mount();

    expect(root.querySelector('#source-filter')).toBeTruthy();
    expect(root.querySelector('#filter-all')).toBeTruthy();
    expect(root.querySelector('#filter-grok-bot')).toBeTruthy();
    expect(root.querySelector('#filter-cursor')).toBeTruthy();
    expect(root.querySelector('#filter-azure')).toBeTruthy();

    const week = root.querySelector('#week-chart');
    const assistants = root.querySelector('#assistant-chart');
    expect(week).toBeInstanceOf(HTMLCanvasElement);
    expect(assistants).toBeInstanceOf(HTMLCanvasElement);
    expect(week?.getAttribute('aria-label')).toMatch(/weekly spend/i);
    expect(assistants?.getAttribute('aria-label')).toMatch(/assistant/i);

    const table = root.querySelector('#top-consumers');
    expect(table).toBeTruthy();
    const rows = root.querySelectorAll('#top-consumers-body tr');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(10);
    expect(root.querySelector('.consumer-name')?.textContent).toBeTruthy();

    expect(root.querySelector('[data-total-spend]')?.textContent).toBe(formatUsd(totalSpend(FIXTURE_RECORDS)));
    expect(root.querySelector('[data-this-week]')).toBeTruthy();
    expect(root.querySelector('[data-last-week]')).toBeTruthy();
    expect(root.querySelector('[data-wow]')).toBeTruthy();

    const footer = root.querySelector('.site-footer')?.textContent ?? '';
    expect(footer.toLowerCase()).toMatch(/sample data/);
    expect(root.querySelector('#empty-state')?.hasAttribute('hidden')).toBe(true);
  });

  it('changes the aggregated data when the source filter changes', () => {
    const handle = mount();
    const before = handle.getFilteredRecords();
    expect(before).toHaveLength(FIXTURE_RECORDS.length);

    handle.setSources(['cursor']);
    const after = handle.getFilteredRecords();
    expect(after.length).toBeLessThan(before.length);
    expect(after.every((r) => r.source === 'cursor')).toBe(true);
    expect(after).toEqual(filterBySources(FIXTURE_RECORDS, ['cursor']));

    const expected = totalSpend(after);
    expect(root.querySelector('[data-total-spend]')?.getAttribute('data-total-spend')).toBe(String(expected));
    expect(handle.getSelectedSources()).toEqual(['cursor']);

    const allBox = root.querySelector<HTMLInputElement>('#filter-all');
    const cursorBox = root.querySelector<HTMLInputElement>('#filter-cursor');
    const grokBox = root.querySelector<HTMLInputElement>('#filter-grok-bot');
    expect(cursorBox?.checked).toBe(true);
    expect(grokBox?.checked).toBe(false);
    expect(allBox?.checked).toBe(false);

    const badges = [...root.querySelectorAll('.source-badge')].map((el) => el.textContent);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.every((label) => label === 'Cursor')).toBe(true);
  });

  it('shows an empty state when there are no records', () => {
    const handle = mount([]);
    expect(handle.getFilteredRecords()).toEqual([]);
    const empty = root.querySelector('#empty-state');
    expect(empty?.hasAttribute('hidden')).toBe(false);
    expect(empty?.textContent).toMatch(/no usage data yet/i);
    expect(root.querySelector('#week-chart')).toBeInstanceOf(HTMLCanvasElement);
    expect(root.querySelector('#top-consumers-body .empty-row')?.textContent).toMatch(/no consumers/i);
    expect(root.querySelector('[data-total-spend]')?.textContent).toBe('$0.00');
    expect(root.querySelector('.site-footer')?.textContent).toMatch(/sample data/i);
  });

  it('shows a filtered empty state when every source is unchecked', () => {
    const handle = mount();
    handle.setSources([]);
    expect(handle.getFilteredRecords()).toEqual([]);
    const empty = root.querySelector('#empty-state');
    expect(empty?.hasAttribute('hidden')).toBe(false);
    expect(empty?.textContent).toMatch(/selected sources/i);
  });
});
