// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { go, mountApp, q, type Mounted } from './mount';
import { SOURCES } from '../../src/schema/usage';
import { totalSpend } from '../../src/aggregate';
import { FIXTURE_RECORDS } from '../fixtures';

describe('app shell', () => {
  let m: Mounted | undefined;
  afterEach(() => {
    m?.cleanup();
    m = undefined;
  });

  it('renders header, freshness, nav, filters, toolbar, and the overview by default', async () => {
    m = await mountApp('#/');
    const { root } = m;
    expect(q(root, '#app-shell h1').textContent).toContain('AI Usage');
    expect(q(root, '[data-freshness]').textContent).toContain('Data through Nov 25, 2026');
    expect(q(root, '[data-freshness]').textContent).toContain(`${FIXTURE_RECORDS.length} records`);
    expect(root.querySelectorAll('nav[aria-label="Views"] a[aria-current="page"]')).toHaveLength(1);
    expect(q(root, 'nav a[aria-current="page"]').dataset.nav).toBe('overview');
    expect(root.querySelectorAll('#filters input[type="checkbox"]')).toHaveLength(SOURCES.length);
    expect(q(root, 'label[for="f-range"]')).toBeTruthy();
    expect(q(root, 'label[for="f-q"]')).toBeTruthy();
    expect(q(root, 'main#view').dataset.state).toBe('ready');
    expect(q(root, '[data-view="overview"]')).toBeTruthy();
    expect(document.title).toBe('Overview · AI Usage & Cost');
  });

  it('nav links carry the current filters so URLs stay shareable', async () => {
    m = await mountApp('#/?range=4w&src=azure');
    const budgets = q<HTMLAnchorElement>(m.root, 'nav a[data-nav="budgets"]');
    expect(budgets.getAttribute('href')).toBe('#/budgets?range=4w&src=azure');
    expect(q<HTMLAnchorElement>(m.root, 'nav a[data-nav="source-cursor"]').getAttribute('href')).toBe('#/source/cursor?range=4w&src=azure');
  });

  it('syncs the filter form from the URL and the URL from the form', async () => {
    m = await mountApp('#/?range=custom&from=2026-11-01&to=2026-11-15&src=cursor&q=Comp');
    const { root, shell } = m;
    expect(q<HTMLSelectElement>(root, '#f-range').value).toBe('custom');
    expect(q<HTMLInputElement>(root, '#f-from').value).toBe('2026-11-01');
    expect(q(root, '#f-from').closest<HTMLElement>('.field')?.hidden).toBe(false);
    expect(q<HTMLInputElement>(root, '#f-src-cursor').checked).toBe(true);
    expect(q<HTMLInputElement>(root, '#f-src-azure').checked).toBe(false);
    expect(q<HTMLInputElement>(root, '#f-q').value).toBe('Comp');

    const azure = q<HTMLInputElement>(root, '#f-src-azure');
    azure.checked = true;
    azure.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    await shell.whenIdle();
    expect(window.location.hash).toContain('src=cursor%2Cazure');

    const range = q<HTMLSelectElement>(root, '#f-range');
    range.value = '4w';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    await shell.whenIdle();
    expect(window.location.hash).toContain('range=4w');
    expect(window.location.hash).not.toContain('from=');
    expect(q(root, '#f-from').closest<HTMLElement>('.field')?.hidden).toBe(true);
  });

  it('debounces assistant search into the URL without adding history entries', async () => {
    m = await mountApp('#/');
    const input = q<HTMLInputElement>(m.root, '#f-q');
    input.value = 'Cody';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
    await m.shell.whenIdle();
    expect(window.location.hash).toBe('#/?q=Cody');
    const tiles = q(m.root, '[data-tile="total"]');
    const cody = totalSpend(FIXTURE_RECORDS.filter((r) => r.assistant_or_project === 'Cody'));
    expect(Number(tiles.dataset.value)).toBeCloseTo(cody, 2);
  });

  it('reset clears every filter', async () => {
    m = await mountApp('#/forecast?range=4w&src=azure&q=x');
    q<HTMLButtonElement>(m.root, '#f-reset').click();
    await new Promise((r) => setTimeout(r, 0));
    await m.shell.whenIdle();
    expect(window.location.hash).toBe('#/forecast');
  });

  it('toggles dark and light themes, persists the choice, and redraws charts', async () => {
    m = await mountApp('#/');
    const btn = q<HTMLButtonElement>(m.root, '#theme-toggle');
    const before = document.documentElement.dataset.theme;
    btn.click();
    await m.shell.whenIdle();
    const after = document.documentElement.dataset.theme;
    expect(after).not.toBe(before);
    expect(window.localStorage.getItem('ud-theme')).toBe(after);
    expect(btn.getAttribute('aria-label')).toMatch(/Switch to (light|dark) theme/);
    expect(q(m.root, '[data-view="overview"]')).toBeTruthy();
  });

  it('moves focus to the view heading on route change', async () => {
    m = await mountApp('#/');
    await go(m, '#/source/azure');
    await go(m, '#/');
    expect(document.activeElement?.hasAttribute('data-view-title')).toBe(true);
  });

  it('shows not found for unknown routes', async () => {
    m = await mountApp('#/wat');
    expect(q(m.root, '[data-view="notfound"]').textContent).toContain('/wat');
    expect(q(m.root, 'main').dataset.state).toBe('empty');
  });

  it('shows an error state with retry when data cannot load', async () => {
    let calls = 0;
    m = await mountApp('#/', [], {
      loader: async () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return { records: FIXTURE_RECORDS, manifest: null, origin: 'json' };
      },
    });
    const err = q(m.root, 'main [data-state="error"]');
    expect(q(m.root, 'main').dataset.state).toBe('error');
    expect(err.getAttribute('role')).toBe('alert');
    q<HTMLButtonElement>(err, 'button').click();
    await new Promise((r) => setTimeout(r, 0));
    await m.shell.whenIdle();
    expect(q(m.root, 'main').dataset.state).toBe('ready');
  });

  it('shows an empty state with a reset link when filters match nothing', async () => {
    m = await mountApp('#/?src=');
    const empty = q(m.root, 'main [data-state="empty"]');
    expect(empty.textContent).toContain('No usage matches');
    expect(q<HTMLAnchorElement>(empty, 'a').getAttribute('href')).toBe('#/');
    expect(q<HTMLButtonElement>(m.root, '[data-export="csv"]').disabled).toBe(true);
  });

  it('shows the loading state before data arrives', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const root = document.createElement('div');
    document.body.append(root);
    const { AppShell } = await import('../../src/ui/shell');
    const shell = new AppShell(root, {
      loader: async () => {
        await gate;
        return { records: FIXTURE_RECORDS, manifest: null, origin: 'json' };
      },
      today: '2026-11-25',
    });
    const started = shell.start();
    expect(q(root, 'main').dataset.state).toBe('loading');
    expect(q(root, 'main [role="status"]').textContent).toContain('Loading');
    release();
    await started;
    expect(q(root, 'main').dataset.state).toBe('ready');
    shell.destroy();
    root.remove();
  });
});
