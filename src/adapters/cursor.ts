/**
 * Cursor collector: maps an admin usage-event CSV into daily per-project UsageRecords.
 */
import type { UsageAdapter, UsageRecord } from '../schema/usage';
import { UsageValidationError, validateRecord } from '../schema/usage';
import { parseCsv, parseFiniteNumber, parseNonNegativeNumber, requiredField, requireColumns } from './csv';

// REAL DATA PLUGS IN HERE
// Today this adapter imports the fictional sample file
// data/sample/cursor-usage.csv via a Vite `?raw` import (bundled at build time;
// no filesystem access at runtime). A production collector would replace that
// import with a Cursor admin / dashboard usage export for the desired period
// (team usage CSV, or the Cursor admin usage API written out as CSV or an
// equivalent table of daily per-project events) and pass the text to
// parseCursorUsage(). Do not add credentials or network calls in this trial;
// a live collector would run outside this static site and write a file the
// build can import.
import cursorSample from '../../data/sample/cursor-usage.csv?raw';

export const CURSOR_UNIT_TYPE = 'requests';

const REQUIRED_COLUMNS = [
  'date',
  'project',
  'kind',
  'model',
  'requests',
  'input_tokens',
  'output_tokens',
  'cost_usd',
] as const;

type Bucket = { date: string; assistant_or_project: string; units: number; cost_usd: number };

export function parseCursorUsage(csvText: string): UsageRecord[] {
  if (typeof csvText !== 'string') {
    throw new UsageValidationError('Cursor export: expected CSV text');
  }
  const table = parseCsv(csvText);
  requireColumns(table.headers, REQUIRED_COLUMNS);

  const buckets = new Map<string, Bucket>();
  table.rows.forEach((row, i) => {
    const where = `Cursor row ${i + 1}`;
    const date = requiredField(row, 'date', where);
    const project = requiredField(row, 'project', where);
    const requests = parseNonNegativeNumber(requiredField(row, 'requests', where), 'requests', where);
    const cost = parseNonNegativeNumber(requiredField(row, 'cost_usd', where), 'cost_usd', where);
    // kind, model, and token columns are part of the native shape and are
    // accepted here, then rolled up: one UsageRecord per day × project.
    requiredField(row, 'kind', where);
    requiredField(row, 'model', where);
    parseFiniteNumber(requiredField(row, 'input_tokens', where), 'input_tokens', where);
    parseFiniteNumber(requiredField(row, 'output_tokens', where), 'output_tokens', where);

    const key = `${date}\0${project}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.units += requests;
      existing.cost_usd += cost;
    } else {
      buckets.set(key, { date, assistant_or_project: project, units: requests, cost_usd: cost });
    }
  });

  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.assistant_or_project.localeCompare(b.assistant_or_project))
    .map((b, i) =>
      validateRecord(
        {
          date: b.date,
          source: 'cursor',
          assistant_or_project: b.assistant_or_project,
          units: b.units,
          unit_type: CURSOR_UNIT_TYPE,
          cost_usd: b.cost_usd,
        },
        i,
      ),
    );
}

export const cursorAdapter: UsageAdapter = {
  source: 'cursor',
  async load(): Promise<UsageRecord[]> {
    return parseCursorUsage(cursorSample);
  },
};
