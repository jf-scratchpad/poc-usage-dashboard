import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assistantWeekly,
  costByAssistantAcrossSources,
  multiSourceAssistants,
  unitEconomics,
  unitEconomicsBySource,
} from '../src/allocation';
import { parseDataset } from '../src/data/manifest';
import type { UsageRecord } from '../src/schema/usage';

const r = (over: Partial<UsageRecord>): UsageRecord => ({
  date: '2026-11-02',
  source: 'grok-bot',
  assistant_or_project: 'Cody',
  units: 10,
  unit_type: 'requests',
  cost_usd: 1,
  ...over,
});

describe('costByAssistantAcrossSources', () => {
  const rs = [
    r({ cost_usd: 3 }),
    r({ source: 'llm-api', assistant_or_project: 'cody', unit_type: 'tokens', units: 5000, cost_usd: 5 }),
    r({ source: 'cursor', assistant_or_project: 'ai-core', cost_usd: 2 }),
  ];

  it('merges names case-insensitively across sources with a breakdown and share', () => {
    const [cody, core] = costByAssistantAcrossSources(rs);
    expect(cody).toMatchObject({ assistant: 'Cody', key: 'cody', total_cost_usd: 8, sources: ['grok-bot', 'llm-api'] });
    expect(cody?.share_pct).toBeCloseTo(80, 12);
    expect(cody?.bySource).toEqual({ 'grok-bot': 3, cursor: 0, azure: 0, 'llm-api': 5 });
    expect(cody?.unitsByType).toEqual({ requests: 10, tokens: 5000 });
    expect(core?.share_pct).toBeCloseTo(20, 12);
  });

  it('multiSourceAssistants keeps only cross-source names; empty input is safe', () => {
    expect(multiSourceAssistants(rs).map((a) => a.key)).toEqual(['cody']);
    expect(costByAssistantAcrossSources([])).toEqual([]);
  });
});

describe('unitEconomics', () => {
  it('cost per unit and per 1k, never mixing unit types', () => {
    const rows = unitEconomics([
      r({ units: 100, cost_usd: 2 }),
      r({ units: 300, cost_usd: 4 }),
      r({ source: 'llm-api', unit_type: 'tokens', units: 2_000_000, cost_usd: 12 }),
      r({ assistant_or_project: 'Idle', units: 0, cost_usd: 0.5 }),
    ]);
    expect(rows.map((x) => `${x.source}/${x.assistant_or_project}`)).toEqual(['llm-api/Cody', 'grok-bot/Cody', 'grok-bot/Idle']);
    expect(rows[0]).toMatchObject({ units: 2_000_000, cost_per_unit: 0.000006 });
    expect(rows[0]?.cost_per_1k_units).toBeCloseTo(0.006, 12);
    expect(rows[1]).toMatchObject({ units: 400, cost_usd: 6, cost_per_unit: 0.015 });
    expect(rows[2]).toMatchObject({ cost_per_unit: null, cost_per_1k_units: null });
  });

  it('by source, in SOURCES order', () => {
    const rows = unitEconomicsBySource([r({ source: 'azure', unit_type: 'USD', units: 5, cost_usd: 5 }), r({ units: 4, cost_usd: 2 })]);
    expect(rows.map((x) => x.source)).toEqual(['grok-bot', 'azure']);
    expect(rows[1]?.cost_per_unit).toBe(1);
  });
});

describe('assistantWeekly', () => {
  it('zero-fills the whole data range for one assistant', () => {
    const rs = [r({ date: '2026-11-02', cost_usd: 2 }), r({ date: '2026-11-16', assistant_or_project: 'Other' }), r({ date: '2026-11-09', source: 'llm-api', assistant_or_project: 'CODY', unit_type: 'tokens', cost_usd: 4 })];
    const w = assistantWeekly(rs, 'cody');
    expect(w.map((x) => [x.weekStart, x.total])).toEqual([
      ['2026-11-02', 2],
      ['2026-11-09', 4],
      ['2026-11-16', 0],
    ]);
    expect(w[1]?.bySource['llm-api']).toBe(4);
    expect(assistantWeekly(rs, 'nobody')).toEqual([]);
  });
});

describe('sample data allocation', () => {
  const records = parseDataset(JSON.parse(readFileSync('public/data/usage.v1.json', 'utf8')));

  it('shares sum to 100% and totals match the dataset', () => {
    const rows = costByAssistantAcrossSources(records);
    const total = records.reduce((s, x) => s + x.cost_usd, 0);
    expect(rows.reduce((s, x) => s + x.total_cost_usd, 0)).toBeCloseTo(total, 6);
    expect(rows.reduce((s, x) => s + x.share_pct, 0)).toBeCloseTo(100, 6);
  });

  it('Cody, Archie, and Rocky span Grok Bot + LLM API; ai-core spans Cursor + Azure', () => {
    const multi = new Map(multiSourceAssistants(records).map((a) => [a.key, a.sources]));
    expect(multi.get('cody')).toEqual(['grok-bot', 'llm-api']);
    expect(multi.get('archie')).toEqual(['grok-bot', 'llm-api']);
    expect(multi.get('rocky')).toEqual(['grok-bot', 'llm-api']);
    expect(multi.get('ai-core')).toEqual(['cursor', 'azure']);
  });

  it('LLM API tokens cost a fraction of a cent per 1k; Azure USD units cost exactly $1', () => {
    const bySrc = unitEconomicsBySource(records);
    const llm = bySrc.find((x) => x.source === 'llm-api');
    expect(llm?.cost_per_1k_units).toBeGreaterThan(0);
    expect(llm?.cost_per_1k_units).toBeLessThan(0.01);
    expect(bySrc.find((x) => x.source === 'azure')?.cost_per_unit).toBeCloseTo(1, 6);
  });
});
