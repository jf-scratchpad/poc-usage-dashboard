/** Calendar date in a named time zone, as YYYY-MM-DD. */
export function todayInTimeZone(timeZone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * The "as of" day for the weekly tiles and trend axis: today, unless the data
 * ends earlier (static sample data), in which case the latest record date.
 * Without this, the current week shows as a misleading $0 point and -100%.
 */
export function dataAsOf(records: readonly { date: string }[], today: string): string {
  let latest: string | undefined;
  for (const r of records) {
    if (latest === undefined || r.date > latest) latest = r.date;
  }
  return latest !== undefined && latest < today ? latest : today;
}
