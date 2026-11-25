import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  dateExtent,
  dateWindow,
  defaultFilters,
  describeFilters,
  filtersEqual,
  filtersToParams,
  parseFilters,
} from '../../src/ui/filters';
import { SOURCES } from '../../src/schema/usage';
import { FIXTURE_RECORDS } from '../fixtures';

const p = (s: string) => new URLSearchParams(s);

describe('filters <-> URL', () => {
  it('defaults to all time, every source, no search, and serializes to an empty query', () => {
    const f = parseFilters(p(''));
    expect(f).toEqual(defaultFilters());
    expect(filtersToParams(f).toString()).toBe('');
  });

  it('round-trips presets, sources, and search', () => {
    const f = parseFilters(p('range=4w&src=azure,cursor&q=Cody'));
    expect(f.range).toBe('4w');
    expect(f.sources).toEqual(['cursor', 'azure']); // canonical SOURCES order
    expect(f.q).toBe('Cody');
    const back = parseFilters(filtersToParams(f));
    expect(filtersEqual(f, back)).toBe(true);
  });

  it('keeps custom from/to, swaps them when reversed, and drops invalid dates', () => {
    expect(parseFilters(p('range=custom&from=2026-11-01&to=2026-10-01'))).toMatchObject({ from: '2026-10-01', to: '2026-11-01' });
    const bad = parseFilters(p('range=custom&from=2026-02-30&to=nope'));
    expect(bad.from).toBeUndefined();
    expect(bad.to).toBeUndefined();
    // from/to are ignored for non-custom ranges
    expect(parseFilters(p('range=4w&from=2026-10-01')).from).toBeUndefined();
  });

  it('ignores unknown ranges and sources; an explicit empty src means none selected', () => {
    expect(parseFilters(p('range=99y')).range).toBe('all');
    expect(parseFilters(p('src=cursor,bogus')).sources).toEqual(['cursor']);
    expect(parseFilters(p('src=')).sources).toEqual([]);
    expect(filtersToParams({ ...defaultFilters(), sources: [] }).toString()).toBe('src=');
  });

  it('omits src when every source is selected', () => {
    expect(filtersToParams({ ...defaultFilters(), sources: [...SOURCES] }).has('src')).toBe(false);
  });
});

describe('date windows', () => {
  const asOf = '2026-11-25'; // a Wednesday; ISO week starts Mon 2026-11-23
  it('4w and 12w cover whole ISO weeks ending with the current week', () => {
    expect(dateWindow({ ...defaultFilters(), range: '4w' }, asOf)).toEqual({ from: '2026-11-02', to: asOf });
    expect(dateWindow({ ...defaultFilters(), range: '12w' }, asOf)).toEqual({ from: '2026-09-07', to: asOf });
  });
  it('all spans from the earliest record; custom falls back to the extent', () => {
    expect(dateWindow(defaultFilters(), asOf, '2026-08-31')).toEqual({ from: '2026-08-31', to: asOf });
    expect(dateWindow({ ...defaultFilters(), range: 'custom', from: '2026-10-01' }, asOf, '2026-08-31')).toEqual({ from: '2026-10-01', to: asOf });
  });
});

describe('applyFilters', () => {
  const all = { from: '2000-01-01', to: '2100-01-01' };
  it('filters by date, source, and case-insensitive assistant search', () => {
    const f = { ...defaultFilters(), sources: ['grok-bot' as const], q: 'co' };
    const out = applyFilters(FIXTURE_RECORDS, f, { from: '2026-11-01', to: '2026-11-30' });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((r) => r.source === 'grok-bot' && r.assistant_or_project === 'Cody' && r.date >= '2026-11-01')).toBe(true);
  });
  it('can ignore the search or the source filter for drill-down views', () => {
    const f = { ...defaultFilters(), sources: [], q: 'zzz' };
    expect(applyFilters(FIXTURE_RECORDS, f, all)).toEqual([]);
    expect(applyFilters(FIXTURE_RECORDS, f, all, { ignoreQuery: true, ignoreSources: true })).toHaveLength(FIXTURE_RECORDS.length);
  });
  it('reports extent and a readable description', () => {
    expect(dateExtent(FIXTURE_RECORDS)).toEqual({ min: '2026-10-06', max: '2026-11-25' });
    expect(dateExtent([])).toBeUndefined();
    expect(describeFilters({ ...defaultFilters(), sources: ['azure'], q: 'ai' }, all)).toContain('assistant contains "ai"');
  });
});
