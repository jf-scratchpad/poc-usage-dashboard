import { describe, expect, it } from 'vitest';
import { SOURCES, UsageValidationError, validateRecord, validateRecords } from '../src/schema/usage';

const good = {
  date: '2026-11-23',
  source: 'cursor',
  assistant_or_project: 'Cursor Agent',
  units: 1200,
  unit_type: 'requests',
  cost_usd: 4.5,
};

describe('validateRecord', () => {
  it('accepts a valid record', () => {
    expect(validateRecord(good)).toEqual(good);
  });

  it('accepts every known source', () => {
    for (const source of SOURCES) {
      expect(validateRecord({ ...good, source }).source).toBe(source);
    }
  });

  it('rejects a bad date', () => {
    expect(() => validateRecord({ ...good, date: '2026-13-01' })).toThrow(/bad date/);
    expect(() => validateRecord({ ...good, date: '11/23/2026' })).toThrow(/bad date/);
  });

  it('rejects negative cost and units', () => {
    expect(() => validateRecord({ ...good, cost_usd: -1 })).toThrow(/cost_usd must not be negative/);
    expect(() => validateRecord({ ...good, units: -5 })).toThrow(/units must not be negative/);
  });

  it('rejects an unknown source', () => {
    expect(() => validateRecord({ ...good, source: 'openai' })).toThrow(/unknown source/);
  });

  it('rejects an empty name', () => {
    expect(() => validateRecord({ ...good, assistant_or_project: '  ' })).toThrow(/assistant_or_project/);
  });

  it('throws UsageValidationError', () => {
    expect(() => validateRecord(null)).toThrow(UsageValidationError);
  });
});

describe('validateRecords', () => {
  it('names the failing index', () => {
    expect(() => validateRecords([good, { ...good, cost_usd: -2 }])).toThrow(/record\[1\]/);
  });

  it('rejects non-arrays', () => {
    expect(() => validateRecords({})).toThrow(/array/);
  });
});
