import { afterEach, describe, expect, it } from 'vitest';
import { loadAllUsage } from '../../src/adapters/index';
import {
  RegistryError,
  checkRegistry,
  getAdapters,
  getSourceMeta,
  listSourceMeta,
  registerAdapter,
  resetRegistry,
  sourceColor,
  sourceColors,
  sourceLabel,
  sourceLabels,
  unregisterAdapter,
} from '../../src/adapters/registry';
import { SOURCE_COLORS, SOURCE_LABELS } from '../../src/app/format';
import { emptyBySource } from '../../src/aggregate';
import { SOURCES, type Source, type UsageAdapter } from '../../src/schema/usage';

afterEach(() => resetRegistry());

describe('source metadata', () => {
  it('describes every source, in SOURCES order', () => {
    expect(listSourceMeta().map((m) => m.id)).toEqual([...SOURCES]);
    expect(checkRegistry()).toEqual([]);
  });

  it('exposes labels, colors, and units', () => {
    expect(sourceLabel('grok-bot')).toBe('Grok Bot');
    expect(sourceLabel('llm-api')).toBe('LLM API');
    expect(sourceColor('cursor')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getSourceMeta('azure').unitType).toBe('USD');
    expect(getSourceMeta('llm-api').unitType).toBe('tokens');
  });

  it('feeds the UI label and color maps', () => {
    expect(SOURCE_LABELS).toEqual(sourceLabels());
    expect(SOURCE_COLORS).toEqual(sourceColors());
    expect(Object.keys(SOURCE_LABELS).sort()).toEqual([...SOURCES].sort());
  });

  it('meta unitType matches what each adapter emits', async () => {
    const records = await loadAllUsage();
    for (const s of SOURCES) {
      const types = new Set(records.filter((r) => r.source === s).map((r) => r.unit_type));
      expect([...types], s).toEqual([getSourceMeta(s).unitType]);
    }
  });

  it('emptyBySource has a zero for every source', () => {
    expect(emptyBySource()).toEqual(Object.fromEntries(SOURCES.map((s) => [s, 0])));
  });
});

describe('adapter registration', () => {
  const fake = (source: Source, n = 1): UsageAdapter => ({
    source,
    async load() {
      return Array.from({ length: n }, () => ({
        date: '2026-09-01',
        source,
        assistant_or_project: 'test',
        units: 1,
        unit_type: 'requests',
        cost_usd: 1,
      }));
    },
  });

  it('registers all four built-ins in SOURCES order', () => {
    expect(getAdapters().map((a) => a.source)).toEqual([...SOURCES]);
  });

  it('refuses duplicates unless replace is set', async () => {
    expect(() => registerAdapter(fake('cursor'))).toThrow(RegistryError);
    registerAdapter(fake('cursor', 3), { replace: true });
    const all = await loadAllUsage();
    expect(all.filter((r) => r.source === 'cursor')).toHaveLength(3);
  });

  it('refuses unknown sources', () => {
    expect(() => registerAdapter(fake('openai' as Source))).toThrow(/unknown source/);
  });

  it('loadAllUsage only runs registered adapters', async () => {
    expect(unregisterAdapter('azure')).toBe(true);
    const all = await loadAllUsage();
    expect(all.some((r) => r.source === 'azure')).toBe(false);
    expect(getAdapters()).toHaveLength(SOURCES.length - 1);
  });

  it('resetRegistry restores built-ins', () => {
    unregisterAdapter('grok-bot');
    resetRegistry();
    expect(getAdapters()).toHaveLength(SOURCES.length);
  });
});
