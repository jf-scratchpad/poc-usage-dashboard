import { describe, expect, it } from 'vitest';
import { CollectError, collectFromAdapters, formatIssues, normalizeBatches, recordKey } from '../../src/data/pipeline';
import type { UsageAdapter, UsageRecord } from '../../src/schema/usage';

const rec = (over: Partial<UsageRecord> = {}): UsageRecord => ({
  date: '2026-09-01',
  source: 'cursor',
  assistant_or_project: 'ai-core',
  units: 10,
  unit_type: 'requests',
  cost_usd: 1.5,
  ...over,
});

describe('normalizeBatches', () => {
  it('drops exact duplicates and counts them', () => {
    const r = normalizeBatches([{ source: 'cursor', records: [rec(), rec(), rec({ date: '2026-09-02' })] }]);
    expect(r.records).toHaveLength(2);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.errors).toEqual([]);
  });

  it('treats float noise below a micro-dollar as the same value', () => {
    const r = normalizeBatches([{ source: 'cursor', records: [rec({ cost_usd: 0.1 + 0.2 }), rec({ cost_usd: 0.3 })] }]);
    expect(r.duplicatesRemoved).toBe(1);
  });

  it('reports conflicting duplicates with both positions', () => {
    const r = normalizeBatches([{ source: 'cursor', records: [rec(), rec({ cost_usd: 9 })] }]);
    expect(r.records).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toMatch(/conflicting duplicate of cursor record\[0\]/);
    expect(r.errors[0]?.index).toBe(1);
  });

  it('keeps rows that differ only by unit type or assistant', () => {
    const r = normalizeBatches([
      { source: 'cursor', records: [rec(), rec({ unit_type: 'tokens' }), rec({ assistant_or_project: 'other' })] },
    ]);
    expect(r.records).toHaveLength(3);
  });

  it('collects every validation error with source, index, and row context', () => {
    const r = normalizeBatches([
      { source: 'cursor', records: [rec(), { ...rec(), date: '2026-13-01' }, { ...rec(), cost_usd: -1 }] },
      { source: 'azure', records: 'nope' },
    ]);
    expect(r.records).toHaveLength(1);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toMatchObject({ source: 'cursor', index: 1 });
    expect(r.errors[0]?.message).toMatch(/bad date/);
    expect(r.errors[0]?.row).toContain('2026-13-01');
    expect(r.errors[1]?.message).toMatch(/cost_usd must not be negative/);
    expect(r.errors[2]).toMatchObject({ source: 'azure', index: null });
    const text = formatIssues(r.errors);
    expect(text).toContain('[cursor #1]');
    expect(text).toContain('row: {');
  });

  it('rejects a record whose source does not match its adapter', () => {
    const r = normalizeBatches([{ source: 'azure', records: [rec()] }]);
    expect(r.errors[0]?.message).toMatch(/does not match adapter azure/);
  });

  it('truncates long row snippets', () => {
    const r = normalizeBatches([{ source: 'cursor', records: [{ ...rec(), units: -1, junk: 'x'.repeat(500) }] }]);
    expect(r.errors[0]?.row?.length).toBeLessThanOrEqual(160);
  });

  it('sorts by date, source, assistant', () => {
    const r = normalizeBatches([
      { source: 'cursor', records: [rec({ date: '2026-09-03' }), rec({ assistant_or_project: 'b' }), rec({ assistant_or_project: 'a' })] },
      { source: 'azure', records: [rec({ source: 'azure', unit_type: 'USD' })] },
    ]);
    expect(r.records.map((x) => `${x.date}/${x.source}/${x.assistant_or_project}`)).toEqual([
      '2026-09-01/azure/ai-core',
      '2026-09-01/cursor/a',
      '2026-09-01/cursor/b',
      '2026-09-03/cursor/ai-core',
    ]);
  });

  it('recordKey ignores values', () => {
    expect(recordKey(rec())).toBe(recordKey(rec({ cost_usd: 99, units: 1 })));
  });
});

describe('collectFromAdapters', () => {
  const adapter = (source: UsageAdapter['source'], load: () => Promise<UsageRecord[]>): UsageAdapter => ({ source, load });

  it('returns normalized records when everything is valid', async () => {
    const r = await collectFromAdapters([adapter('cursor', async () => [rec(), rec()])]);
    expect(r.records).toHaveLength(1);
    expect(r.duplicatesRemoved).toBe(1);
  });

  it('throws CollectError listing load failures and bad rows together', async () => {
    const bad = adapter('azure', async () => {
      throw new Error('export missing');
    });
    const worse = adapter('cursor', async () => [{ ...rec(), units: Number.NaN }]);
    const err = await collectFromAdapters([bad, worse]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CollectError);
    const ce = err as CollectError;
    expect(ce.issues).toHaveLength(2);
    expect(ce.message).toMatch(/2 issue\(s\)/);
    expect(ce.message).toContain('[azure] export missing');
    expect(ce.message).toContain('[cursor #0]');
  });
});
