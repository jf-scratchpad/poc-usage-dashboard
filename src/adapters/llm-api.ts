/**
 * LLM API collector (4th source, added in v2 to prove the registry): maps a
 * vendor-neutral, per-day × assistant × model token CSV into UsageRecords.
 */
import type { UsageAdapter, UsageRecord } from '../schema/usage';
import { UsageValidationError, validateRecord } from '../schema/usage';
import { parseCsv, parseNonNegativeNumber, requiredField, requireColumns } from './csv';

// REAL DATA PLUGS IN HERE
// Today this adapter imports the fictional sample file
// data/sample/llm-api-usage.csv via a Vite `?raw` import (bundled at build
// time; no filesystem access at runtime). A production collector would replace
// that import with a model provider's usage/billing export for the period,
// written out as CSV in this shape (date, assistant, model, input_tokens,
// output_tokens, cost_usd), and pass the text to parseLlmApiUsage(). Do not
// add credentials or network calls in this repo; a live collector would run
// outside this static site and write a file the build can import.
import llmApiSample from '../../data/sample/llm-api-usage.csv?raw';

export const LLM_API_UNIT_TYPE = 'tokens';

const REQUIRED_COLUMNS = ['date', 'assistant', 'model', 'input_tokens', 'output_tokens', 'cost_usd'] as const;

type Bucket = { date: string; assistant_or_project: string; units: number; cost_usd: number };

/** Rolls model rows up to one record per day × assistant; units = input + output tokens. */
export function parseLlmApiUsage(csvText: string): UsageRecord[] {
  if (typeof csvText !== 'string') {
    throw new UsageValidationError('LLM API export: expected CSV text');
  }
  const table = parseCsv(csvText);
  requireColumns(table.headers, REQUIRED_COLUMNS);

  const buckets = new Map<string, Bucket>();
  table.rows.forEach((row, i) => {
    const where = `LLM API row ${i + 1}`;
    const date = requiredField(row, 'date', where);
    const assistant = requiredField(row, 'assistant', where);
    requiredField(row, 'model', where);
    const input = parseNonNegativeNumber(requiredField(row, 'input_tokens', where), 'input_tokens', where);
    const output = parseNonNegativeNumber(requiredField(row, 'output_tokens', where), 'output_tokens', where);
    const cost = parseNonNegativeNumber(requiredField(row, 'cost_usd', where), 'cost_usd', where);

    const key = `${date}\0${assistant}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.units += input + output;
      existing.cost_usd += cost;
    } else {
      buckets.set(key, { date, assistant_or_project: assistant, units: input + output, cost_usd: cost });
    }
  });

  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.assistant_or_project.localeCompare(b.assistant_or_project))
    .map((b, i) =>
      validateRecord(
        {
          date: b.date,
          source: 'llm-api',
          assistant_or_project: b.assistant_or_project,
          units: b.units,
          unit_type: LLM_API_UNIT_TYPE,
          cost_usd: b.cost_usd,
        },
        i,
      ),
    );
}

export const llmApiAdapter: UsageAdapter = {
  source: 'llm-api',
  async load(): Promise<UsageRecord[]> {
    return parseLlmApiUsage(llmApiSample);
  },
};
