/** CSV and JSON export of the current filtered view. Runs entirely in the browser. */
import type { Cell, DataTable } from './table';

/** RFC 4180 quoting, plus a guard against spreadsheet formula injection in text cells. */
export function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(table: DataTable): string {
  const lines = [table.columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of table.rows) lines.push(table.columns.map((_, i) => csvCell(row[i] ?? null)).join(','));
  return lines.join('\r\n') + '\r\n';
}

export type ExportMeta = {
  view: string;
  url: string;
  filters: string;
  dataThrough: string;
  exportedAt: string;
};

export function toJson(tables: readonly DataTable[], meta: ExportMeta): string {
  return (
    JSON.stringify(
      {
        note: 'Fictional sample data exported from the usage dashboard.',
        ...meta,
        tables: tables.map((t) => ({
          id: t.id,
          title: t.title,
          columns: t.columns.map((c) => c.key),
          rows: t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c.key, r[i] ?? null]))),
        })),
      },
      null,
      2,
    ) + '\n'
  );
}

export function exportFileName(view: string, ext: 'csv' | 'json', dataThrough: string): string {
  const slug = view.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'view';
  return `usage-${slug}-${dataThrough}.${ext}`;
}

/** Triggers a download via a Blob URL. Returns false where Blob URLs are unavailable. */
export function download(doc: Document, filename: string, text: string, mime: string): boolean {
  const url = doc.defaultView?.URL;
  if (!url?.createObjectURL) return false;
  const href = url.createObjectURL(new Blob([text], { type: mime }));
  const a = doc.createElement('a');
  a.href = href;
  a.download = filename;
  a.hidden = true;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => url.revokeObjectURL(href), 0);
  return true;
}
