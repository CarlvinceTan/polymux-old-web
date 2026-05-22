/** Monday 00:00:00.000 UTC for the week containing `d` (matches Go `weekStartUTC`). */
export function weekStartUtc(d: Date = new Date()): Date {
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const day = new Date(utcMidnight)
  const wd = day.getUTCDay() // Sun=0 … Sat=6
  const daysSinceMonday = (wd + 6) % 7
  day.setUTCDate(day.getUTCDate() - daysSinceMonday)
  return day
}
