/** Calendar date in a named time zone, as YYYY-MM-DD. */
export function todayInTimeZone(timeZone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
