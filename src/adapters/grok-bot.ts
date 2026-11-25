/**
 * Grok Bot collector: maps a per-assistant usage export into UsageRecords.
 */
import type { UsageAdapter, UsageRecord } from '../schema/usage';
import { UsageValidationError, validateRecord } from '../schema/usage';

// REAL DATA PLUGS IN HERE
// Today this adapter imports the fictional sample file
// data/sample/grok-bot-usage.json (bundled at build time; no filesystem access
// at runtime). A production collector would replace that import with a Grok Bot
// plan usage export for the desired period — a per-assistant / per-bot download
// or official usage export in this JSON shape (or a thin mapping into it) —
// then pass the parsed object to parseGrokBotUsage(). Do not add credentials
// or network calls in this trial; a live collector would run outside this
// static site and write a file the build can import.
import grokSample from '../../data/sample/grok-bot-usage.json';

export const GROK_BOT_UNIT_TYPE = 'requests';

export function parseGrokBotUsage(raw: unknown): UsageRecord[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UsageValidationError('Grok Bot export: expected an object');
  }
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.entries)) {
    throw new UsageValidationError('Grok Bot export: expected an entries array');
  }
  return doc.entries.map((entry, i) => mapEntry(entry, i));
}

function mapEntry(entry: unknown, index: number): UsageRecord {
  const where = `Grok Bot entries[${index}]`;
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new UsageValidationError(`${where}: expected an object`);
  }
  const o = entry as Record<string, unknown>;
  if (typeof o.assistant !== 'string') {
    throw new UsageValidationError(`${where}: assistant must be a string`);
  }
  if (typeof o.requests !== 'number') {
    throw new UsageValidationError(`${where}: requests must be a number`);
  }
  if (typeof o.cost_usd !== 'number') {
    throw new UsageValidationError(`${where}: cost_usd must be a number`);
  }
  if (typeof o.date !== 'string') {
    throw new UsageValidationError(`${where}: date must be a string`);
  }
  return validateRecord(
    {
      date: o.date,
      source: 'grok-bot',
      assistant_or_project: o.assistant,
      units: o.requests,
      unit_type: GROK_BOT_UNIT_TYPE,
      cost_usd: o.cost_usd,
    },
    index,
  );
}

export const grokBotAdapter: UsageAdapter = {
  source: 'grok-bot',
  async load(): Promise<UsageRecord[]> {
    return parseGrokBotUsage(grokSample);
  },
};
