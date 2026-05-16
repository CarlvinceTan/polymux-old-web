import { computed, watch } from 'vue'
import { useState, useRuntimeConfig, useSupabaseClient, useSupabaseUser } from '#imports'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useWorkspaces } from '../account/useWorkspaces'
import type { BrowserSpawnedPayload, ChatMessage, ChatMessageAttachment } from '../types'

// `/workflow/new` is the URL slug for the page that hosts the in-flight draft.
// Drafts themselves carry real workflow uuids — server-allocated by
// POST /draft-sessions — so file uploads and the WebSocket spin up against
// the same id that the workflows row will use once the user sends their
// first prompt. Identity checks ("is this a draft?") use the row's `is_draft`
// flag, never this constant.
export const DRAFT_WORKFLOW_ID = 'new'

export interface WorkflowSummary {
  id: string
  title: string
  user_id: string
  workspace_id: string
  created_at: string
  updated_at: string
  is_draft?: boolean
  /** True while a browser agent is in status=running OR a scheduled run is in
   *  flight. Drives the workflow-list shimmer so users can see at a glance
   *  which workflows are actually executing on the cloud. */
  is_running?: boolean
  /** Distinguishes the kind of activity behind `is_running`:
   *   - 'chat': orchestrator / browser sub-agent driven by the user's chat
   *     turn. Includes orchestrator-spawned agents that keep working in
   *     the background after the user navigates away — those are still
   *     classified as 'chat' so the SidePanel doesn't misrepresent them
   *     as scheduled/run-from-node executions.
   *   - 'workflow': a workflow_run is in flight — manual run-from-dock or
   *     scheduled trigger. Read-only against the workflow definition.
   *  The Go server populates this on every persistBrowserSnapshot via
   *  Session.RunningKind (activeRuns > 0 → workflow, agents running → chat),
   *  so a row hydrated from /sessions REST already carries the correct
   *  classification for background workflows. The SidePanel defaults to
   *  the chat spinner for any is_running row that lacks an explicit
   *  'workflow' classification — flipping that default is what fixed the
   *  long-standing "background chat-driven workflows show progress arc" bug. */
  running_kind?: 'chat' | 'workflow' | null
  /** Persisted per-agent terminal state from the workflow row's
   *  `last_browser_states` jsonb column. Used by the workflow page to pre-paint
   *  the viewport gallery during the WS handshake — without this the gallery
   *  briefly shows an empty state every time the page remounts, even when the
   *  workflow has live or recently-completed browser agents. The WS
   *  `session_state` is still authoritative once it lands. */
  last_browser_states?: BrowserSpawnedPayload[]
}

interface StoredMessage {
  id: string
  session_id: string
  role: string
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface PendingDraftPrompt {
  text: string
  attachments?: ChatMessageAttachment[]
}

/** Serialized concurrent tab-wide draft creation — shared across composable callsites. */
let draftCreationInFlight: Promise<WorkflowSummary | null> | null = null

function draftStorageKey(workspaceId: string): string {
  return `polymux_chat_draft:${workspaceId}`
}

function readStoredDraftId(workspaceId: string): string | null {
  if (!import.meta.client) return null
  try {
    return sessionStorage.getItem(draftStorageKey(workspaceId))
  } catch {
    return null
  }
}

function writeStoredDraftId(workspaceId: string, draftId: string) {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(draftStorageKey(workspaceId), draftId)
  } catch {}
}

function clearStoredDraftId(workspaceId: string) {
  if (!import.meta.client) return
  try {
    sessionStorage.removeItem(draftStorageKey(workspaceId))
  } catch {}
}

function pendingPromptKey(sessionID: string): string {
  return `polymux_pending_prompt:${sessionID}`
}

