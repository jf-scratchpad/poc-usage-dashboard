/**
 * Tabular data behind every chart. Each chart has a <table> fallback (inside a
 * <details>) so the numbers are available to screen readers, keyboard users,
 * print, and export.
 */
import { formatUnits, formatUsd } from '../app/format';
import { h } from './dom';

export type Cell = string | number | null;
export type ColumnKind = 'text' | 'usd' | 'number' | 'pct' | 'date';
export type Column = { key: string; label: string; kind?: ColumnKind };

export type DataTable = {
  id: string;
  title: string;
  columns: Column[];
  rows: Cell[][];
};

const PCT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

export function formatCell(value: Cell, kind: ColumnKind = 'text'): string {
  if (value === null || value === '') return '—';
  if (typeof value === 'string') return value;
  switch (kind) {
    case 'usd':
      return formatUsd(value);
    case 'number':
      return formatUnits(value);
    case 'pct':
      return PCT.format(value);
    default:
      return String(value);
  }
}

export type TableOptions = {
  /** Return an href to render a cell as a link (e.g. drill-down). */
  linkFor?: (row: Cell[], colIndex: number) => string | undefined;
  caption?: string;
  className?: string;
};

export function renderTable(table: DataTable, options: TableOptions = {}): HTMLTableElement {
  const t = h('table', { class: options.className ?? 'data-table', 'data-table': table.id });
  if (options.caption) t.append(h('caption', {}, options.caption));
  const head = h('tr');
  for (const col of table.columns) {
    head.append(h('th', { scope: 'col', class: col.kind && col.kind !== 'text' ? 'num' : undefined }, col.label));
  }
  t.append(h('thead', {}, head));
  const body = h('tbody');
  for (const row of table.rows) {
    const tr = h('tr');
    table.columns.forEach((col, i) => {
      const value = row[i] ?? null;
      const text = formatCell(value, col.kind);
      const href = options.linkFor?.(row, i);
      const content = href ? h('a', { href }, text) : text;
      const numeric = col.kind && col.kind !== 'text';
      tr.append(i === 0 ? h('th', { scope: 'row', class: numeric ? 'num' : undefined }, content) : h('td', { class: numeric ? 'num' : undefined }, content));
    });
    body.append(tr);
  }
  t.append(body);
  return t;
}
