/**
 * App shell: header (title, data freshness, theme toggle), view navigation,
 * global filter bar synced to the URL, export/print toolbar, and the <main>
 * outlet where lazily loaded views render. Owns loading / error states.
 */
import { SOURCES, type Source } from '../schema/usage';
import { SOURCE_LABELS } from '../app/format';
import { ChartHost } from './charts';
import { loadDataset, type Dataset, type Loader } from './data';
import { h, must } from './dom';
import { download, exportFileName, toCsv, toJson } from './export';
import {
  RANGE_LABELS,
  RANGE_PRESETS,
  applyFilters,
  dateWindow,
  defaultFilters,
  describeFilters,
  type Filters,
  type RangePreset,
} from './filters';
import { HashRouter, formatHash, sameRoute, type AppLocation, type Route, type RouteName } from './router';
import { applyTheme, currentTheme, initialTheme, saveTheme, type Theme } from './theme';
import { longDate } from './views/common';
import type { ViewModule, ViewResult } from './views/types';

export type ViewLoaders = Record<RouteName, () => Promise<ViewModule>>;

/** Each view is its own lazy chunk. */
export const VIEW_LOADERS: ViewLoaders = {
  overview: () => import('./views/overview'),
  assistant: () => import('./views/assistant'),
  source: () => import('./views/source'),
  budgets: () => import('./views/budgets'),
  forecast: () => import('./views/forecast'),
  anomalies: () => import('./views/anomalies'),
  notfound: () => import('./views/notfound'),
};

export type ShellOptions = {
  win?: Window;
  loader?: Loader;
  today?: string;
  views?: Partial<ViewLoaders>;
};

const NAV: { route: Route; label: string }[] = [
  { route: { name: 'overview' }, label: 'Overview' },
  { route: { name: 'budgets' }, label: 'Budgets' },
  { route: { name: 'forecast' }, label: 'Forecast' },
  { route: { name: 'anomalies' }, label: 'Anomalies' },
];

const APP_TITLE = 'AI Usage & Cost';

export class AppShell {
  readonly win: Window;
  readonly doc: Document;
  private readonly root: HTMLElement;
  private readonly views: ViewLoaders;
  private readonly loader: Loader | undefined;
  private readonly today: string | undefined;
  private router: HashRouter | undefined;
  private data: Dataset | undefined;
  private theme: Theme;
  private charts: ChartHost | undefined;
  private result: ViewResult | undefined;
  private seq = 0;
  private idle: Promise<void> = Promise.resolve();
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  readonly main: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly live: HTMLElement;
  private readonly freshness: HTMLElement;
  private readonly themeBtn: HTMLButtonElement;
  private readonly nav: HTMLElement;

  constructor(root: HTMLElement, options: ShellOptions = {}) {
    this.root = root;
    this.win = options.win ?? window;
    this.doc = this.win.document;
    this.views = { ...VIEW_LOADERS, ...options.views };
    this.loader = options.loader;
    this.today = options.today;
    this.theme = initialTheme(this.win);
    applyTheme(this.doc, this.theme);

    root.replaceChildren();
    root.id = root.id || 'app';
    this.themeBtn = h('button', { type: 'button', id: 'theme-toggle', class: 'button ghost' });
    this.freshness = h('p', { class: 'freshness muted', 'data-freshness': true }, 'Loading data…');
    this.nav = h('nav', { 'aria-label': 'Views', class: 'app-nav' });
    this.form = this.buildFilters();
    this.main = h('main', { id: 'view', tabindex: '-1', 'data-state': 'loading' });
    this.live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', id: 'live' });
    const skip = h('button', { type: 'button', class: 'skip-link' }, 'Skip to content');
    skip.addEventListener('click', () => this.main.focus());

    root.append(
      h(
        'div',
        { id: 'app-shell' },
        skip,
        h(
          'header',
          { class: 'app-header' },
          h('div', {}, h('h1', {}, APP_TITLE), this.freshness),
          h('div', { class: 'header-actions' }, h('span', { class: 'badge' }, 'Fictional sample data'), this.themeBtn),
        ),
        this.nav,
        this.form,
        this.buildToolbar(),
        this.main,
        h('footer', { class: 'app-footer muted' }, 'All figures are invented sample data. Nothing here is connected to a real account.'),
        this.live,
      ),
    );
    this.updateThemeButton();
    this.themeBtn.addEventListener('click', () => this.toggleTheme());
  }

