// Shared 5-field cron parser (minute hour dom month dow) used by the schedule
// editor and the recurring-cost projection on the usage dashboard. Supports
// `*`, lists (`1,2`), ranges (`1-5`), and steps (`*/5`, `0-30/10`). Day-of-week
// uses 0–6 (Sun–Sat).

export interface CronSets {
  minutes: Set<number>
  hours: Set<number>
  doms: Set<number>
  months: Set<number>
  dows: Set<number>
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  const parts = field.split(',')
  for (const raw of parts) {
    const p = raw.trim()
    if (!p) return null
    let range = p
    let step = 1
    if (p.includes('/')) {
      const [r, s] = p.split('/')
      if (!r || !s) return null
      range = r
      step = parseInt(s, 10)
      if (!Number.isFinite(step) || step <= 0) return null
    }
    let a = min
    let b = max
    if (range === '*') {
      // full
    }
    else if (range.includes('-')) {
      const [x, y] = range.split('-').map(n => parseInt(n, 10))
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      a = x!
      b = y!
    }
    else {
      const v = parseInt(range, 10)
      if (!Number.isFinite(v)) return null
      a = v
      b = v
    }
    if (a < min || b > max || a > b) return null
    for (let i = a; i <= b; i += step) out.add(i)
  }
  return out.size ? out : null
}

export function parseCron(expr: string): CronSets | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minutes = parseField(parts[0]!, 0, 59)
  const hours = parseField(parts[1]!, 0, 23)
  const doms = parseField(parts[2]!, 1, 31)
  const months = parseField(parts[3]!, 1, 12)
  const dows = parseField(parts[4]!, 0, 6)
  if (!minutes || !hours || !doms || !months || !dows) return null
  return { minutes, hours, doms, months, dows }
}

export function walkRuns(
  sets: CronSets,
  tz: string,
  startMs: number,
  direction: 1 | -1,
  horizonMs: number,
  count: number,
): Date[] {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short', hour12: false,
  })
  const sortedMinutesAsc = [...sets.minutes].sort((a, b) => a - b)
  const sortedMinutesDesc = [...sortedMinutesAsc].reverse()
  const results: Date[] = []
  let t = startMs
  let safety = 20000
  while (safety-- > 0) {
    if (direction > 0 ? t >= horizonMs : t <= horizonMs) break
    const fields: Record<string, string> = {}
    for (const p of fmt.formatToParts(new Date(t))) fields[p.type] = p.value
    const mm = parseInt(fields.minute!, 10)
    const hh = parseInt(fields.hour!, 10)
    const day = parseInt(fields.day!, 10)
    const mon = parseInt(fields.month!, 10)
    const dow = WEEKDAY_MAP[fields.weekday!] ?? -1

    const minuteOk = sets.minutes.has(mm)
    const hourOk = sets.hours.has(hh)
    const rest = sets.doms.has(day) && sets.months.has(mon) && sets.dows.has(dow)

    if (minuteOk && hourOk && rest) {
      results.push(new Date(t))
      if (results.length >= count) break
      t += direction * 60000
      continue
    }

    if (!minuteOk) {
      if (direction > 0) {
        const next = sortedMinutesAsc.find(m => m > mm)
        t += (next !== undefined ? (next - mm) : (60 - mm)) * 60000
      }
      else {
        const prev = sortedMinutesDesc.find(m => m < mm)
        t -= (prev !== undefined ? (mm - prev) : (mm + 1)) * 60000
      }
      continue
    }

    // minute matches but hour/dom/month/dow doesn't — skip remainder of this hour.
    if (direction > 0) {
      t += (60 - mm) * 60000
    }
    else {
      t -= (mm + 1) * 60000
    }
  }
  return results
}

export function computeNextRuns(expr: string, tz: string, count = 12): Date[] {
  const sets = parseCron(expr)
  if (!sets) return []
  const now = Date.now()
  const start = Math.ceil(now / 60000) * 60000
  const horizon = start + 400 * 24 * 60 * 60 * 1000
  return walkRuns(sets, tz, start, 1, horizon, count)
}

export function computePastRuns(expr: string, tz: string, count = 12): Date[] {
  const sets = parseCron(expr)
  if (!sets) return []
  const now = Date.now()
  const end = Math.floor(now / 60000) * 60000 - 60000
  const horizon = end - 400 * 24 * 60 * 60 * 1000
  return walkRuns(sets, tz, end, -1, horizon, count)
}

// Count expected runs over the next N days from `fromMs`. Used by the usage
// dashboard to project monthly recurring cost. Capped at 2000 internally
// because walkRuns has its own safety limit.
export function runsInNextDays(expr: string, tz: string, days: number, fromMs: number = Date.now()): number {
  const sets = parseCron(expr)
  if (!sets) return 0
  const start = Math.ceil(fromMs / 60000) * 60000
  const horizon = start + days * 24 * 60 * 60 * 1000
  return walkRuns(sets, tz, start, 1, horizon, 2000).length
}
