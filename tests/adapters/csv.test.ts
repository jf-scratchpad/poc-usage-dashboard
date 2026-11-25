import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/adapters/csv';
import { UsageValidationError } from '../../src/schema/usage';

describe('parseCsv', () => {
  it('skips comment lines and a leading BOM, and keeps quoted commas', () => {
    const text = '\ufeff# fictional\nname,note\n"core, docs","he said ""ok"""\n';
    expect(parseCsv(text)).toEqual({
      headers: ['name', 'note'],
      rows: [{ name: 'core, docs', note: 'he said "ok"' }],
    });
  });

  it('rejects a missing header, a short row, and an unclosed quote', () => {
    expect(() => parseCsv('')).toThrow(UsageValidationError);
    expect(() => parseCsv('a,b\n1\n')).toThrow(/expected 2 columns/);
    expect(() => parseCsv('a,b\n"open,1\n')).toThrow(/quoted field/);
  });
});
