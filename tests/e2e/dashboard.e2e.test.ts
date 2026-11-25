import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { gotoHash, launchBrowser, openPage, waitForView, type ConsoleError } from './browser';
import { startPreview, stopPreview } from './preview';

let browser: Browser;
let page: Page;
let errors: ConsoleError[];
let origin: string;

beforeAll(async () => {
  origin = await startPreview();
  browser = await launchBrowser();
  const opened = await openPage(browser, origin);
  page = opened.page;
  errors = opened.errors;
});

afterAll(async () => {
  await page?.context().close();
  await browser?.close();
  await stopPreview();
});

async function isVisible(selector: string): Promise<boolean> {
  return page.locator(selector).first().isVisible();
}

describe('built dashboard (e2e)', () => {
  it('loads the app shell with no console errors', async () => {
    expect(await isVisible('#app-shell')).toBe(true);
    expect(await isVisible('nav[aria-label="Views"]')).toBe(true);
    expect(await isVisible('#filters')).toBe(true);
    expect(await isVisible('main#view')).toBe(true);
    expect(await isVisible('button#theme-toggle')).toBe(true);
    expect(errors, errors.map((e) => `${e.type}: ${e.text}`).join('\n')).toEqual([]);
  });

  it('renders the overview charts and top-consumers table', async () => {
    await gotoHash(page, '#/');
    expect(await isVisible('[data-view="overview"]')).toBe(true);
    expect(await page.locator('main#view').getAttribute('data-state')).toBe('ready');
    expect(await isVisible('[data-chart="weekly"]')).toBe(true);
    expect(await isVisible('[data-chart="by-source"]')).toBe(true);
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
    const total = await page.locator('[data-tile="total"]').getAttribute('data-value');
    expect(Number(total)).toBeGreaterThan(0);
  });

  it('changes summary numbers when a source filter is toggled', async () => {
    await gotoHash(page, '#/');
    const before = Number(await page.locator('[data-tile="total"]').getAttribute('data-value'));
    expect(before).toBeGreaterThan(0);
    await page.uncheck('#f-src-azure');
    await page.waitForFunction(() => /[?&]src=/.test(location.hash));
    await waitForView(page, 'overview');
    const after = Number(await page.locator('[data-tile="total"]').getAttribute('data-value'));
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    await page.check('#f-src-azure');
    await waitForView(page, 'overview');
  });

  it('round-trips filter state through the URL hash', async () => {
    await page.selectOption('#f-range', '4w');
    await page.waitForFunction(() => location.hash.includes('range=4w'));
    await waitForView(page, 'overview');
    const totalAt4w = await page.locator('[data-tile="total"]').getAttribute('data-value');
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toMatch(/range=4w/);

    await page.goto(`${origin}/${hash}`, { waitUntil: 'networkidle' });
    await waitForView(page, 'overview');
    expect(await page.locator('#f-range').inputValue()).toBe('4w');
    expect(await page.locator('[data-tile="total"]').getAttribute('data-value')).toBe(totalAt4w);
  });

  it('renders every route with a chart, a table, or the known placeholder', async () => {
    const routes: Array<{ hash: string; view: string }> = [
      { hash: '#/', view: 'overview' },
      { hash: '#/budgets', view: 'budgets' },
      { hash: '#/forecast', view: 'forecast' },
      { hash: '#/anomalies', view: 'anomalies' },
      { hash: '#/source/cursor', view: 'source' },
      { hash: '#/assistant/Cody', view: 'assistant' },
    ];
    for (const r of routes) {
      await gotoHash(page, r.hash);
      expect(await isVisible(`[data-view="${r.view}"]`), r.hash).toBe(true);
      const state = await page.locator('main#view').getAttribute('data-state');
      expect(['ready', 'empty']).toContain(state);
      const hasChart = (await page.locator('[data-chart]').count()) > 0;
      const hasTable = (await page.locator('table').count()) > 0;
      const placeholder = (await page.locator('[data-state="empty"]').count()) > 0;
      expect(hasChart || hasTable || placeholder, `route ${r.hash} had no chart, table, or placeholder`).toBe(true);
    }
  });

  it('downloads CSV and JSON exports of the overview', async () => {
    await gotoHash(page, '#/');
    expect(await page.locator('button[data-export="csv"]').isEnabled()).toBe(true);

    const csvDownload = page.waitForEvent('download');
    await page.click('button[data-export="csv"]');
    const csv = await csvDownload;
    expect(csv.suggestedFilename()).toMatch(/^usage-overview-.*\.csv$/);
    const csvPath = await csv.path();
    expect(csvPath).toBeTruthy();
    const csvText = readFileSync(csvPath!, 'utf8');
    expect(csvText).toMatch(/Spend|Week|Assistant|Cost/i);
    expect(csvText.split(/\r?\n/).length).toBeGreaterThan(2);

    const jsonDownload = page.waitForEvent('download');
    await page.click('button[data-export="json"]');
    const json = await jsonDownload;
    expect(json.suggestedFilename()).toMatch(/^usage-overview-.*\.json$/);
    const jsonPath = await json.path();
    const payload = JSON.parse(readFileSync(jsonPath!, 'utf8')) as { note?: string; tables?: unknown[] };
    expect(payload.note).toMatch(/sample data/i);
    expect(Array.isArray(payload.tables) && payload.tables.length).toBeGreaterThan(0);
  });

  it('finishes with a clean console', () => {
    expect(errors, errors.map((e) => `${e.type}: ${e.text}`).join('\n')).toEqual([]);
  });
});
