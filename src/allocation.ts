/**
 * Cost allocation views (pure).
 *
 * - costByAssistantAcrossSources: one row per assistant/project name, merging
 *   the same name across sources case-insensitively (e.g. Cody's Grok Bot +
 *   LLM API spend), with a per-source breakdown and share of total.
 * - unitEconomics: cost per unit for every source × assistant × unit type.
 *   Units are only comparable within one unit type, so rows never mix types.
 * - assistantWeekly: weekly cost per source for one assistant (drill-down).
 */
import { emptyBySource, totalsByWeek } from './aggregate';
import { SOURCES, type Source, type UsageRecord } from './schema/usage';

export type AssistantAllocation = {
  /** Display name: the first spelling seen. */
  assistant: string;
  /** Lower-cased merge key. */
  key: string;
  total_cost_usd: number;
  /** Percent of all spend in the input. */
  share_pct: number;
  bySource: Record<Source, number>;
  /** Sources with non-zero spend, in SOURCES order. */
  sources: Source[];
  unitsByType: Record<string, number>;
};

export function assistantKey(name: string): string {
  return name.trim().toLowerCase();
}

export function costByAssistantAcrossSources(records: readonly UsageRecord[]): AssistantAllocation[] {
  const map = new Map<string, AssistantAllocation>();
  let grand = 0;
  for (const r of records) {
    grand += r.cost_usd;
    const key = assistantKey(r.assistant_or_project);
    let row = map.get(key);
    if (!row) {
      row = { assistant: r.assistant_or_project, key, total_cost_usd: 0, share_pct: 0, bySource: emptyBySource(), sources: [], unitsByType: {} };
      map.set(key, row);
    }
    row.total_cost_usd += r.cost_usd;
    row.bySource[r.source] += r.cost_usd;
    row.unitsByType[r.unit_type] = (row.unitsByType[r.unit_type] ?? 0) + r.units;
  }
  const rows = [...map.values()];
  for (const row of rows) {
    row.share_pct = grand === 0 ? 0 : (row.total_cost_usd / grand) * 100;
    row.sources = SOURCES.filter((s) => row.bySource[s] > 0);
  }
  return rows.sort((a, b) => b.total_cost_usd - a.total_cost_usd || a.key.localeCompare(b.key));
}

/** Assistants that appear in more than one source (the cross-source story). */
export function multiSourceAssistants(records: readonly UsageRecord[]): AssistantAllocation[] {
  return costByAssistantAcrossSources(records).filter((r) => r.sources.length > 1);
}

export type UnitEconomicsRow = {
  source: Source;
  assistant_or_project: string;
  unit_type: string;
  units: number;
  cost_usd: number;
  /** cost ÷ units; null when units are 0. */
  cost_per_unit: number | null;
  /** cost per 1,000 units (handy for tokens); null when units are 0. */
  cost_per_1k_units: number | null;
};

function perUnit(cost: number, units: number): { cost_per_unit: number | null; cost_per_1k_units: number | null } {
  if (units === 0) return { cost_per_unit: null, cost_per_1k_units: null };
  return { cost_per_unit: cost / units, cost_per_1k_units: (cost / units) * 1000 };
}

/** One row per source × assistant × unit type, most expensive first. */
export function unitEconomics(records: readonly UsageRecord[]): UnitEconomicsRow[] {
  const map = new Map<string, { source: Source; assistant_or_project: string; unit_type: string; units: number; cost_usd: number }>();
  for (const r of records) {
    const k = `${r.source}\u0000${r.assistant_or_project}\u0000${r.unit_type}`;
    const row = map.get(k);
    if (row) {
      row.units += r.units;
      row.cost_usd += r.cost_usd;
    } else {
      map.set(k, { source: r.source, assistant_or_project: r.assistant_or_project, unit_type: r.unit_type, units: r.units, cost_usd: r.cost_usd });
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, ...perUnit(r.cost_usd, r.units) }))
    .sort((a, b) => b.cost_usd - a.cost_usd || a.source.localeCompare(b.source) || a.assistant_or_project.localeCompare(b.assistant_or_project));
}

/** Source-level unit economics (one row per source × unit type). */
export function unitEconomicsBySource(records: readonly UsageRecord[]): Omit<UnitEconomicsRow, 'assistant_or_project'>[] {
  const map = new Map<string, { source: Source; unit_type: string; units: number; cost_usd: number }>();
  for (const r of records) {
    const k = `${r.source}\u0000${r.unit_type}`;
    const row = map.get(k) ?? { source: r.source, unit_type: r.unit_type, units: 0, cost_usd: 0 };
    row.units += r.units;
    row.cost_usd += r.cost_usd;
    map.set(k, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, ...perUnit(r.cost_usd, r.units) }))
    .sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source) || a.unit_type.localeCompare(b.unit_type));
}

export type AssistantWeek = { weekStart: string; total: number; bySource: Record<Source, number> };

/** Weekly cost for one assistant (case-insensitive) on the full data range, zero-filled. */
export function assistantWeekly(records: readonly UsageRecord[], assistant: string): AssistantWeek[] {
  const key = assistantKey(assistant);
  const mine = records.filter((r) => assistantKey(r.assistant_or_project) === key);
  if (mine.length === 0) return [];
  const dates = records.map((r) => r.date).sort();
  return totalsByWeek(mine, { from: dates[0], to: dates.at(-1) }).map((w) => ({
    weekStart: w.weekStart,
    total: w.totalCostUsd,
    bySource: w.bySource,
  }));
}