export function useWorkflowList() {
  const draft = useState<WorkflowSummary | null>('chat-draft-session', () => null)
  const sessionsLoaded = useState<boolean>('chat-sessions-loaded', () => false)
  const workflowEnsureWatchInstalled = useState<boolean>('workflow-ensure-watch-installed', () => false)
  // Per-session running indicator overrides keyed by session id. Owned by the
  // workflow page's runningKind watch — for the focused workflow it has
  // earlier, finer-grained signals than the server (orchestrator streaming /
  // mid-think / freshly-sent prompt awaiting a reply, none of which the
  // server's Session.RunningKind catches because it only tracks activeRuns
  // and agent statuses). The map sticks until the page explicitly clears
  // the entry (kind === null on unmount / chat idle).
  const runningOverrides = useState<Record<string, { is_running: boolean; running_kind: 'chat' | 'workflow' | null }>>('chat-running-overrides', () => ({}))
  const { authFetch } = useAuthFetch()

  const { currentWorkspaceId, waitForWorkspace } = useWorkspaces()
  const currentUser = useSupabaseUser()
  const queryClient = useQueryClient()

  function visibleReal(all: WorkflowSummary[]): WorkflowSummary[] {
    const me = currentUser.value?.id
    if (!me) return all
    return all.filter(s => s.title !== 'New Workflow' || s.user_id === me)
  }

  const query = useQuery({
    queryKey: computed(() => ['workflow-sessions', currentWorkspaceId.value ?? '_no_workspace_']),
    queryFn: async () => {
      const wsId = currentWorkspaceId.value
      const path = wsId ? `/sessions?workspace_id=${wsId}` : '/sessions'
      const data = await authFetch<WorkflowSummary[]>(path)
      sessionsLoaded.value = true
      return visibleReal(data ?? [])
    },
  })

  const realSessions = computed(() => query.data.value ?? [])

  /** GET /draft-sessions/{id} → 204 when the server draft registry still holds this id. */
  async function validateDraftSession(id: string): Promise<boolean> {
    try {
      await authFetch(`/draft-sessions/${encodeURIComponent(id)}`)
      return true
    }
    catch (err) {
      const e = err as { status?: number; statusCode?: number }
      const code = e.status ?? e.statusCode ?? 0
      if (code === 404) return false
      console.warn('[useWorkflowList] validateDraftSession failed', err)
      return false
    }
  }

  const sessions = computed<WorkflowSummary[]>(() => {
    const real = realSessions.value
    return draft.value ? [draft.value, ...real] : real
  })

  async function fetchSessions(opts?: { force?: boolean }) {
    const key = ['workflow-sessions', currentWorkspaceId.value ?? '_no_workspace_']
    if (opts?.force) {
      await queryClient.invalidateQueries({ queryKey: key })
    } else {
      await queryClient.fetchQuery({ queryKey: key })
    }
  }

  // createDraft asks the backend to allocate a uuid for an unpersisted "New
  // Workflow" sandbox. Idempotent within a tab: existing memory draft wins,
  // otherwise we restore from sessionStorage when GET /draft-sessions/{id}
  // succeeds, matching the server's draft registry across reloads.
  async function createDraft(): Promise<WorkflowSummary | null> {
    if (draft.value) return draft.value
    if (draftCreationInFlight) return draftCreationInFlight

    draftCreationInFlight = (async (): Promise<WorkflowSummary | null> => {
      try {
        const wsId = currentWorkspaceId.value ?? await waitForWorkspace()
        if (!wsId) {
          console.error('[useWorkflowList] createDraft: no workspace')
          return null
        }
        if (draft.value) return draft.value

        const me = currentUser.value?.id ?? ''

        const storedId = readStoredDraftId(wsId)
        if (storedId) {
          const alive = await validateDraftSession(storedId)
          if (alive) {
            const now = new Date().toISOString()
            const d: WorkflowSummary = {
              id: storedId,
              title: 'New Workflow',
              user_id: me,
              workspace_id: wsId,
              created_at: now,
              updated_at: now,
              is_draft: true,
            }
            draft.value = d
            return d
          }
          clearStoredDraftId(wsId)
        }

        if (draft.value) return draft.value

        const res = await authFetch<{ id: string }>('/draft-sessions', {
          method: 'POST',
          body: JSON.stringify({ workspace_id: wsId }),
        })
        if (!res?.id) {
          console.error('[useWorkflowList] createDraft: no id in response')
          return null
        }
        writeStoredDraftId(wsId, res.id)
        const now = new Date().toISOString()
        const d: WorkflowSummary = {
          id: res.id,
          title: 'New Workflow',
          user_id: me,
          workspace_id: wsId,
          created_at: now,
          updated_at: now,
          is_draft: true,
        }
        draft.value = d
        return d
      }
      catch (err) {
        console.error('[useWorkflowList] createDraft failed', err)
        return null
      }
      finally {
        draftCreationInFlight = null
      }
    })()

    return draftCreationInFlight
  }

  function dropDraft() {
    const wsId = draft.value?.workspace_id
    draft.value = null
    if (wsId) clearStoredDraftId(wsId)
  }

  /** `/sessions` omits unpersisted drafts; keep at least one sidebar row after reload or workspace fetch. */
  async function ensureAtLeastOneWorkflow() {
    if (!import.meta.client) return
    if (!sessionsLoaded.value || query.isError.value) return
    const wsId = currentWorkspaceId.value
    if (!wsId || draft.value || realSessions.value.length > 0) return
    await createDraft()
  }

  if (import.meta.client && !workflowEnsureWatchInstalled.value) {
    workflowEnsureWatchInstalled.value = true
    watch(
      () => ({
        loaded: sessionsLoaded.value,
        fetching: query.isFetching.value,
        err: query.isError.value,
        ws: currentWorkspaceId.value,
        empty: realSessions.value.length === 0,
        hasDraft: !!draft.value,
      }),
      async (s) => {
        if (!s.loaded || s.fetching || s.err || !s.ws || !s.empty || s.hasDraft) return
        await createDraft()
      },
      { flush: 'post' },
    )
  }

  // markDraftCommitted moves the in-memory draft into the query cache
  // without re-fetching. Called by the new-workflow page right after it sends
  // the first prompt: the backend creates the workflows row synchronously
  // (handleUserMessage → CreateSession with the draft uuid) before persisting
  // the message, so the row is guaranteed to exist by the time the agent
  // page loads.
  function markDraftCommitted(): WorkflowSummary | null {
    const d = draft.value
    if (!d) return null
    const promoted: WorkflowSummary = { ...d, is_draft: false }
    const key = ['workflow-sessions', currentWorkspaceId.value ?? '_no_workspace_']
    queryClient.setQueryData(key, (old: WorkflowSummary[] | undefined) => {
      const arr = old ?? []
      return [promoted, ...arr.filter(x => x.id !== promoted.id)]
    })
    dropDraft()
    return promoted
  }

  async function renameSession(id: string, title: string) {
    const target = sessions.value.find(s => s.id === id)
    if (target?.is_draft) return
    const trimmed = title.trim()
    if (!trimmed) return

    const key = ['workflow-sessions', currentWorkspaceId.value ?? '_no_workspace_']

    // Snapshot for rollback
    const previous = queryClient.getQueryData<WorkflowSummary[]>(key)

    queryClient.setQueryData(key, (old: WorkflowSummary[] | undefined) => {
      const arr = [...(old ?? [])]
      const idx = arr.findIndex(s => s.id === id)
      if (idx !== -1) arr[idx] = { ...arr[idx]!, title: trimmed }
      return arr
    })

    try {
      await authFetch(`/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmed }),
      })
    } catch (err) {
      if (previous) queryClient.setQueryData(key, previous)
      const e = err as { status?: number }
      if (e?.status === 404) return
      console.error('[useWorkflowList] renameSession failed', err)
    }
  }

  // Records the workflow page's authoritative view of what's driving the
  // current session — chat-building vs. workflow_run-executing — into the
  // override map the SidePanel merges over server data. Stays decoupled from
  // the query cache on purpose: `fetchSessions` and `markDraftCommitted` both
  // rebuild rows without `running_kind`, so writing here would be wiped on
  // the next refresh.
  function setSessionRunning(id: string, kind: 'chat' | 'workflow' | null) {
    if (!id) return
    if (kind == null) {
      if (!(id in runningOverrides.value)) return
      const next = { ...runningOverrides.value }
      delete next[id]
      runningOverrides.value = next
      return
    }
    const cur = runningOverrides.value[id]
    if (cur && cur.is_running === true && cur.running_kind === kind) return
    runningOverrides.value = {
      ...runningOverrides.value,
      [id]: { is_running: true, running_kind: kind },
    }
  }

  async function deleteSession(id: string) {
    const target = sessions.value.find(s => s.id === id)
    if (target?.is_draft) {
      try {
        await authFetch(`/draft-sessions/${id}`, { method: 'DELETE' })
      } catch (err) {
        console.warn('[useWorkflowList] cancel draft failed (continuing)', err)
      }
      dropDraft()
      return
    }
    try {
      await authFetch(`/sessions/${id}`, { method: 'DELETE' })
      const key = ['workflow-sessions', currentWorkspaceId.value ?? '_no_workspace_']
      queryClient.setQueryData(key, (old: WorkflowSummary[] | undefined) =>
        (old ?? []).filter(s => s.id !== id),
      )
    } catch (err) {
      console.error('[useWorkflowList] deleteSession failed', err)
    }
  }

  // Fire-and-forget backend delete for a real session that was never committed
  // to (no messages persisted). Called on route leave from an unused workflow.
  async function deleteSessionIfEmpty(id: string) {
    const target = sessions.value.find(s => s.id === id)
    if (target?.is_draft) {
      dropDraft()
      return
    }
    const supabase = useSupabaseClient()
    const config = useRuntimeConfig()
    const baseURL = config.public.serverUrl as string
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch(`${baseURL}/sessions/${id}`, {
        method: 'DELETE',
        keepalive: true,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      const key = ['workflow-sessions', currentWorkspaceId.value ?? '_no_workspace_']
      queryClient.setQueryData(key, (old: WorkflowSummary[] | undefined) =>
        (old ?? []).filter(s => s.id !== id),
      )
    }
    catch (err) {
      console.error('[useWorkflowList] deleteSessionIfEmpty failed', err)
    }
  }

  // Returns null when the workflow is forbidden / gone (HTTP 403) so callers
  // can redirect away from a stale URL instead of treating it as an empty
  // history. Empty array still means "loaded, no messages yet".
  async function fetchMessages(sessionId: string, agentId?: string): Promise<ChatMessage[] | null> {
    const target = sessions.value.find(s => s.id === sessionId)
    if (target?.is_draft) return []

    let path = `/sessions/${sessionId}/messages`
    if (agentId) path += `?agent_id=${encodeURIComponent(agentId)}`

    let data: StoredMessage[] | null = null
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        data = await authFetch<StoredMessage[]>(path)
        lastErr = null
        break
      } catch (err) {
        const e = err as { status?: number }
        if (e?.status === 403) return null
        lastErr = err
        if (attempt === 0) {
          console.warn('[useWorkflowList] fetchMessages transient failure, retrying', { path, status: e?.status, err })
          await new Promise(r => setTimeout(r, 400))
        }
      }
    }
    if (lastErr) {
      console.error('[useWorkflowList] fetchMessages failed after retry', { path, err: lastErr })
      return []
    }
    if (!data || data.length === 0) return []

    type Meta = {
      attachments?: ChatMessageAttachment[]
      thinking?: { action?: string; detail?: string }[]
    }

    const out: ChatMessage[] = []
    for (const m of data) {
      if (m.role !== 'user' && m.role !== 'agent' && m.role !== 'assistant') continue
      const meta = m.metadata as Meta | undefined

      if (m.role === 'user') {
        out.push({
          role: 'user',
          text: m.content,
          id: m.id,
          attachments: meta?.attachments,
        })
        continue
      }

      out.push({
        role: 'agent',
        text: m.content,
        id: m.id,
        attachments: meta?.attachments,
      })
    }

    return out
  }

  function setPendingPrompt(sessionID: string, prompt: PendingDraftPrompt) {
    if (!import.meta.client) return
    try {
      sessionStorage.setItem(pendingPromptKey(sessionID), JSON.stringify(prompt))
    } catch {}
  }

  function consumePendingPrompt(sessionID: string): PendingDraftPrompt | null {
    if (!import.meta.client) return null
    try {
      const raw = sessionStorage.getItem(pendingPromptKey(sessionID))
      if (!raw) return null
      sessionStorage.removeItem(pendingPromptKey(sessionID))
      return JSON.parse(raw) as PendingDraftPrompt
    } catch {
      return null
    }
  }

  return {
    sessions,
    realSessions,
    sessionsLoaded,
    draft,
    runningOverrides,
    fetchSessions,
    createDraft,
    dropDraft,
    markDraftCommitted,
    renameSession,
    setSessionRunning,
    deleteSession,
    deleteSessionIfEmpty,
    fetchMessages,
    setPendingPrompt,
    consumePendingPrompt,
    ensureAtLeastOneWorkflow,
  }
}