  /** Loads data, then starts routing. Resolves after the first view render. */
  async start(): Promise<void> {
    this.setMainState('loading', h('div', { class: 'state', 'data-state': 'loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading usage data…'));
    try {
      this.data = await loadDataset(this.loader, this.today);
    } catch (err) {
      this.showError('Could not load usage data.', err, () => void this.start());
      return;
    }
    this.populateFromData(this.data);
    if (!this.router) {
      this.router = new HashRouter(this.win, (loc, prev) => this.onLocation(loc, prev));
      this.router.start();
    } else {
      this.onLocation(this.router.location, undefined);
    }
    await this.whenIdle();
  }

  /** Resolves once the latest navigation has rendered (including charts). */
  whenIdle(): Promise<void> {
    return this.idle;
  }

  get location(): AppLocation | undefined {
    return this.router?.location;
  }

  get currentResult(): ViewResult | undefined {
    return this.result;
  }

  get dataset(): Dataset | undefined {
    return this.data;
  }

  navigate(route: Route, filters?: Filters, replace = false): void {
    const loc = this.router?.location;
    this.router?.navigate(route, filters ?? loc?.filters ?? defaultFilters(), { replace });
  }

  destroy(): void {
    this.router?.stop();
    this.charts?.destroy();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.root.replaceChildren();
  }

  // ---- filters ---------------------------------------------------------

  private buildFilters(): HTMLFormElement {
    const range = h('select', { id: 'f-range', name: 'range' });
    for (const p of RANGE_PRESETS) range.append(h('option', { value: p }, RANGE_LABELS[p]));
    const opts = h('div', { class: 'opts' });
    const sources = h('fieldset', { class: 'field sources' }, h('legend', {}, 'Sources'), opts);
    for (const s of SOURCES) {
      opts.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', id: `f-src-${s}`, name: 'src', value: s, 'data-source': s }), SOURCE_LABELS[s]));
    }
    const form = h(
      'form',
      { id: 'filters', class: 'filters', 'aria-label': 'Filters', role: 'search' },
      h('div', { class: 'field' }, h('label', { for: 'f-range' }, 'Date range'), range),
      h('div', { class: 'field custom-range', hidden: true }, h('label', { for: 'f-from' }, 'From'), h('input', { type: 'date', id: 'f-from', name: 'from' })),
      h('div', { class: 'field custom-range', hidden: true }, h('label', { for: 'f-to' }, 'To'), h('input', { type: 'date', id: 'f-to', name: 'to' })),
      sources,
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'f-q' }, 'Assistant search'),
        h('input', { type: 'search', id: 'f-q', name: 'q', list: 'f-q-list', placeholder: 'e.g. Cody', autocomplete: 'off' }),
        h('datalist', { id: 'f-q-list' }),
      ),
      h('div', { class: 'field field-actions' }, h('button', { type: 'button', id: 'f-reset', class: 'button ghost' }, 'Reset filters')),
    );
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', (e) => this.onFilterChange(e));
    form.addEventListener('input', (e) => {
      if ((e.target as HTMLElement).id === 'f-q') this.onSearchInput();
    });
    must(form.querySelector('#f-reset')).addEventListener('click', () => {
      const loc = this.router?.location;
      if (loc) this.navigate(loc.route, defaultFilters());
    });
    return form;
  }

  private buildToolbar(): HTMLElement {
    const csv = h('button', { type: 'button', class: 'button', 'data-export': 'csv' }, 'Export CSV');
    const json = h('button', { type: 'button', class: 'button', 'data-export': 'json' }, 'Export JSON');
    const print = h('button', { type: 'button', class: 'button ghost', 'data-print': true }, 'Print');
    csv.addEventListener('click', () => this.exportView('csv'));
    json.addEventListener('click', () => this.exportView('json'));
    print.addEventListener('click', () => this.win.print());
    return h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Export' }, csv, json, print);
  }

  /** Reads the filter form into a Filters object. */
  readForm(): Filters {
    const q = (id: string) => must(this.form.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`), id);
    const range = q('f-range').value as RangePreset;
    const sources = SOURCES.filter((s) => (this.form.querySelector<HTMLInputElement>(`#f-src-${s}`)?.checked ?? false));
    const f: Filters = { range, sources, q: q('f-q').value.trim() };
    if (range === 'custom') {
      const from = q('f-from').value;
      const to = q('f-to').value;
      if (from) f.from = from;
      if (to) f.to = to;
    }
    return f;
  }

  private writeForm(f: Filters, win: { from: string; to: string }): void {
    const range = must(this.form.querySelector<HTMLSelectElement>('#f-range'));
    range.value = f.range;
    for (const el of this.form.querySelectorAll<HTMLElement>('.custom-range')) el.hidden = f.range !== 'custom';
    must(this.form.querySelector<HTMLInputElement>('#f-from')).value = win.from;
    must(this.form.querySelector<HTMLInputElement>('#f-to')).value = win.to;
    for (const s of SOURCES) {
      const box = this.form.querySelector<HTMLInputElement>(`#f-src-${s}`);
      if (box) box.checked = f.sources.includes(s as Source);
    }
    const qEl = must(this.form.querySelector<HTMLInputElement>('#f-q'));
    if (this.doc.activeElement !== qEl) qEl.value = f.q;
  }

  private onFilterChange(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.id === 'f-q') return; // handled by input (debounced)
    const loc = this.router?.location;
    if (!loc) return;
    const next = this.readForm();
    if (target.id === 'f-range' && next.range === 'custom' && this.data) {
      // Seed the custom range from the window that was showing.
      const w = dateWindow(loc.filters, this.data.asOf, this.data.earliest);
      next.from = w.from;
      next.to = w.to;
    }
    this.navigate(loc.route, next);
  }

  private onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      const loc = this.router?.location;
      if (loc) this.navigate(loc.route, this.readForm(), true);
    }, 200);
  }

  private populateFromData(data: Dataset): void {
    const names = [...new Set(data.records.map((r) => r.assistant_or_project))].sort((a, b) => a.localeCompare(b));
    must(this.form.querySelector('#f-q-list')).replaceChildren(...names.map((n) => h('option', { value: n })));
    for (const id of ['f-from', 'f-to']) {
      const el = must(this.form.querySelector<HTMLInputElement>(`#${id}`));
      el.min = data.earliest;
      el.max = data.asOf;
    }
    const through = data.dataThrough;
    const origin = data.origin === 'json' ? 'static JSON' : 'bundled sample';
    this.freshness.textContent = `Data through ${longDate(through)} · ${data.records.length.toLocaleString('en-US')} records · ${origin}`;
    this.freshness.dataset.through = through;
    this.freshness.dataset.origin = data.origin;
  }

  // ---- routing / rendering --------------------------------------------

  private updateNav(loc: AppLocation): void {
    const links: HTMLElement[] = NAV.map(({ route, label }) => {
      const current = sameRoute(route, loc.route);
      return h('a', { href: formatHash(route, loc.filters), 'data-nav': route.name, 'aria-current': current ? 'page' : undefined }, label);
    });
    const srcLinks = SOURCES.map((s) => {
      const route: Route = { name: 'source', source: s };
      return h('a', { href: formatHash(route, loc.filters), 'data-nav': `source-${s}`, 'aria-current': sameRoute(route, loc.route) ? 'page' : undefined }, SOURCE_LABELS[s]);
    });
    this.nav.replaceChildren(
      h('ul', { class: 'nav-main' }, ...links.map((a) => h('li', {}, a))),
      h('ul', { class: 'nav-sources', 'aria-label': 'Sources' }, h('li', { class: 'muted nav-label', 'aria-hidden': 'true' }, 'Sources:'), ...srcLinks.map((a) => h('li', {}, a))),
    );
  }

  private onLocation(loc: AppLocation, prev: AppLocation | undefined): void {
    const data = this.data;
    if (!data) return;
    const window = dateWindow(loc.filters, data.asOf, data.earliest);
    this.writeForm(loc.filters, window);
    this.updateNav(loc);
    const focus = prev !== undefined && !sameRoute(prev.route, loc.route);
    this.idle = this.renderView(loc, focus);
  }

  private async renderView(loc: AppLocation, focus: boolean): Promise<void> {
    const seq = ++this.seq;
    const data = must(this.data, 'data');
    this.main.setAttribute('aria-busy', 'true');
    let mod: ViewModule;
    try {
      mod = await this.views[loc.route.name]();
    } catch (err) {
      if (seq === this.seq) this.showError('Could not load this view.', err, () => this.onLocation(loc, undefined));
      return;
    }
    if (seq !== this.seq) return;

    this.charts?.destroy();
    this.charts = new ChartHost(this.theme);
    const window = dateWindow(loc.filters, data.asOf, data.earliest);
    const container = h('div', { class: 'view', 'data-view': loc.route.name });
    this.main.replaceChildren(container);
    try {
      this.result = mod.render({
        root: container,
        data,
        route: loc.route,
        filters: loc.filters,
        window,
        filtered: applyFilters(data.records, loc.filters, window),
        theme: this.theme,
        charts: this.charts,
        hrefFor: (route) => formatHash(route, loc.filters),
        navigate: (route) => this.navigate(route, loc.filters),
        resetHref: formatHash(loc.route, defaultFilters()),
      });
    } catch (err) {
      this.showError('Something went wrong rendering this view.', err, () => this.onLocation(loc, undefined));
      return;
    }
    this.main.dataset.state = this.result.state;
    this.main.removeAttribute('aria-busy');
    this.doc.title = `${this.result.title} · ${APP_TITLE}`;
    this.live.textContent = `${this.result.title}: ${describeFilters(loc.filters, window)}`;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-export]')) b.disabled = this.result.tables.length === 0;
    if (focus) this.main.querySelector<HTMLElement>('[data-view-title]')?.focus();
    try {
      await this.result.chartsReady;
    } catch (err) {
      console.error(err);
    }
  }

  private setMainState(state: 'loading' | 'error', content: HTMLElement): void {
    this.charts?.destroy();
    this.charts = undefined;
    this.result = undefined;
    this.main.dataset.state = state;
    this.main.replaceChildren(content);
  }

  private showError(message: string, err: unknown, retry: () => void): void {
    console.error(err);
    const btn = h('button', { type: 'button', class: 'button' }, 'Try again');
    btn.addEventListener('click', retry);
    this.main.removeAttribute('aria-busy');
    this.setMainState('error', h('div', { class: 'state state-error', 'data-state': 'error', role: 'alert' }, h('p', {}, message), h('p', {}, btn)));
  }

  // ---- theme / export ---------------------------------------------------

  private updateThemeButton(): void {
    const dark = this.theme === 'dark';
    this.themeBtn.textContent = dark ? '☀ Light theme' : '☾ Dark theme';
    this.themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    this.themeBtn.setAttribute('aria-pressed', String(!dark));
  }

  toggleTheme(): void {
    this.theme = currentTheme(this.doc) === 'dark' ? 'light' : 'dark';
    applyTheme(this.doc, this.theme);
    saveTheme(this.win, this.theme);
    this.updateThemeButton();
    const loc = this.router?.location;
    if (loc && this.data) this.idle = this.renderView(loc, false); // recolor charts
  }

  /** Builds the export file for the current view. Exposed for tests. */
  buildExport(kind: 'csv' | 'json'): { filename: string; text: string; mime: string } | undefined {
    const result = this.result;
    const loc = this.router?.location;
    const data = this.data;
    if (!result || !loc || !data || result.tables.length === 0) return undefined;
    const primary = result.tables[0];
    if (!primary) return undefined;
    const window = dateWindow(loc.filters, data.asOf, data.earliest);
    if (kind === 'csv') {
      return { filename: exportFileName(`${result.title}-${primary.id}`, 'csv', window.to), text: toCsv(primary), mime: 'text/csv' };
    }
    const text = toJson(result.tables, {
      view: result.title,
      url: formatHash(loc.route, loc.filters),
      filters: describeFilters(loc.filters, window),
      dataThrough: data.asOf,
      exportedAt: new Date().toISOString(),
    });
    return { filename: exportFileName(result.title, 'json', window.to), text, mime: 'application/json' };
  }

  exportView(kind: 'csv' | 'json'): void {
    const file = this.buildExport(kind);
    if (file) download(this.doc, file.filename, file.text, file.mime);
  }
}

export function startApp(root: HTMLElement, options: ShellOptions = {}): AppShell {
  const shell = new AppShell(root, options);
  void shell.start();
  return shell;
}
