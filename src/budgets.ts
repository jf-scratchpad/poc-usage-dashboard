/**
 * Budgets and alerts engine (pure). Budgets live in config/budgets.json.
 *
 * For each budget and an `asOf` day:
 *   period      = the calendar month or ISO week (Mon–Sun) containing asOf
 *   spent       = cost of matching records from period start through asOf
 *   pctUsed     = spent / budget × 100
 *   projected   = spent / elapsedDays × periodDays   (straight-line run rate)
 *   level       = 'over' if pct ≥ over_pct, 'warn' if pct ≥ warn_pct, else 'ok'
 *   projectedLevel uses the same rule on the projected percentage.
 * Assistant budgets match `assistant_or_project` case-insensitively across all
 * sources (e.g. Cody's Grok Bot + LLM API spend), optionally narrowed by `source`.
 */
import { formatDate, isoWeekEnd, isoWeekStart, parseDate } from './aggregate';
import { sourceLabel } from './adapters/sources';
import { isSource, isValidDate, type Source, type UsageRecord } from './schema/usage';
import budgetsJson from '../config/budgets.json';

export type AlertLevel = 'ok' | 'warn' | 'over';
export type BudgetScope = 'total' | 'source' | 'assistant';
export type BudgetPeriod = 'week' | 'month';

export type BudgetDef = {
  id: string;
  scope: BudgetScope;
  /** Source id (scope 'source') or assistant/project name (scope 'assistant'). */
  key?: string;
  /** Optional source restriction for assistant budgets. */
  source?: Source;
  period: BudgetPeriod;
  amount_usd: number;
  label?: string;
};

export type BudgetConfig = {
  thresholds: { warn_pct: number; over_pct: number };
  budgets: BudgetDef[];
};

export type BudgetStatus = {
  id: string;
  scope: BudgetScope;
  key: string;
  label: string;
  period: BudgetPeriod;
  periodStart: string;
  periodEnd: string;
  asOf: string;
  elapsedDays: number;
  periodDays: number;
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  pctUsed: number;
  projectedUsd: number;
  projectedPct: number;
  level: AlertLevel;
  projectedLevel: AlertLevel;
};

export class BudgetConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetConfigError';
  }
}

const MS_PER_DAY = 86_400_000;

function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / MS_PER_DAY) + 1;
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: string): string {
  const d = parseDate(monthStart(date));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return formatDate(d);
}

export function periodBounds(period: BudgetPeriod, asOf: string): { start: string; end: string } {
  if (period === 'week') {
    const start = isoWeekStart(asOf);
    return { start, end: isoWeekEnd(start) };
  }
  return { start: monthStart(asOf), end: monthEnd(asOf) };
}

export function alertLevel(pct: number, thresholds: BudgetConfig['thresholds']): AlertLevel {
  if (pct >= thresholds.over_pct) return 'over';
  if (pct >= thresholds.warn_pct) return 'warn';
  return 'ok';
}

/** Validates a parsed budgets.json; throws BudgetConfigError naming the bad entry. */
export function parseBudgetConfig(raw: unknown): BudgetConfig {
  if (typeof raw !== 'object' || raw === null) throw new BudgetConfigError('budgets: expected an object');
  const o = raw as Record<string, unknown>;
  const t = (o.thresholds ?? { warn_pct: 80, over_pct: 100 }) as Record<string, unknown>;
  const warn_pct = Number(t.warn_pct);
  const over_pct = Number(t.over_pct);
  if (!(warn_pct > 0 && over_pct > warn_pct)) {
    throw new BudgetConfigError('budgets: thresholds need 0 < warn_pct < over_pct');
  }
  if (!Array.isArray(o.budgets)) throw new BudgetConfigError('budgets: expected a budgets array');
  const ids = new Set<string>();
  const budgets = o.budgets.map((b, i): BudgetDef => {
    const where = `budgets[${i}]`;
    if (typeof b !== 'object' || b === null) throw new BudgetConfigError(`${where}: expected an object`);
    const d = b as Record<string, unknown>;
    if (typeof d.id !== 'string' || !d.id) throw new BudgetConfigError(`${where}: id is required`);
    if (ids.has(d.id)) throw new BudgetConfigError(`${where}: duplicate id ${d.id}`);
    ids.add(d.id);
    if (d.scope !== 'total' && d.scope !== 'source' && d.scope !== 'assistant') {
      throw new BudgetConfigError(`${where} (${d.id}): scope must be total, source, or assistant`);
    }
    if (d.period !== 'week' && d.period !== 'month') {
      throw new BudgetConfigError(`${where} (${d.id}): period must be week or month`);
    }
    if (typeof d.amount_usd !== 'number' || !(d.amount_usd > 0)) {
      throw new BudgetConfigError(`${where} (${d.id}): amount_usd must be a positive number`);
    }
    if (d.scope === 'source' && !isSource(d.key)) {
      throw new BudgetConfigError(`${where} (${d.id}): key must be a known source`);
    }
    if (d.scope === 'assistant' && (typeof d.key !== 'string' || !d.key.trim())) {
      throw new BudgetConfigError(`${where} (${d.id}): key must name an assistant or project`);
    }
    if (d.source !== undefined && !isSource(d.source)) {
      throw new BudgetConfigError(`${where} (${d.id}): source must be a known source`);
    }
    return {
      id: d.id,
      scope: d.scope,
      key: typeof d.key === 'string' ? d.key : undefined,
      source: d.source as Source | undefined,
      period: d.period,
      amount_usd: d.amount_usd,
      label: typeof d.label === 'string' ? d.label : undefined,
    };
  });
  return { thresholds: { warn_pct, over_pct }, budgets };
}

