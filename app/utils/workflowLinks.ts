// Workflow → PostHog session-replay deep link, for the judgment detail's
// "Recording" link. Ported from the console. Framework-agnostic.

export type RunWindow = { since: string | null, until: string | null }
type RunRow = { started_at?: string, finished_at?: string }

// Earliest started_at and latest finished_at across the runs; in-flight runs
// (no finished_at) extend the upper bound to now so the window stays useful.
export function workflowTimeWindow(runs: RunRow[]): RunWindow {
  if (!runs?.length) return { since: null, until: null }
  let since: string | null = null
  let until: string | null = null
  for (const r of runs) {
    if (r.started_at && (since === null || r.started_at < since)) since = r.started_at
    const end = r.finished_at ?? null
    if (end && (until === null || end > until)) until = end
  }
  if (since && !until) until = new Date().toISOString()
  return { since, until }
}

// PostHog Session Replay deep link filtered by distinct_id (the workflow
// author's user_id) and the run window. Returns null when host/distinctId is
// missing so callers can hide the link.
export function posthogReplayUrl(
  host: string | null | undefined,
  distinctId: string | null | undefined,
  win: RunWindow,
  projectId?: string | null,
): string | null {
  if (!host || !distinctId) return null
  const cleanHost = host.replace(/\/+$/, '')
  const filters: Record<string, unknown> = {
    filter_test_accounts: false,
    properties: [
      { key: 'distinct_id', type: 'person', value: [distinctId], operator: 'exact' },
    ],
  }
  if (win.since) filters.date_from = win.since
  if (win.until) filters.date_to = win.until
  const prefix = projectId ? `${cleanHost}/project/${encodeURIComponent(projectId)}` : cleanHost
  return `${prefix}/replay/home?filters=${encodeURIComponent(JSON.stringify(filters))}`
}
