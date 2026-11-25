import { describe, expect, it } from 'vitest';
import { azureAdapter, cursorAdapter, grokBotAdapter, llmApiAdapter, loadAllUsage } from '../../src/adapters/index';
import { SOURCES, validateRecords } from '../../src/schema/usage';

describe('loadAllUsage', () => {
  it('combines every adapter and matches per-source totals', async () => {
    const [all, grok, cursor, azure, llm] = await Promise.all([
      loadAllUsage(),
      grokBotAdapter.load(),
      cursorAdapter.load(),
      azureAdapter.load(),
      llmApiAdapter.load(),
    ]);

    expect(validateRecords(all)).toEqual(all);
    expect(all).toHaveLength(grok.length + cursor.length + azure.length + llm.length);

    const bySource = {
      'grok-bot': all.filter((r) => r.source === 'grok-bot'),
      cursor: all.filter((r) => r.source === 'cursor'),
      azure: all.filter((r) => r.source === 'azure'),
      'llm-api': all.filter((r) => r.source === 'llm-api'),
    };
    expect(bySource['grok-bot']).toEqual(grok);
    expect(bySource.cursor).toEqual(cursor);
    expect(bySource.azure).toEqual(azure);
    expect(bySource['llm-api']).toEqual(llm);

    for (const source of SOURCES) {
      const raw = bySource[source];
      const cost = raw.reduce((s, r) => s + r.cost_usd, 0);
      expect(cost, source).toBeGreaterThan(0);
    }
  });

  it('stays inside the sample window and includes each source', async () => {
    const all = await loadAllUsage();
    const dates = all.map((r) => r.date).sort();
    expect(dates[0]).toBe('2026-08-31');
    expect(dates.at(-1)).toBe('2026-11-22');
    expect(new Set(all.map((r) => r.source))).toEqual(new Set(SOURCES));
  });
});
