import { existsSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const SYSTEM_CHROME = '/usr/bin/google-chrome';

export type ConsoleError = { type: string; text: string };

export async function launchBrowser(): Promise<Browser> {
  const common = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  // Locally, use the box's already-installed Chrome. In CI, use Playwright's
  // cached Chromium (`npx playwright install chromium`).
  if (!process.env.CI && existsSync(SYSTEM_CHROME)) {
    return chromium.launch({ ...common, channel: 'chrome' });
  }
  return chromium.launch(common);
}

export async function openPage(browser: Browser, origin: string): Promise<{
  page: Page;
  context: BrowserContext;
  errors: ConsoleError[];
}> {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors: ConsoleError[] = [];
  page.on('pageerror', (err) => errors.push({ type: 'pageerror', text: err.message }));
  // Favicon is optional; Chromium logs a generic 404 for the missing icon.
  const isFavicon = (url: string) => /\/favicon\.ico(\?|$)/i.test(url);
  page.on('response', (res) => {
    if (res.status() < 400) return;
    if (isFavicon(res.url())) return;
    errors.push({ type: 'http', text: `${res.status()} ${res.url()}` });
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource: the server responded with a status of 404/.test(text)) return;
    errors.push({ type: 'console', text });
  });
  await page.goto(origin + '/', { waitUntil: 'networkidle' });
  await page.locator('#app-shell').waitFor({ timeout: 15_000 });
  await page.locator('main#view[data-state="ready"], main#view[data-state="empty"]').waitFor({
    timeout: 15_000,
  });
  return { page, context, errors };
}

export async function waitForView(page: Page, name?: string): Promise<void> {
  const view = name ? page.locator(`main#view [data-view="${name}"]`) : page.locator('main#view [data-view]');
  await view.waitFor({ timeout: 10_000 });
  await page.locator('main#view[data-state="ready"], main#view[data-state="empty"]').waitFor({
    timeout: 10_000,
  });
}

export async function gotoHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  const name = hash.replace(/^#\//, '').split(/[/?]/)[0] || 'overview';
  const known = ['overview', 'budgets', 'forecast', 'anomalies', 'assistant', 'source'];
  await waitForView(page, known.includes(name) ? name : undefined);
}
