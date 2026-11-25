/**
 * One-call summary of every engine for an "at a glance" panel (pure).
 * The UI can call this instead of wiring each engine separately.
 */
import { totalSpend } from './aggregate';
import { multiSourceAssistants, type AssistantAllocation } from './allocation';
import { detectAnomalies, type Anomaly } from './anomaly';
import { budgetSummary, evaluateBudgets, loadBudgetConfig, type BudgetConfig, type BudgetStatus } from './budgets';
import { forecastWeekly, type ForecastPoint } from './forecast';
import type { UsageRecord } from './schema/usage';

export type Insights = {
  asOf: string;
  totalSpendUsd: number;
  budgets: { statuses: BudgetStatus[]; summary: ReturnType<typeof budgetSummary>; worst: BudgetStatus | null };
  nextWeek: ForecastPoint | null;
  weeklyTrendUsd: number | null;
  /** Up to `topN` source-level anomalies, most recent first. */
  recentAnomalies: Anomaly[];
  crossSourceAssistants: AssistantAllocation[];
  headlines: string[];
};

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function buildInsights(
  records: readonly UsageRecord[],
  asOf: string,
  options?: { budgets?: BudgetConfig; topN?: number },
): Insights {
  const topN = options?.topN ?? 3;
  const statuses = evaluateBudgets(records, options?.budgets ?? loadBudgetConfig(), asOf);
  const summary = budgetSummary(statuses);
  const upToAsOf = records.filter((r) => r.date <= asOf);
  const fc = forecastWeekly(upToAsOf, { horizon: 1 });
  const nextWeek = fc.forecast[0] ?? null;
  const recentAnomalies = detectAnomalies(upToAsOf, { scope: 'source' })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.zScore - a.zScore)
    .slice(0, topN);
  const cross = multiSourceAssistants(upToAsOf).slice(0, topN);

  const headlines: string[] = [];
  const worst = statuses[0] ?? null;
  if (summary.over > 0) headlines.push(`${summary.over} budget${summary.over === 1 ? ' is' : 's are'} over; worst: ${worst?.label} at ${worst?.pctUsed.toFixed(0)}%`);
  else if (summary.warn > 0) headlines.push(`${summary.warn} budget${summary.warn === 1 ? ' is' : 's are'} above the warning level`);
  else headlines.push('All budgets are within limits');
  if (nextWeek) headlines.push(`Next week's spend is forecast at ${usd(nextWeek.value)} (range ${usd(nextWeek.low)}–${usd(nextWeek.high)})`);
  const latest = recentAnomalies[0];
  if (latest) headlines.push(latest.reason);

  return {
    asOf,
    totalSpendUsd: totalSpend(upToAsOf),
    budgets: { statuses, summary, worst },
    nextWeek,
    weeklyTrendUsd: fc.slope ?? null,
    recentAnomalies,
    crossSourceAssistants: cross,
    headlines,
  };
}
