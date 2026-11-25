import { describe, expect, it } from 'vitest';
import grokSample from '../../data/sample/grok-bot-usage.json';
import { GROK_BOT_UNIT_TYPE, grokBotAdapter, parseGrokBotUsage } from '../../src/adapters/grok-bot';
import { UsageValidationError } from '../../src/schema/usage';

const ASSISTANTS = ['Archie', 'Cody', 'Gene', 'Miles', 'Penny', 'Rocky', 'Shelly'];

describe('parseGrokBotUsage', () => {
  const records = parseGrokBotUsage(grokSample);

  it('parses every sample entry into a validated grok-bot record', () => {
    expect(records.length).toBe(grokSample.entries.length);
    expect(records.every((r) => r.source === 'grok-bot')).toBe(true);
    expect(records.every((r) => r.unit_type === GROK_BOT_UNIT_TYPE)).toBe(true);
  });

  it('maps assistant and requests from the raw file', () => {
    const raw = grokSample.entries[0];
    expect(raw).toBeDefined();
    const rec = records.find((r) => r.date === raw!.date && r.assistant_or_project === raw!.assistant);
    expect(rec).toMatchObject({
      units: raw!.requests,
      cost_usd: raw!.cost_usd,
      assistant_or_project: raw!.assistant,
    });
  });

  it('covers the sample period, all seven assistants, and has variation', () => {
    const dates = records.map((r) => r.date);
    expect(dates[0]).toBe('2026-08-31');
    expect([...dates].sort().at(-1)).toBe('2026-11-22');
    expect(new Set(records.map((r) => r.assistant_or_project))).toEqual(new Set(ASSISTANTS));
    const costs = records.map((r) => r.cost_usd);
    expect(Math.max(...costs)).toBeGreaterThan(Math.min(...costs) * 2);
  });

  it('matches totals in the raw file', () => {
    const rawCost = grokSample.entries.reduce((s, e) => s + e.cost_usd, 0);
    const rawUnits = grokSample.entries.reduce((s, e) => s + e.requests, 0);
    expect(records.reduce((s, r) => s + r.cost_usd, 0)).toBeCloseTo(rawCost, 8);
    expect(records.reduce((s, r) => s + r.units, 0)).toBe(rawUnits);
  });
});

describe('parseGrokBotUsage: validation failures', () => {
  const base = {
    format: 'grok-bot-usage-export-v1',
    entries: [{ date: '2026-11-02', assistant: 'Cody', requests: 10, credits_consumed: 4, cost_usd: 0.5 }],
  };

  it('rejects a non-object export and a missing entries array', () => {
    expect(() => parseGrokBotUsage(null)).toThrow(UsageValidationError);
    expect(() => parseGrokBotUsage([])).toThrow(/expected an object/);
    expect(() => parseGrokBotUsage({})).toThrow(/entries array/);
    expect(() => parseGrokBotUsage({ entries: 'nope' })).toThrow(/entries array/);
  });

  it('rejects a bad date, empty assistant, and negative numbers', () => {
    const entry = base.entries[0]!;
    expect(() => parseGrokBotUsage({ entries: [{ ...entry, date: '2026-13-01' }] })).toThrow(/bad date/);
    expect(() => parseGrokBotUsage({ entries: [{ ...entry, assistant: '  ' }] })).toThrow(/assistant_or_project/);
    expect(() => parseGrokBotUsage({ entries: [{ ...entry, cost_usd: -1 }] })).toThrow(/cost_usd must not be negative/);
    expect(() => parseGrokBotUsage({ entries: [{ ...entry, requests: -3 }] })).toThrow(/units must not be negative/);
  });

  it('rejects a non-object entry and names the index', () => {
    expect(() => parseGrokBotUsage({ entries: [base.entries[0], 'bad'] })).toThrow(/entries\[1\]/);
  });
});

describe('grokBotAdapter', () => {
  it('loads the bundled sample under source grok-bot', async () => {
    expect(grokBotAdapter.source).toBe('grok-bot');
    const loaded = await grokBotAdapter.load();
    expect(loaded).toEqual(parseGrokBotUsage(grokSample));
  });
});
