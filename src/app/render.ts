import {
  SOURCES,
  filterBySources,
  topConsumers,
  totalSpend,
  totalsByAssistant,
  weekOverWeekTrend,
} from '../aggregate';
import type { Source, UsageRecord } from '../schema/usage';
import { DashboardCharts, ASSISTANT_CHART_CAP } from './charts';
import { SOURCE_LABELS, formatPct, formatUnitTypes, formatUnits, formatUsd, formatWeekRange } from './format';

export type RenderOptions = {
  /** Calendar day used for "this week" / "last week". YYYY-MM-DD. */
  asOf: string;
};

export type AppHandle = {
  getFilteredRecords(): UsageRecord[];
  getSelectedSources(): Source[];
  setSources(sources: readonly Source[]): void;
  destroy(): void;
};

const ALL_SOURCES: Source[] = [...SOURCES];
const TOP_N = 10;

export function renderApp(root: HTMLElement, records: readonly UsageRecord[], options: RenderOptions): AppHandle {
  root.replaceChildren();
  root.innerHTML = template();

  const form = must(root.querySelector<HTMLFormElement>('#source-filter'));
  const allBox = must(root.querySelector<HTMLInputElement>('#filter-all'));
  const sourceBoxes = ALL_SOURCES.map((src) => must(root.querySelector<HTMLInputElement>(`#filter-${src}`)));
  const emptyEl = must(root.querySelector<HTMLElement>('#empty-state'));
  const weekCanvas = must(root.querySelector<HTMLCanvasElement>('#week-chart'));
  const assistantCanvas = must(root.querySelector<HTMLCanvasElement>('#assistant-chart'));
  const tableBody = must(root.querySelector<HTMLTableSectionElement>('#top-consumers-body'));
  const assistantHeading = must(root.querySelector<HTMLElement>('#assistant-heading'));

  const charts = new DashboardCharts(weekCanvas, assistantCanvas);
  let selected: Source[] = [...ALL_SOURCES];

  const onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'filter-all') {
      selected = target.checked ? [...ALL_SOURCES] : [];
      syncBoxes();
    } else if (target.dataset.source) {
      selected = sourceBoxes.filter((box) => box.checked).map((box) => box.dataset.source as Source);
      allBox.checked = selected.length === ALL_SOURCES.length;
      allBox.indeterminate = selected.length > 0 && selected.length < ALL_SOURCES.length;
    }
    refresh();
  };

  form.addEventListener('change', onChange);
  syncBoxes();
  refresh();

  function syncBoxes(): void {
    allBox.checked = selected.length === ALL_SOURCES.length;
    allBox.indeterminate = selected.length > 0 && selected.length < ALL_SOURCES.length;
    for (const box of sourceBoxes) {
      box.checked = selected.includes(box.dataset.source as Source);
    }
  }

  function getFiltered(): UsageRecord[] {
    return filterBySources(records, selected);
  }

  function refresh(): void {
    const filtered = getFiltered();
    const wow = weekOverWeekTrend(filtered, options.asOf);
    const spend = totalSpend(filtered);
    const noData = filtered.length === 0;

    setText(root, '[data-total-spend]', formatUsd(spend));
    setText(root, '[data-this-week]', formatUsd(wow.thisWeekCost));
    setText(root, '[data-last-week]', formatUsd(wow.lastWeekCost));
    setText(root, '[data-this-week-range]', formatWeekRange(wow.thisWeekStart));
    setText(root, '[data-last-week-range]', formatWeekRange(wow.lastWeekStart));
    setWow(root, wow.deltaUsd, wow.deltaPct);

    const attr = must(root.querySelector('[data-total-spend]'));
    attr.setAttribute('data-total-spend', String(spend));
    must(root.querySelector('[data-this-week]')).setAttribute('data-this-week', String(wow.thisWeekCost));
    must(root.querySelector('[data-last-week]')).setAttribute('data-last-week', String(wow.lastWeekCost));

    emptyEl.hidden = !noData;
    emptyEl.textContent =
      records.length === 0
        ? 'No usage data yet. Collectors have not loaded any records.'
        : 'No usage data for the selected sources.';

    const weekPanel = must(root.querySelector('#week-panel'));
    const split = must(root.querySelector('#split-panels'));
    weekPanel.classList.toggle('is-empty', noData);
    split.classList.toggle('is-empty', noData);

    const allAssistants = totalsByAssistant(filtered);
    if (allAssistants.length > ASSISTANT_CHART_CAP) {
      assistantHeading.textContent = `Spend by assistant or project (top ${ASSISTANT_CHART_CAP})`;
    } else {
      assistantHeading.textContent = 'Spend by assistant or project';
    }

    charts.update(filtered, selected, options.asOf);
    renderTable(tableBody, topConsumers(filtered, TOP_N));
  }

  return {
    getFilteredRecords: getFiltered,
    getSelectedSources: () => [...selected],
    setSources(sources: readonly Source[]) {
      selected = ALL_SOURCES.filter((s) => sources.includes(s));
      syncBoxes();
      refresh();
    },
    destroy() {
      form.removeEventListener('change', onChange);
      charts.destroy();
      root.replaceChildren();
    },
  };
}

