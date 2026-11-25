import { describe, expect, it } from 'vitest';
import azureSample from '../../data/sample/azure-cost-management.csv?raw';
import { parseCsv } from '../../src/adapters/csv';
import { AZURE_UNIT_TYPE, azureAdapter, parseAzureCostExport, parseAzureDate } from '../../src/adapters/azure';
import { UsageValidationError } from '../../src/schema/usage';

const HEADER =
  'Date,SubscriptionId,SubscriptionName,ResourceGroup,ResourceId,ResourceLocation,ServiceName,MeterCategory,MeterName,Tags,Quantity,UnitOfMeasure,PreTaxCost,Currency';

const SUB = '00000000-0000-0000-0000-000000000000';

function line(opts: {
  date?: string;
  rg?: string;
  tags?: string;
  quantity?: string;
  cost?: string;
  currency?: string;
  service?: string;
}): string {
  const date = opts.date ?? '2026-11-02';
  const rg = opts.rg ?? 'rg-sample-ai';
  const tags = opts.tags ?? '{"project":"ai-core","environment":"sample"}';
  const quantity = opts.quantity ?? '1.0000';
  const cost = opts.cost ?? '2.5000';
  const currency = opts.currency ?? 'USD';
  const service = opts.service ?? 'Storage';
  const quotedTags = `"${tags.replace(/"/g, '""')}"`;
  return [
    date,
    SUB,
    'sample-subscription-not-real',
    rg,
    `/subscriptions/${SUB}/resourceGroups/${rg}/providers/Microsoft.Storage/storageAccounts/stsample`,
    'eastus',
    service,
    'Storage',
    'LRS Data Stored',
    quotedTags,
    quantity,
    'GB',
    cost,
    currency,
  ].join(',');
}

describe('parseAzureCostExport', () => {
  const records = parseAzureCostExport(azureSample);
  const lines = parseCsv(azureSample).rows.map((row) => {
    const tags = JSON.parse(row.Tags ?? '{}') as { project?: string };
    return {
      date: row.Date ?? '',
      project: tags.project ?? row.ResourceGroup ?? '',
      cost: Number(row.PreTaxCost),
    };
  });

  it('rolls line items up to one record per day and project', () => {
    expect(records.every((r) => r.source === 'azure')).toBe(true);
    expect(records.every((r) => r.unit_type === AZURE_UNIT_TYPE)).toBe(true);
    const expectedKeys = new Set(lines.map((e) => `${e.date}\0${e.project}`));
    expect(records.length).toBe(expectedKeys.size);
    expect(records.length).toBeLessThan(lines.length);
  });

  it('matches PreTaxCost totals in the raw file, with units equal to cost', () => {
    const rawCost = lines.reduce((s, e) => s + e.cost, 0);
    const cost = records.reduce((s, r) => s + r.cost_usd, 0);
    const units = records.reduce((s, r) => s + r.units, 0);
    expect(cost).toBeCloseTo(rawCost, 8);
    expect(units).toBeCloseTo(rawCost, 8);
  });

  it('covers the sample period and expected projects', () => {
    const dates = records.map((r) => r.date).sort();
    expect(dates[0]).toBe('2026-08-31');
    expect(dates.at(-1)).toBe('2026-11-22');
    expect(new Set(records.map((r) => r.assistant_or_project))).toEqual(
      new Set(['ai-core', 'macos-gitops', 'arch-notes', 'terraform-platform', 'shared-platform']),
    );
  });

  it('sums two meters for the same day and project', () => {
    const csv = [HEADER, line({ service: 'Storage', cost: '1.2500' }), line({ service: 'Monitor', cost: '3.0000' })].join(
      '\n',
    );
    const recs = parseAzureCostExport(csv);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      date: '2026-11-02',
      source: 'azure',
      assistant_or_project: 'ai-core',
      units: 4.25,
      unit_type: 'USD',
      cost_usd: 4.25,
    });
  });

  it('falls back to ResourceGroup when Tags has no project', () => {
    const csv = `${HEADER}\n${line({ tags: '{"environment":"sample"}', rg: 'rg-sample-fallback' })}\n`;
    expect(parseAzureCostExport(csv)[0]?.assistant_or_project).toBe('rg-sample-fallback');
  });

  it('accepts a compact yyyyMMdd UsageDate', () => {
    const csv = `${HEADER}\n${line({ date: '20261102' })}\n`;
    expect(parseAzureCostExport(csv)[0]?.date).toBe('2026-11-02');
  });
});

describe('parseAzureDate', () => {
  it('accepts both forms and rejects an invalid day', () => {
    expect(parseAzureDate('2026-11-02', 't')).toBe('2026-11-02');
    expect(parseAzureDate('20261102', 't')).toBe('2026-11-02');
    expect(() => parseAzureDate('2026-13-01', 't')).toThrow(/bad date/);
    expect(() => parseAzureDate('11/02/2026', 't')).toThrow(/bad date/);
  });
});

describe('parseAzureCostExport: validation failures', () => {
  it('rejects a non-USD currency', () => {
    expect(() => parseAzureCostExport(`${HEADER}\n${line({ currency: 'EUR' })}\n`)).toThrow(/is not USD/);
  });

  it('rejects a bad date, negative cost, and invalid Tags JSON', () => {
    expect(() => parseAzureCostExport(`${HEADER}\n${line({ date: '2026-13-01' })}\n`)).toThrow(/bad date/);
    expect(() => parseAzureCostExport(`${HEADER}\n${line({ cost: '-1.00' })}\n`)).toThrow(/PreTaxCost must not be negative/);
    expect(() => parseAzureCostExport(`${HEADER}\n${line({ tags: 'not-json' })}\n`)).toThrow(/Tags is not valid JSON/);
  });

  it('rejects empty Tags and ResourceGroup, and a missing column', () => {
    expect(() => parseAzureCostExport(`${HEADER}\n${line({ tags: '', rg: '' })}\n`)).toThrow(/both empty/);
    expect(() => parseAzureCostExport('Date,PreTaxCost,Currency\n2026-11-02,1,USD\n')).toThrow(/missing required column/);
  });

  it('throws UsageValidationError for a non-string export', () => {
    expect(() => parseAzureCostExport(1 as unknown as string)).toThrow(UsageValidationError);
  });
});

describe('azureAdapter', () => {
  it('loads the bundled sample under source azure', async () => {
    expect(azureAdapter.source).toBe('azure');
    const loaded = await azureAdapter.load();
    expect(loaded).toEqual(parseAzureCostExport(azureSample));
  });
});
