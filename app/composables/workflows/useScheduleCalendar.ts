import { parseCron, computeRunsInRange } from '~/utils/cron'

// A single concrete run instant placed on the calendar. `recurring` marks runs
// produced by the cron expression (vs. one-off specific dates).
export interface CalendarRun {
  key: string
  ms: number
  date: Date
  automationId: string
  workflowId: string
  workflowName: string
  recurring: boolean
  active: boolean
}

// Cache Intl formatters per timezone — one calendar repaints thousands of times.
const ymdFmtCache = new Map<string, Intl.DateTimeFormat>()
function ymdFmt(tz: string): Intl.DateTimeFormat {
  let f = ymdFmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    ymdFmtCache.set(tz, f)
  }
  return f
}
const hmFmtCache = new Map<string, Intl.DateTimeFormat>()
function hmFmt(tz: string): Intl.DateTimeFormat {
  let f = hmFmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
    hmFmtCache.set(tz, f)
  }
  return f
}

/** `YYYY-MM-DD` for an instant as observed in `tz` — matches CalendarDate.toString(). */
export function dateKeyInTz(ms: number, tz: string): string {
  return ymdFmt(tz).format(new Date(ms))
}
/** Minutes since midnight for an instant as observed in `tz` (0–1439). */
export function minutesOfDayInTz(ms: number, tz: string): number {
  const parts = hmFmt(tz).formatToParts(new Date(ms))
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  const hh = h === 24 ? 0 : h
  return hh * 60 + m
}

export function useScheduleCalendar() {
  const { list } = useScheduledWorkflows()
  const { sessions } = useWorkflowList()

  function nameFor(id: string): string {
    return sessions.value.find(s => s.id === id)?.title || `Workflow ${id.slice(0, 8)}`
  }

  interface RangeOpts { includePaused?: boolean; hidden?: Set<string> }

  // Every run instant in [startMs, endMs). Each schedule expands in its OWN
  // stored timezone (so "09:00 New York" fires correctly); callers bucket the
  // resulting absolute instants into whatever display timezone the grid uses.
  function runsInRange(startMs: number, endMs: number, opts: RangeOpts = {}): CalendarRun[] {
    const out: CalendarRun[] = []
    for (const cfg of list.value) {
      if (cfg.trigger_type !== 'schedule') continue
      if (!cfg.active && !opts.includePaused) continue
      if (opts.hidden?.has(cfg.automation_id)) continue
      const tz = cfg.timezone || 'UTC'
      const flowId = cfg.flow_id || cfg.workflow_id
      const name = nameFor(flowId)
      if (parseCron(cfg.cron_expression)) {
        for (const d of computeRunsInRange(cfg.cron_expression, tz, startMs, endMs)) {
          out.push({ key: `c-${cfg.automation_id}-${d.getTime()}`, ms: d.getTime(), date: d, automationId: cfg.automation_id, workflowId: flowId, workflowName: name, recurring: true, active: cfg.active })
        }
      }
      for (const ms of cfg.one_off_ms) {
        if (ms >= startMs && ms < endMs) {
          out.push({ key: `o-${cfg.automation_id}-${ms}`, ms, date: new Date(ms), automationId: cfg.automation_id, workflowId: flowId, workflowName: name, recurring: false, active: cfg.active })
        }
      }
    }
    out.sort((a, b) => a.ms - b.ms)
    return out
  }

  // The next `limit` runs at or after `fromMs`, across a bounded horizon.
  function upcoming(fromMs: number, limit = 40, hidden?: Set<string>, horizonDays = 120, includePaused = false): CalendarRun[] {
    const horizon = fromMs + horizonDays * 86400000
    return runsInRange(fromMs, horizon, { hidden, includePaused }).filter(r => r.ms >= fromMs).slice(0, limit)
  }

  return { runsInRange, upcoming, nameFor }
}
