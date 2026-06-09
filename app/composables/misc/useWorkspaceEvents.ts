import type { RealtimeChannel } from '@supabase/supabase-js'

// Push-invalidation for the workspace name and workflow list.
//
// Subscribes to Supabase Realtime postgres_changes on the `workspaces` and
// `workflows` tables. On any change the client is allowed to see (RLS applies),
// it re-fetches workspace data or invalidates the Vue Query session cache so
// SidePanel sees fresh data without polling.
//
// Requirements:
//   - Realtime must be enabled on the `workspaces` and `workflows` tables in
//     the Supabase dashboard (Table Editor → Replication).
//   - RLS policies on both tables must allow the authenticated user to SELECT
//     their own rows (already required for the Go backend to work).
//
// Singleton: one channel per (user, workspace) pair. Rebuilt on auth or
// workspace change. Same pattern as useActiveMaintenance / useNotifications.

let _channel: RealtimeChannel | null = null
let _subscribedUserId: string | null = null
let _subscribedWorkspaceId: string | null = null
let _watchInstalled = false
// Stored once from a component setup call so we can use them in callbacks
// (useQueryClient uses Vue inject and can't be called outside setup).
let _queryClient: ReturnType<typeof useQueryClient> | null = null
let _fetchWorkspaces: (() => Promise<void>) | null = null

// Trailing-debounce timers so a burst of postgres_changes events collapses into
// a single refetch instead of one per row write. Cleared on teardown.
let _workflowsTimer: ReturnType<typeof setTimeout> | null = null
let _workspacesTimer: ReturnType<typeof setTimeout> | null = null
const INVALIDATE_DEBOUNCE_MS = 800

// Fields the SidePanel actually renders for a workflow row, as
// [realtime payload column (DB name) -> cached /sessions row field (API name)].
// The realtime postgres_changes payload is keyed by raw DB columns (`name`,
// not the API's `title`), so the mapping is load-bearing — comparing the wrong
// key makes every UPDATE look "changed" and re-enables the storm.
// An UPDATE that leaves all of these unchanged (the common case:
// `last_browser_states` / `updated_at` churn from persistBrowserSnapshot during
// a live run) must NOT trigger a /sessions refetch — otherwise an active run
// storms the list with one full refetch per browser-state change.
const SIDEBAR_FIELD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['name', 'title'],
  ['position', 'position'],
  ['is_running', 'is_running'],
  ['running_kind', 'running_kind'],
]

type WorkflowChangePayload = {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE'
  new?: Record<string, unknown>
}

function _workflowChangeIsRelevant(payload: WorkflowChangePayload, wsId: string): boolean {
  if (payload.eventType !== 'UPDATE') return true // INSERT / DELETE always matter
  const next = payload.new
  if (!next || !next.id) return true
  if (next.deleted_at) return true // soft-delete: row must leave the list
  const cached = _queryClient?.getQueryData<Array<Record<string, unknown>>>(['workflow-sessions', wsId])
  const prev = Array.isArray(cached) ? cached.find(r => r.id === next.id) : undefined
  if (!prev) return true // row we don't have yet (or was filtered out) — refetch
  // Normalise nullish: the /sessions API omits null fields (e.g. running_kind),
  // so the cached row has `undefined` where the realtime row has `null`.
  // Treat them as equal — otherwise every UPDATE looks "changed" and storms.
  return SIDEBAR_FIELD_PAIRS.some(([dbField, apiField]) => (next[dbField] ?? null) !== (prev[apiField] ?? null))
}

function _teardown() {
  if (!import.meta.client) return
  if (_workflowsTimer) { clearTimeout(_workflowsTimer); _workflowsTimer = null }
  if (_workspacesTimer) { clearTimeout(_workspacesTimer); _workspacesTimer = null }
  if (!_channel) return
  const supabase = useSupabaseClient()
  supabase.removeChannel(_channel)
  _channel = null
  _subscribedUserId = null
  _subscribedWorkspaceId = null
}

function _subscribe(uid: string, wsId: string) {
  if (!import.meta.client) return
  if (_channel && _subscribedUserId === uid && _subscribedWorkspaceId === wsId) return
  _teardown()

  _subscribedUserId = uid
  _subscribedWorkspaceId = wsId

  const supabase = useSupabaseClient()
  const qc = _queryClient
  const fetchWs = _fetchWorkspaces

  const scheduleWorkspacesRefetch = () => {
    if (_workspacesTimer) return
    _workspacesTimer = setTimeout(() => {
      _workspacesTimer = null
      void fetchWs?.()
    }, INVALIDATE_DEBOUNCE_MS)
  }

  const scheduleSessionsInvalidate = () => {
    if (_workflowsTimer) return
    _workflowsTimer = setTimeout(() => {
      _workflowsTimer = null
      void qc?.invalidateQueries({ queryKey: ['workflow-sessions', wsId] })
    }, INVALIDATE_DEBOUNCE_MS)
  }

  _channel = supabase
    .channel(`workspace-data-${uid}-${wsId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspaces' },
      () => { scheduleWorkspacesRefetch() },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workflows', filter: `workspace_id=eq.${wsId}` },
      (payload) => {
        if (_workflowChangeIsRelevant(payload as WorkflowChangePayload, wsId)) {
          scheduleSessionsInvalidate()
        }
      },
    )
    .subscribe()
}

export function useWorkspaceEvents() {
  if (!import.meta.client) return

  if (!_watchInstalled) {
    _watchInstalled = true

    _queryClient = useQueryClient()
    const { fetchWorkspaces, currentWorkspaceId } = useWorkspaces()
    _fetchWorkspaces = fetchWorkspaces

    const user = useSupabaseUser()

    watch(
      [user, currentWorkspaceId] as const,
      ([u, wsId]) => {
        if (!u || !wsId) {
          _teardown()
          return
        }
        _subscribe(u.id, wsId)
      },
      { immediate: true },
    )
  }
}