function renderTable(body: HTMLTableSectionElement, rows: ReturnType<typeof topConsumers>): void {
  body.replaceChildren();
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty-row';
    td.textContent = 'No consumers to rank.';
    tr.append(td);
    body.append(tr);
    return;
  }
  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    const rank = document.createElement('td');
    rank.className = 'num';
    rank.textContent = String(i + 1);
    const name = document.createElement('td');
    const nameText = document.createElement('span');
    nameText.className = 'consumer-name';
    nameText.textContent = row.assistant_or_project;
    const badge = document.createElement('span');
    badge.className = `source-badge source-${row.source}`;
    badge.textContent = SOURCE_LABELS[row.source];
    name.append(nameText, ' ', badge);
    const units = document.createElement('td');
    units.className = 'num';
    units.textContent = `${formatUnits(row.units)} ${formatUnitTypes(row.unit_types)}`;
    const cost = document.createElement('td');
    cost.className = 'num';
    cost.textContent = formatUsd(row.cost_usd);
    tr.append(rank, name, units, cost);
    body.append(tr);
  });
}

function setText(root: HTMLElement, selector: string, value: string): void {
  const el = root.querySelector(selector);
  if (el) el.textContent = value;
}

function setWow(root: HTMLElement, deltaUsd: number, deltaPct: number | null): void {
  const figure = must(root.querySelector('[data-wow]'));
  const hint = must(root.querySelector('[data-wow-hint]'));
  const sign = deltaUsd > 0 ? '+' : deltaUsd < 0 ? '−' : '';
  const abs = formatUsd(Math.abs(deltaUsd));
  figure.textContent = `${sign}${abs}`;
  figure.setAttribute('data-wow', String(deltaUsd));
  figure.classList.toggle('up', deltaUsd > 0);
  figure.classList.toggle('down', deltaUsd < 0);
  if (deltaPct === null) {
    hint.textContent = deltaUsd === 0 ? 'No change' : 'No spend last week to compare';
  } else {
    hint.textContent = `${formatPct(deltaPct)} vs last week`;
  }
}

function must<T extends Element>(el: T | null): T {
  if (!el) throw new Error('Dashboard markup is missing an expected element');
  return el;
}

function template(): string {
  const sourceBoxes = ALL_SOURCES.map(
    (src) => `
      <label class="check">
        <input type="checkbox" id="filter-${src}" data-source="${src}" checked />
        <span class="swatch source-${src}" aria-hidden="true"></span>
        ${SOURCE_LABELS[src]}
      </label>`,
  ).join('');

  return `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <p class="eyebrow">Usage trial</p>
      <h1>AI Usage &amp; Cost Dashboard</h1>
      <p class="lede">Spend and usage by assistant and by week, across Grok Bot, Cursor, and Azure.</p>
    </header>
    <main id="main">
      <form id="source-filter" class="filters" aria-label="Source filter">
        <fieldset>
          <legend>Sources</legend>
          <label class="check">
            <input type="checkbox" id="filter-all" checked />
            All sources
          </label>
          ${sourceBoxes}
        </fieldset>
      </form>
      <section class="tiles" aria-label="Summary">
        <article class="tile">
          <h2>Total spend</h2>
          <p class="figure" data-total-spend>$0.00</p>
          <p class="hint">All selected sources</p>
        </article>
        <article class="tile">
          <h2>This week</h2>
          <p class="figure" data-this-week>$0.00</p>
          <p class="hint" data-this-week-range></p>
        </article>
        <article class="tile">
          <h2>Last week</h2>
          <p class="figure" data-last-week>$0.00</p>
          <p class="hint" data-last-week-range></p>
        </article>
        <article class="tile">
          <h2>Week over week</h2>
          <p class="figure" data-wow>$0.00</p>
          <p class="hint" data-wow-hint></p>
        </article>
      </section>
      <p id="empty-state" class="empty-state" hidden></p>
      <section id="week-panel" class="panel">
        <h2>Spend by week</h2>
        <p class="panel-lead">One line per source, plus a dashed total. Weeks start on Monday.</p>
        <div class="chart-wrap">
          <canvas id="week-chart" width="960" height="360" role="img" aria-label="Line chart of weekly spend by source and in total"></canvas>
        </div>
      </section>
      <div id="split-panels" class="split">
        <section class="panel">
          <h2 id="assistant-heading">Spend by assistant or project</h2>
          <div class="chart-wrap chart-wrap-bar">
            <canvas id="assistant-chart" width="560" height="400" role="img" aria-label="Bar chart of spend by assistant or project"></canvas>
          </div>
        </section>
        <section class="panel">
          <h2>Top consumers</h2>
          <p class="panel-lead">Ranked by cost, with units consumed.</p>
          <div class="table-wrap">
            <table id="top-consumers">
              <caption class="visually-hidden">Top 10 consumers by cost</caption>
              <thead>
                <tr>
                  <th scope="col" class="num">Rank</th>
                  <th scope="col">Assistant or project</th>
                  <th scope="col" class="num">Units</th>
                  <th scope="col" class="num">Cost</th>
                </tr>
              </thead>
              <tbody id="top-consumers-body"></tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
    <footer class="site-footer">
      <p>Figures are from sample data only. No live accounts are connected.</p>
    </footer>
  `;
}
