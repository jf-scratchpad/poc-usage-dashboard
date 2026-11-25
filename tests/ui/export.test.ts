import { describe, expect, it } from 'vitest';
import { csvCell, exportFileName, toCsv, toJson } from '../../src/ui/export';
import type { DataTable } from '../../src/ui/table';
import { formatCell } from '../../src/ui/table';
import { linearTrend } from '../../src/ui/stats';
import { sourceColor, sourceDash, withAlpha } from '../../src/ui/palette';

const table: DataTable = {
  id: 't',
  title: 'T',
  columns: [
    { key: 'name', label: 'Name' },
    { key: 'cost_usd', label: 'Spend', kind: 'usd' },
  ],
  rows: [
    ['Cody', 12.5],
    ['say "hi", ok', 1],
    ['=SUM(A1)', null],
  ],
};

describe('CSV export', () => {
  it('quotes commas and quotes, guards formulas, and blanks nulls', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('writes a header row and CRLF lines', () => {
    expect(toCsv(table)).toBe('Name,Spend\r\nCody,12.5\r\n"say ""hi"", ok",1\r\n\'=SUM(A1),\r\n');
  });
});

describe('JSON export', () => {
  it('writes rows as objects keyed by column, with metadata', () => {
    const out = JSON.parse(toJson([table], { view: 'Overview', url: '#/', filters: 'x', dataThrough: '2026-11-22', exportedAt: 'now' }));
    expect(out.view).toBe('Overview');
    expect(out.note).toMatch(/Fictional/);
    expect(out.tables[0].rows[0]).toEqual({ name: 'Cody', cost_usd: 12.5 });
    expect(out.tables[0].rows[2]).toEqual({ name: '=SUM(A1)', cost_usd: null });
  });

  it('builds safe file names', () => {
    expect(exportFileName('Assistant: Cody / Grok', 'csv', '2026-11-22')).toBe('usage-assistant-cody-grok-2026-11-22.csv');
  });
});

describe('formatting, trend, palette helpers', () => {
  it('formats cells by kind', () => {
    expect(formatCell(1234.5, 'usd')).toBe('$1,234.50');
    expect(formatCell(0.125, 'pct')).toBe('12.5%');
    expect(formatCell(null)).toBe('—');
  });
  it('fits a least-squares line', () => {
    const t = linearTrend([1, 2, 3, 4]);
    expect(t.slope).toBeCloseTo(1);
    expect(t.fitted).toEqual([1, 2, 3, 4]);
    expect(linearTrend([]).fitted).toEqual([]);
    expect(linearTrend([5]).fitted).toEqual([5]);
  });
  it('gives each source a distinct color and dash, and converts hex to rgba', () => {
    expect(new Set([sourceColor('grok-bot'), sourceColor('cursor'), sourceColor('azure')]).size).toBe(3);
    expect(sourceDash('grok-bot')).toEqual([]);
    expect(withAlpha('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });
});
