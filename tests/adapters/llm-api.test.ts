import { describe, expect, it } from 'vitest';
import { LLM_API_UNIT_TYPE, llmApiAdapter, parseLlmApiUsage } from '../../src/adapters/llm-api';
import { UsageValidationError, validateRecords } from '../../src/schema/usage';

const HEADER = 'date,assistant,model,input_tokens,output_tokens,cost_usd';

describe('parseLlmApiUsage', () => {
  it('rolls models up to one record per day x assistant, units = input + output tokens', () => {
    const csv = [
      '# fictional',
      HEADER,
      '2026-09-01,Cody,model-large-sample,1000,200,0.006',
      '2026-09-01,Cody,model-small-sample,500,100,0.0005',
      '2026-09-01,Archie,model-small-sample,10,5,0.00001',
    ].join('\n');
    const rs = parseLlmApiUsage(csv);
    expect(rs).toHaveLength(2);
    expect(rs[0]).toEqual({
      date: '2026-09-01',
      source: 'llm-api',
      assistant_or_project: 'Archie',
      units: 15,
      unit_type: LLM_API_UNIT_TYPE,
      cost_usd: 0.00001,
    });
    expect(rs[1]?.assistant_or_project).toBe('Cody');
    expect(rs[1]?.units).toBe(1800);
    expect(rs[1]?.cost_usd).toBeCloseTo(0.0065, 10);
  });

  it('names the row when a value is bad', () => {
    const csv = [HEADER, '2026-09-01,Cody,m,1,1,0.1', '2026-09-02,Cody,m,-3,1,0.1'].join('\n');
    expect(() => parseLlmApiUsage(csv)).toThrow(/LLM API row 2.*input_tokens/);
  });

  it('rejects a missing column', () => {
    expect(() => parseLlmApiUsage('date,assistant,model\n2026-09-01,Cody,m')).toThrow(UsageValidationError);
  });

  it('rejects an impossible date', () => {
    expect(() => parseLlmApiUsage(`${HEADER}\n2026-02-30,Cody,m,1,1,0.1`)).toThrow(/bad date/);
  });

  it('rejects non-text input', () => {
    expect(() => parseLlmApiUsage(42 as unknown as string)).toThrow(/expected CSV text/);
  });
});

describe('llmApiAdapter (bundled fictional sample)', () => {
  it('loads valid records covering the 12-week sample window', async () => {
    const rs = await llmApiAdapter.load();
    expect(validateRecords(rs)).toEqual(rs);
    const dates = rs.map((r) => r.date).sort();
    expect(dates[0]).toBe('2026-08-31');
    expect(dates.at(-1)).toBe('2026-11-22');
    expect(new Set(rs.map((r) => r.assistant_or_project))).toEqual(new Set(['Archie', 'Cody', 'Rocky', 'batch-evals']));
    expect(rs.every((r) => r.unit_type === 'tokens')).toBe(true);
  });

  it('contains the invented late-October batch-evals spike', async () => {
    const rs = await llmApiAdapter.load();
    const evals = rs.filter((r) => r.assistant_or_project === 'batch-evals');
    const spike = evals.filter((r) => r.date >= '2026-10-26' && r.date <= '2026-10-30');
    const before = evals.filter((r) => r.date >= '2026-10-19' && r.date <= '2026-10-23');
    const sum = (xs: typeof rs) => xs.reduce((s, r) => s + r.cost_usd, 0);
    expect(sum(spike)).toBeGreaterThan(3 * sum(before));
  });
});
