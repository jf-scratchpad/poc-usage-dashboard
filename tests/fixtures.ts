import type { UsageRecord } from '../src/schema/usage';

/** Pinned "today" so week-over-week assertions do not depend on the clock. */
export const FIXTURE_AS_OF = '2026-11-25';

export const FIXTURE_RECORDS: UsageRecord[] = [
  // Week of 2026-10-05
  rec('2026-10-06', 'grok-bot', 'Cody', 1_200_000, 'tokens', 9.4),
  rec('2026-10-07', 'cursor', 'Cursor Agent', 800, 'requests', 6.2),
  rec('2026-10-08', 'azure', 'ai-core', 12, 'USD', 12.0),

  // Week of 2026-10-12
  rec('2026-10-13', 'grok-bot', 'Cody', 1_500_000, 'tokens', 11.8),
  rec('2026-10-14', 'grok-bot', 'Rocky', 400_000, 'tokens', 3.1),
  rec('2026-10-15', 'cursor', 'Cursor Agent', 950, 'requests', 7.4),
  rec('2026-10-16', 'azure', 'ai-core', 15, 'USD', 15.0),

  // Week of 2026-10-19
  rec('2026-10-20', 'grok-bot', 'Cody', 1_800_000, 'tokens', 14.2),
  rec('2026-10-21', 'cursor', 'Composer', 420, 'requests', 5.6),
  rec('2026-10-22', 'cursor', 'Cursor Agent', 1100, 'requests', 8.8),
  rec('2026-10-23', 'azure', 'document-intel', 9.5, 'USD', 9.5),
  rec('2026-10-24', 'azure', 'ai-core', 11, 'USD', 11.0),

  // Week of 2026-10-26
  rec('2026-10-27', 'grok-bot', 'Cody', 2_100_000, 'tokens', 16.5),
  rec('2026-10-28', 'grok-bot', 'Archie', 250_000, 'tokens', 2.0),
  rec('2026-10-29', 'cursor', 'Cursor Agent', 1300, 'requests', 10.4),
  rec('2026-10-30', 'azure', 'ai-core', 18, 'USD', 18.0),

  // Week of 2026-11-02
  rec('2026-11-03', 'grok-bot', 'Cody', 1_900_000, 'tokens', 15.1),
  rec('2026-11-04', 'grok-bot', 'Rocky', 500_000, 'tokens', 4.0),
  rec('2026-11-05', 'cursor', 'Composer', 600, 'requests', 7.2),
  rec('2026-11-06', 'azure', 'usage-research', 6.4, 'USD', 6.4),
  rec('2026-11-07', 'azure', 'ai-core', 14, 'USD', 14.0),

  // Week of 2026-11-09
  rec('2026-11-10', 'grok-bot', 'Cody', 2_400_000, 'tokens', 18.7),
  rec('2026-11-11', 'cursor', 'Cursor Agent', 1500, 'requests', 12.0),
  rec('2026-11-12', 'azure', 'ai-core', 20, 'USD', 20.0),

  // Week of 2026-11-16 (last week relative to 2026-11-25)
  rec('2026-11-17', 'grok-bot', 'Cody', 2_200_000, 'tokens', 17.2),
  rec('2026-11-18', 'grok-bot', 'Rocky', 350_000, 'tokens', 2.8),
  rec('2026-11-19', 'cursor', 'Cursor Agent', 1400, 'requests', 11.2),
  rec('2026-11-20', 'cursor', 'Composer', 500, 'requests', 6.0),
  rec('2026-11-21', 'azure', 'ai-core', 16, 'USD', 16.0),
  rec('2026-11-21', 'azure', 'document-intel', 8, 'USD', 8.0),

  // Week of 2026-11-23 (this week relative to 2026-11-25)
  rec('2026-11-23', 'grok-bot', 'Cody', 1_100_000, 'tokens', 8.6),
  rec('2026-11-24', 'grok-bot', 'Archie', 180_000, 'tokens', 1.4),
  rec('2026-11-24', 'cursor', 'Cursor Agent', 700, 'requests', 5.5),
  rec('2026-11-25', 'cursor', 'Composer', 240, 'requests', 2.9),
  rec('2026-11-25', 'azure', 'ai-core', 7.5, 'USD', 7.5),
];

function rec(
  date: string,
  source: UsageRecord['source'],
  assistant_or_project: string,
  units: number,
  unit_type: string,
  cost_usd: number,
): UsageRecord {
  return { date, source, assistant_or_project, units, unit_type, cost_usd };
}
