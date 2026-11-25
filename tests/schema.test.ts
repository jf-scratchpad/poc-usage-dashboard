import { describe, expect, it } from 'vitest';
import {
  SOURCES,
  UsageValidationError,
  isSource,
  isValidDate,
  validateRecord,
  validateRecords,
} from '../src/schema/usage';

const good = {
  date: '2026-11-23',
  source: 'cursor',
  assistant_or_project: 'Cursor Agent',
  units: 1200,
  unit_type: 'requests',
  cost_usd: 4.5,
};

describe('isValidDate', () => {
  it.each(['2026-11-23', '2024-02-29', '2026-01-01', '2026-12-31'])('accepts %s', (d) => {
    expect(isValidDate(d)).toBe(true);
  });
  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-1-5', '11/23/2026', '2026-11-23T00:00:00Z', '', 20261123, null])(
    'rejects %s',
    (d) => {
      expect(isValidDate(d)).toBe(false);
    },
  );
});

describe('isSource', () => {
  it('knows exactly the three sources', () => {
    expect([...SOURCES]).toEqual(['grok-bot', 'cursor', 'azure']);
    expect(isSource('azure')).toBe(true);
    expect(isSource('Azure')).toBe(false);
    expect(isSource(undefined)).toBe(false);
  });
});

describe('validateRecord', () => {
  it('accepts a valid record', () => {
    expect(validateRecord(good)).toEqual(good);
  });

  it('accepts every known source', () => {
    for (const source of SOURCES) {
      expect(validateRecord({ ...good, source }).source).toBe(source);
    }
  });

  it('accepts zero units and zero cost (free tier days)', () => {
    expect(validateRecord({ ...good, units: 0, cost_usd: 0 })).toMatchObject({ units: 0, cost_usd: 0 });
  });

  it('trims names and drops unknown fields', () => {
    const r = validateRecord({ ...good, assistant_or_project: '  Cursor Agent ', unit_type: ' requests ', extra: 1 });
    expect(r).toEqual(good);
    expect(Object.keys(r)).not.toContain('extra');
  });

  it('rejects a bad date', () => {
    expect(() => validateRecord({ ...good, date: '2026-13-01' })).toThrow(/bad date/);
    expect(() => validateRecord({ ...good, date: '11/23/2026' })).toThrow(/bad date/);
    expect(() => validateRecord({ ...good, date: undefined })).toThrow(/bad date/);
  });

  it('rejects negative cost and units', () => {
    expect(() => validateRecord({ ...good, cost_usd: -1 })).toThrow(/cost_usd must not be negative/);
    expect(() => validateRecord({ ...good, units: -5 })).toThrow(/units must not be negative/);
  });

  it('rejects non-numeric, NaN, and infinite numbers', () => {
    expect(() => validateRecord({ ...good, cost_usd: '4.50' })).toThrow(/cost_usd must be a finite number/);
    expect(() => validateRecord({ ...good, units: Number.NaN })).toThrow(/units must be a finite number/);
    expect(() => validateRecord({ ...good, cost_usd: Number.POSITIVE_INFINITY })).toThrow(/finite/);
  });

  it('rejects an unknown source', () => {
    expect(() => validateRecord({ ...good, source: 'openai' })).toThrow(/unknown source "openai"/);
  });

  it('rejects an empty or missing name', () => {
    expect(() => validateRecord({ ...good, assistant_or_project: '  ' })).toThrow(/assistant_or_project/);
    expect(() => validateRecord({ ...good, assistant_or_project: undefined })).toThrow(/assistant_or_project/);
  });

  it('rejects an empty unit_type', () => {
    expect(() => validateRecord({ ...good, unit_type: '' })).toThrow(/unit_type/);
  });

  it('rejects non-objects with UsageValidationError', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(() => validateRecord(bad)).toThrow(UsageValidationError);
    }
  });
});

describe('validateRecords', () => {
  it('validates every record', () => {
    expect(validateRecords([good, { ...good, source: 'azure' }])).toHaveLength(2);
    expect(validateRecords([])).toEqual([]);
  });

  it('names the failing index', () => {
    expect(() => validateRecords([good, { ...good, cost_usd: -2 }])).toThrow(/record\[1\]/);
  });

  it('rejects non-arrays', () => {
    expect(() => validateRecords({})).toThrow(/array/);
  });
});