/** The bundled fictional config/budgets.json, validated. */
export function loadBudgetConfig(): BudgetConfig {
  return parseBudgetConfig(budgetsJson);
}

export function budgetMatches(def: BudgetDef, r: UsageRecord): boolean {
  if (def.scope === 'total') return true;
  if (def.scope === 'source') return r.source === def.key;
  if (def.source && r.source !== def.source) return false;
  return r.assistant_or_project.toLowerCase() === (def.key ?? '').toLowerCase();
}

function defaultLabel(def: BudgetDef): string {
  const per = def.period === 'week' ? 'weekly' : 'monthly';
  if (def.scope === 'total') return `All sources (${per})`;
  if (def.scope === 'source' && isSource(def.key)) return `${sourceLabel(def.key)} (${per})`;
  return `${def.key ?? ''}${def.source ? ` on ${sourceLabel(def.source)}` : ''} (${per})`;
}

const LEVEL_RANK: Record<AlertLevel, number> = { over: 2, warn: 1, ok: 0 };

export function evaluateBudget(records: readonly UsageRecord[], def: BudgetDef, config: BudgetConfig, asOf: string): BudgetStatus {
  if (!isValidDate(asOf)) throw new BudgetConfigError(`asOf must be YYYY-MM-DD, got ${asOf}`);
  const { start, end } = periodBounds(def.period, asOf);
  let spent = 0;
  for (const r of records) {
    if (r.date >= start && r.date <= asOf && budgetMatches(def, r)) spent += r.cost_usd;
  }
  const elapsedDays = daysBetweenInclusive(start, asOf);
  const periodDays = daysBetweenInclusive(start, end);
  const projected = (spent / elapsedDays) * periodDays;
  const pctUsed = (spent / def.amount_usd) * 100;
  const projectedPct = (projected / def.amount_usd) * 100;
  return {
    id: def.id,
    scope: def.scope,
    key: def.scope === 'total' ? 'total' : (def.key ?? ''),
    label: def.label ?? defaultLabel(def),
    period: def.period,
    periodStart: start,
    periodEnd: end,
    asOf,
    elapsedDays,
    periodDays,
    budgetUsd: def.amount_usd,
    spentUsd: spent,
    remainingUsd: def.amount_usd - spent,
    pctUsed,
    projectedUsd: projected,
    projectedPct,
    level: alertLevel(pctUsed, config.thresholds),
    projectedLevel: alertLevel(projectedPct, config.thresholds),
  };
}

/** Every budget's status, worst first (level, then projected level, then % used). */
export function evaluateBudgets(records: readonly UsageRecord[], config: BudgetConfig, asOf: string): BudgetStatus[] {
  return config.budgets
    .map((b) => evaluateBudget(records, b, config, asOf))
    .sort(
      (a, b) =>
        LEVEL_RANK[b.level] - LEVEL_RANK[a.level] ||
        LEVEL_RANK[b.projectedLevel] - LEVEL_RANK[a.projectedLevel] ||
        b.pctUsed - a.pctUsed ||
        a.id.localeCompare(b.id),
    );
}

export function budgetSummary(statuses: readonly BudgetStatus[]): Record<AlertLevel, number> & { projectedOver: number } {
  const out = { ok: 0, warn: 0, over: 0, projectedOver: 0 };
  for (const s of statuses) {
    out[s.level] += 1;
    if (s.projectedLevel === 'over') out.projectedOver += 1;
  }
  return out;
}
