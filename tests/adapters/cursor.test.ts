import { describe, expect, it } from 'vitest';
import cursorSample from '../../data/sample/cursor-usage.csv?raw';
import { CURSOR_UNIT_TYPE, cursorAdapter, parseCursorUsage } from '../../src/adapters/cursor';
import { UsageValidationError } from '../../src/schema/usage';

const HEADER =
  'date,project,kind,model,requests,input_tokens,output_tokens,cost_usd';

function rawEvents(csvText: string): Array<{ date: string; project: string; requests: number; cost_usd: number }> {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
  const header = lines[0];
  if (header === undefined) return [];
  const cols = header.split(',');
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
  return lines.slice(1).map((line) => {
    const parts = line.split(',');
    return {
      date: parts[idx.date!]!,
      project: parts[idx.project!]!,
      requests: Number(parts[idx.requests!]!),
      cost_usd: Number(parts[idx.cost_usd!]!),
    };
  });
}

describe('parseCursorUsage', () => {
  const records = parseCursorUsage(cursorSample);
  const events = rawEvents(cursorSample);

  it('rolls events up to one record per day and project', () => {
    expect(records.every((r) => r.source === 'cursor')).toBe(true);
    expect(records.every((r) => r.unit_type === CURSOR_UNIT_TYPE)).toBe(true);
    const expectedKeys = new Set(events.map((e) => `${e.date}\0${e.project}`));
    expect(records.length).toBe(expectedKeys.size);
    expect(records.length).toBeLessThan(events.length);
  });

  it('matches request and cost totals in the raw file', () => {
    const rawCost = events.reduce((s, e) => s + e.cost_usd, 0);
    const rawUnits = events.reduce((s, e) => s + e.requests, 0);
    expect(records.reduce((s, r) => s + r.cost_usd, 0)).toBeCloseTo(rawCost, 8);
    expect(records.reduce((s, r) => s + r.units, 0)).toBe(rawUnits);
  });

  it('covers the sample period and expected projects', () => {
    const dates = records.map((r) => r.date).sort();
    expect(dates[0]).toBe('2026-08-31');
    expect(dates.at(-1)).toBe('2026-11-22');
    expect(new Set(records.map((r) => r.assistant_or_project))).toEqual(
      new Set(['ai-core', 'macos-gitops', 'arch-notes', 'terraform-platform', 'usage-dashboard-trial']),
    );
  });

  it('sums two events for the same day and project', () => {
    const csv = [
      HEADER,
      '2026-11-02,ai-core,Composer,composer-sample,10,1000,200,1.5000',
      '2026-11-02,ai-core,Chat,chat-sample,5,400,80,0.2500',
    ].join('\n');
    expect(parseCursorUsage(csv)).toEqual([
      {
        date: '2026-11-02',
        source: 'cursor',
        assistant_or_project: 'ai-core',
        units: 15,
        unit_type: 'requests',
        cost_usd: 1.75,
      },
    ]);
  });

  it('handles a quoted project name that contains a comma', () => {
    const csv = `${HEADER}\n2026-11-02,"core, docs",Composer,composer-sample,3,100,20,0.2000\n`;
    expect(parseCursorUsage(csv)[0]?.assistant_or_project).toBe('core, docs');
  });
});

describe('parseCursorUsage: validation failures', () => {
  it('rejects a missing required column', () => {
    expect(() => parseCursorUsage('date,project,requests,cost_usd\n2026-11-02,ai-core,1,0.1\n')).toThrow(
      /missing required column/,
    );
  });

  it('rejects a bad date, empty project, and negative numbers', () => {
    const row = '2026-11-02,ai-core,Composer,composer-sample,10,100,20,0.5000';
    expect(() => parseCursorUsage(`${HEADER}\n2026-13-01,ai-core,Composer,composer-sample,10,100,20,0.5\n`)).toThrow(
      /bad date/,
    );
    expect(() => parseCursorUsage(`${HEADER}\n2026-11-02,,Composer,composer-sample,10,100,20,0.5\n`)).toThrow(
      /assistant_or_project/,
    );
    expect(() => parseCursorUsage(`${HEADER}\n2026-11-02,ai-core,Composer,composer-sample,10,100,20,-0.5\n`)).toThrow(
      /cost_usd must not be negative/,
    );
    expect(() => parseCursorUsage(`${HEADER}\n2026-11-02,ai-core,Composer,composer-sample,-4,100,20,0.5\n`)).toThrow(
      /requests must not be negative/,
    );
    expect(() => parseCursorUsage(`${HEADER}\n${row.replace('10', 'nope')}\n`)).toThrow(/requests must be a finite number/);
  });

  it('rejects a short row and a non-string export', () => {
    expect(() => parseCursorUsage(`${HEADER}\n2026-11-02,ai-core,Composer\n`)).toThrow(/expected 8 columns/);
    expect(() => parseCursorUsage(1 as unknown as string)).toThrow(/expected CSV text/);
  });
});

describe('cursorAdapter', () => {
  it('loads the bundled sample under source cursor', async () => {
    expect(cursorAdapter.source).toBe('cursor');
    const loaded = await cursorAdapter.load();
    expect(loaded).toEqual(parseCursorUsage(cursorSample));
  });
});
