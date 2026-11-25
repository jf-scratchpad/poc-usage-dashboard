/**
 * Small CSV helper for the Cursor and Azure sample exports.
 * Keeps us on the approved stack with no extra dependency.
 *
 * Supports quoted fields, escaped quotes, CRLF, a leading BOM, and `#` comment
 * lines (used in the sample files to mark the data as fictional).
 */
import { UsageValidationError } from '../schema/usage';

export type CsvTable = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsv(text: string): CsvTable {
  const records = splitCsvRecords(text);
  const headerRow = records[0];
  if (!headerRow || headerRow.length === 0) {
    throw new UsageValidationError('CSV is missing a header row');
  }
  const headers = headerRow.map((h) => h.trim());
  if (headers.some((h) => h === '')) {
    throw new UsageValidationError('CSV header contains an empty column name');
  }
  const seen = new Set<string>();
  for (const h of headers) {
    if (seen.has(h)) {
      throw new UsageValidationError(`CSV header has a duplicate column ${JSON.stringify(h)}`);
    }
    seen.add(h);
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    if (record.length === 1 && (record[0] ?? '') === '') continue;
    if (record.length !== headers.length) {
      throw new UsageValidationError(
        `CSV row ${i}: expected ${headers.length} columns, got ${record.length}`,
      );
    }
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const name = headers[c];
      if (name === undefined) continue;
      row[name] = record[c] ?? '';
    }
    rows.push(row);
  }
  return { headers, rows };
}

function splitCsvRecords(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  let lineHasContent = false;

  const pushRow = (): void => {
    const isBlank = row.length === 0 || (row.length === 1 && (row[0] ?? '').trim() === '');
    const first = (row[0] ?? '').trimStart();
    const isComment = !inQuotes && first.startsWith('#');
    if (!isBlank && !isComment) records.push(row);
    row = [];
    field = '';
    lineHasContent = false;
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      lineHasContent = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      lineHasContent = true;
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    lineHasContent = true;
    i += 1;
  }

  if (inQuotes) {
    throw new UsageValidationError('CSV ends inside a quoted field');
  }
  if (lineHasContent || row.length > 0) {
    row.push(field);
    pushRow();
  }
  return records;
}

export function requiredField(row: Record<string, string>, name: string, where: string): string {
  if (!(name in row)) {
    throw new UsageValidationError(`${where}: missing column ${name}`);
  }
  return (row[name] ?? '').trim();
}

export function parseFiniteNumber(raw: string, field: string, where: string): number {
  if (raw.trim() === '') {
    throw new UsageValidationError(`${where}: ${field} is empty`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new UsageValidationError(`${where}: ${field} must be a finite number, got ${JSON.stringify(raw)}`);
  }
  return n;
}

export function parseNonNegativeNumber(raw: string, field: string, where: string): number {
  const n = parseFiniteNumber(raw, field, where);
  if (n < 0) {
    throw new UsageValidationError(`${where}: ${field} must not be negative, got ${n}`);
  }
  return n;
}

export function requireColumns(headers: string[], names: readonly string[]): void {
  const have = new Set(headers);
  const missing = names.filter((n) => !have.has(n));
  if (missing.length > 0) {
    throw new UsageValidationError(`CSV is missing required column(s): ${missing.join(', ')}`);
  }
}
