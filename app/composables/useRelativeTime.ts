// Returns a reactive `relativeTime(iso)` whose value is empty during SSR and
// the first client render, then populates after mount. Avoids the SSR vs.
// client mismatch caused by the server clock and locale differing from the
// browser's — Vue would otherwise warn "Hydration completed but contains
// mismatches" on any page that displays a relative timestamp.
const SECOND = 1
const MINUTE = 60
const HOUR = 3600
const DAY = 86400
const WEEK = DAY * 7
const MONTH_CUTOFF_DAYS = 30

export function useRelativeTime() {
  const now = ref<number | null>(null)

  onMounted(() => {
    now.value = Date.now()
  })

  function relativeTime(iso: string): string {
    if (now.value === null || !iso) return ''
    const seconds = Math.floor((now.value - new Date(iso).getTime()) / 1000)
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    if (seconds < MINUTE) return rtf.format(-seconds, 'second')
    if (seconds < HOUR) return rtf.format(-Math.floor(seconds / MINUTE), 'minute')
    if (seconds < DAY) return rtf.format(-Math.floor(seconds / HOUR), 'hour')
    if (seconds < WEEK) return rtf.format(-Math.floor(seconds / DAY), 'day')
    return rtf.format(-Math.floor(seconds / WEEK), 'week')
  }

  // Relative ("3 days ago", "2 weeks ago") under `cutoffDays`, then a full
  // absolute date ("May 4, 2026") at/above the cutoff. Default cutoff is one
  // month so the version-history panel reads as "1 day ago / 2 weeks ago" up
  // to ~30 days, then "Mar 14, 2026" beyond that.
  function relativeOrAbsoluteTime(iso: string, cutoffDays = MONTH_CUTOFF_DAYS): string {
    if (now.value === null || !iso) return ''
    const ms = new Date(iso).getTime()
    if (Number.isNaN(ms)) return ''
    const seconds = Math.floor((now.value - ms) / 1000)
    if (seconds < cutoffDays * DAY) return relativeTime(iso)
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(ms))
  }

  return { relativeTime, relativeOrAbsoluteTime }
}
