/**
 * Azure Cost Management collector: maps a daily actual-cost export into
 * UsageRecords rolled up by day and project tag.
 */
import type { UsageAdapter, UsageRecord } from '../schema/usage';
import { UsageValidationError, isValidDate, validateRecord } from '../schema/usage';
import { parseCsv, parseFiniteNumber, parseNonNegativeNumber, requiredField, requireColumns } from './csv';

// REAL DATA PLUGS IN HERE
// Today this adapter imports the fictional sample file
// data/sample/azure-cost-management.csv via a Vite `?raw` import (bundled at
// build time; no filesystem access at runtime). A production collector would
// replace that import with an Azure Cost Management daily actual-cost export
// or a Cost Details / Query API result written out as CSV in this shape
// (PreTaxCost, Date, Tags, ResourceGroup, Currency, and the other columns
// below). If the account bills in a currency other than USD, convert to USD
// in that external job before (or while) writing the file, then pass the
// text to parseAzureCostExport(). Do not add credentials or network calls in
// this trial; a live collector would run outside this static site and write
// a file the build can import.
import azureSample from '../../data/sample/azure-cost-management.csv?raw';

export const AZURE_UNIT_TYPE = 'USD';

const REQUIRED_COLUMNS = [
  'Date',
  'SubscriptionId',
  'SubscriptionName',
  'ResourceGroup',
  'ResourceId',
  'ResourceLocation',
  'ServiceName',
  'MeterCategory',
  'MeterName',
  'Tags',
  'Quantity',
  'UnitOfMeasure',
  'PreTaxCost',
  'Currency',
] as const;

type Bucket = { date: string; assistant_or_project: string; cost_usd: number };

export function parseAzureCostExport(csvText: string): UsageRecord[] {
  if (typeof csvText !== 'string') {
    throw new UsageValidationError('Azure export: expected CSV text');
  }
  const table = parseCsv(csvText);
  requireColumns(table.headers, REQUIRED_COLUMNS);

  const buckets = new Map<string, Bucket>();
  table.rows.forEach((row, i) => {
    const where = `Azure row ${i + 1}`;
    const date = parseAzureDate(requiredField(row, 'Date', where), where);
    const currency = requiredField(row, 'Currency', where);
    if (currency.toUpperCase() !== 'USD') {
      throw new UsageValidationError(
        `${where}: currency ${JSON.stringify(currency)} is not USD; convert to USD at the plug-in point before parsing`,
      );
    }
    const cost = parseNonNegativeNumber(requiredField(row, 'PreTaxCost', where), 'PreTaxCost', where);
    // Quantity is source-native and meter-specific (hours, GB, tokens, …).
    // It is validated so a bad export fails loudly, but it is not summed
    // across meters — those units are not comparable.
    parseNonNegativeNumber(requiredField(row, 'Quantity', where), 'Quantity', where);
    requiredField(row, 'SubscriptionId', where);
    requiredField(row, 'SubscriptionName', where);
    requiredField(row, 'ResourceId', where);
    requiredField(row, 'ResourceLocation', where);
    requiredField(row, 'ServiceName', where);
    requiredField(row, 'MeterCategory', where);
    requiredField(row, 'MeterName', where);
    requiredField(row, 'UnitOfMeasure', where);

    const resourceGroup = requiredField(row, 'ResourceGroup', where);
    const project = projectFromTags(requiredField(row, 'Tags', where), resourceGroup, where);

    const key = `${date}\0${project}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.cost_usd += cost;
    } else {
      buckets.set(key, { date, assistant_or_project: project, cost_usd: cost });
    }
  });

  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.assistant_or_project.localeCompare(b.assistant_or_project))
    .map((b, i) =>
      validateRecord(
        {
          date: b.date,
          source: 'azure',
          assistant_or_project: b.assistant_or_project,
          units: b.cost_usd,
          unit_type: AZURE_UNIT_TYPE,
          cost_usd: b.cost_usd,
        },
        i,
      ),
    );
}

/**
 * Accepts YYYY-MM-DD (sample data) or the yyyyMMdd UsageDate form used by
 * some Cost Management Query API responses.
 */
export function parseAzureDate(raw: string, where: string): string {
  const s = raw.trim();
  if (isValidDate(s)) return s;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (compact) {
    const iso = `${compact[1]}-${compact[2]}-${compact[3]}`;
    if (isValidDate(iso)) return iso;
  }
  throw new UsageValidationError(`${where}: bad date ${JSON.stringify(raw)}, expected YYYY-MM-DD or yyyyMMdd`);
}

function projectFromTags(tags: string, fallback: string, where: string): string {
  if (tags === '') {
    if (fallback.trim() === '') {
      throw new UsageValidationError(`${where}: Tags and ResourceGroup are both empty`);
    }
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(tags);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const project = (parsed as Record<string, unknown>).project;
      if (typeof project === 'string' && project.trim() !== '') {
        return project.trim();
      }
    }
  } catch {
    throw new UsageValidationError(`${where}: Tags is not valid JSON: ${JSON.stringify(tags)}`);
  }
  if (fallback.trim() === '') {
    throw new UsageValidationError(`${where}: Tags has no project and ResourceGroup is empty`);
  }
  return fallback;
}

export const azureAdapter: UsageAdapter = {
  source: 'azure',
  async load(): Promise<UsageRecord[]> {
    return parseAzureCostExport(azureSample);
  },
};
