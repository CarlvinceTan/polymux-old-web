import { computed } from 'vue'
import { useState, useRuntimeConfig, useSupabaseClient, useSupabaseUser } from '#imports'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useWorkspaces } from '../account/useWorkspaces'
import type { BrowserSpawnedPayload, ChatMessage, ChatMessageAttachment } from '../types'
import type { WorkflowGraph } from './useWorkflows'

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
  /** Server-controlled ordering for the Sidebar. Higher = closer to the top.
   *  Auto-assigned to max+1 on insert; the only client-driven mutation is the
   *  reorder helper below, called from the Sidebar's drag handler. */
  position?: number
  is_draft?: boolean
  /** True while a browser agent is in status=running OR a scheduled run is in
   *  flight. Drives the workflow-list shimmer so users can see at a glance
   *  which workflows are actually executing on the cloud. */
  is_running?: boolean
  /** Distinguishes the kind of activity behind `is_running`:
   *   - 'chat': orchestrator / browser sub-agent driven by the user's chat
   *     turn. Includes orchestrator-spawned agents that keep working in
   *     the background after the user navigates away — those are still
   *     classified as 'chat' so the Sidebar doesn't misrepresent them
   *     as scheduled/run-from-node executions.
   *   - 'workflow': a workflow_run is in flight — manual run-from-dock or
   *     scheduled trigger. Read-only against the workflow definition.
   *  The Go server populates this on every persistBrowserSnapshot via
   *  Session.RunningKind (activeRuns > 0 → workflow, agents running → chat),
   *  so a row hydrated from /sessions REST already carries the correct
   *  classification for background workflows. The Sidebar defaults to
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
  const supabase = useSupabaseClient()
  const serverBaseURL = useRuntimeConfig().public.serverUrl as string

  function visibleReal(all: WorkflowSummary[]): WorkflowSummary[] {
    const me = currentUser.value?.id
    if (!me) return all
    return all.filter(s => s.title !== 'New Workflow' || s.user_id === me)
  }

  const query = useQuery({
    queryKey: computed(() => ['workflow-sessions', currentWorkspaceId.value ?? '_no_workspace_']),
    // Avoid an unfiltered /sessions fetch before the workspace id is known —
    // that pollutes the cache key and races with Sidebar bootstrap when
    // fetchWorkspaces() is still correcting a stale localStorage id.
    enabled: computed(() => !!currentWorkspaceId.value),
    // Supabase Realtime (useWorkspaceEvents) push-invalidates this cache on
    // sidebar-relevant workflow changes, so we don't need aggressive polling.
    // A finite staleTime (not Infinity) keeps refetch-on-mount/focus as a
    // safety net: if the realtime socket silently drops, the list still
    // self-heals on the next navigation/focus instead of staying stale until
    // a hard reload (the pre-realtime behaviour).
    staleTime: 30_000,
    queryFn: async () => {
      const wsId = currentWorkspaceId.value
      if (!wsId) return []
      const data = await authFetch<WorkflowSummary[]>(`/sessions?workspace_id=${wsId}`)
      sessionsLoaded.value = true
      return visibleReal(data ?? [])
    },
  })

  const realSessions = computed(() => query.data.value ?? [])

  /** GET /draft-sessions/{id} → 204 when the server draft registry still holds this id.
   *  Uses native fetch instead of authFetch/$fetch so a stale-draft 404 doesn't
   *  throw through ofetch and generate a noisy console stack trace via the
   *  tracing middleware. */
  async function validateDraftSession(id: string): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return false
      const res = await fetch(`${serverBaseURL}/draft-sessions/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      return res.ok
    }
    catch {
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

  // Creates a durable empty workflow immediately. Unlike createDraft(), this
  // is used by contextual actions that need a real row straight away (for
  // example, creating a flow inside a folder before the first prompt).
  async function createWorkflow(title = 'New Workflow'): Promise<WorkflowSummary | null> {
    try {
      const wsId = currentWorkspaceId.value ?? await waitForWorkspace()
      if (!wsId) return null
      const created = await authFetch<WorkflowSummary>('/sessions', {
        method: 'POST',
        body: JSON.stringify({ title, workspace_id: wsId }),
      })
      if (!created?.id) return null
      const key = ['workflow-sessions', wsId]
      queryClient.setQueryData(key, (old: WorkflowSummary[] | undefined) => [
        created,
        ...(old ?? []).filter(item => item.id !== created.id),
      ])
      return created
    }
    catch (error) {
      console.error('[useWorkflowList] createWorkflow failed', error)
      return null
    }
  }

  function dropDraft() {
    const wsId = draft.value?.workspace_id
    draft.value = null
    if (wsId) clearStoredDraftId(wsId)
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

  // reorderWorkflows persists the Sidebar's drag-drop result. `orderedIds`
  // is the visible list top-down (excluding the draft, which is always pinned
  // and not persisted server-side). Optimistically rewrites the query cache so
  // the Sidebar doesn't snap back while the PATCH is in flight; rolls back
  // on failure. Server re-assigns `position` for every id in one call via the
  // reorder_workflows RPC.
  async function reorderWorkflows(orderedIds: string[]) {
    const wsId = currentWorkspaceId.value
    if (!wsId || orderedIds.length === 0) return
    const key = ['workflow-sessions', wsId]
    const previous = queryClient.getQueryData<WorkflowSummary[]>(key)

    queryClient.setQueryData(key, (old: WorkflowSummary[] | undefined) => {
      const arr = old ?? []
      const byId = new Map(arr.map(s => [s.id, s]))
      const reordered: WorkflowSummary[] = []
      const total = orderedIds.length
      for (let i = 0; i < total; i++) {
        const s = byId.get(orderedIds[i]!)
        if (!s) continue
        reordered.push({ ...s, position: total - i })
        byId.delete(orderedIds[i]!)
      }
      // Surface anything the client didn't include (rows it never knew about
      // because of a stale view) at the bottom so they don't vanish from the
      // sidebar while the next refetch reconciles.
      for (const s of byId.values()) reordered.push(s)
      return reordered
    })

    try {
      await authFetch('/sessions/order', {
        method: 'PATCH',
        body: JSON.stringify({ workspace_id: wsId, order: orderedIds }),
      })
    } catch (err) {
      if (previous) queryClient.setQueryData(key, previous)
      console.error('[useWorkflowList] reorderWorkflows failed', err)
    }
  }

  // Reorder only the flows that share one folder scope. Foldered and unfiled
  // rows each keep an independent order, so dragging in one group cannot
  // rewrite the positions of rows in another group.
  async function reorderWorkflowScope(folderId: string | null, orderedIds: string[]) {
    const wsId = currentWorkspaceId.value
    if (!wsId || orderedIds.length === 0) return
    const key = ['workflow-sessions', wsId]
    const previous = queryClient.getQueryData<WorkflowSummary[]>(key)

    queryClient.setQueryData(key, (old: WorkflowSummary[] | undefined) => {
      const arr = old ?? []
      const byId = new Map(arr.map(s => [s.id, s]))
      const reordered: WorkflowSummary[] = []
      const total = orderedIds.length
      for (let i = 0; i < total; i++) {
        const session = byId.get(orderedIds[i]!)
        if (!session) continue
        reordered.push({ ...session, position: total - i })
        byId.delete(orderedIds[i]!)
      }
      for (const session of byId.values()) reordered.push(session)
      return reordered
    })

    try {
      await $fetch(`/api/workspaces/${wsId}/flows/order`, {
        method: 'PATCH',
        body: { folder_id: folderId, order: orderedIds },
      })
    }
    catch (error) {
      if (previous) queryClient.setQueryData(key, previous)
      console.error('[useWorkflowList] reorderWorkflowScope failed', error)
    }
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
      if (getErrorStatus(err) === 404) return
      console.error('[useWorkflowList] renameSession failed', err)
    }
  }

  // Records the workflow page's authoritative view of what's driving the
  // current session — chat-building vs. workflow_run-executing — into the
  // override map the Sidebar merges over server data. Stays decoupled from
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

  // Deletes every persisted workflow in the current workspace (Settings → Data →
  // "Clear all workflows"). Best-effort per-session DELETE; returns counts so the
  // caller can surface a summary. Drops succeeded rows from the cache and
  // refetches to reconcile any failures.
  async function clearAllSessions(): Promise<{ deleted: number; failed: number }> {
    const ids = realSessions.value.map(s => s.id)
    let deleted = 0
    let failed = 0
    const deletedIds: string[] = []
    for (const id of ids) {
      try {
        await authFetch(`/sessions/${id}`, { method: 'DELETE' })
        deleted++
        deletedIds.push(id)
      } catch (err) {
        failed++
        console.error('[useWorkflowList] clearAllSessions: delete failed', id, err)
      }
    }
    const key = ['workflow-sessions', currentWorkspaceId.value ?? '_no_workspace_']
    queryClient.setQueryData(key, (old: WorkflowSummary[] | undefined) =>
      (old ?? []).filter(s => !deletedIds.includes(s.id)),
    )
    await queryClient.invalidateQueries({ queryKey: key })
    return { deleted, failed }
  }

  // Fire-and-forget backend delete for a real session that was never committed
  // to (no messages persisted). Called on route leave from an unused workflow.
  async function deleteSessionIfEmpty(id: string) {
    const target = sessions.value.find(s => s.id === id)
    if (target?.is_draft) {
      dropDraft()
      return
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch(`${serverBaseURL}/sessions/${id}`, {
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
        const status = getErrorStatus(err)
        if (status === 403) return null
        lastErr = err
        if (attempt === 0) {
          console.warn('[useWorkflowList] fetchMessages transient failure, retrying', { path, status, err })
          await new Promise(r => setTimeout(r, 400))
        }
      }
    }
    if (lastErr) {
      console.error('[useWorkflowList] fetchMessages failed after retry', { path, err: lastErr })
      return []
    }
    if (!data || data.length === 0) return []

    type CardStatus = 'pending' | 'completed' | 'cancelled'
    type Meta = {
      attachments?: ChatMessageAttachment[]
      thinking?: { action?: string; detail?: string }[]
      // Inline human-in-the-loop cards persisted server-side on resolve so the
      // completed/cancelled credential & OTP cards survive a page reload (the
      // live cards are otherwise transient WS events). See the polymux server's
      // OnResolveCredential / OnResolveOtp wiring.
      credential_request?: {
        msg_id: string
        site: string
        purpose: string
        suggested_username?: string
        status: CardStatus
      }
      otp_request?: {
        msg_id: string
        site: string
        purpose: string
        status: CardStatus
      }
      // Inline workflow-graph preview persisted server-side when the
      // orchestrator calls ShowWorkflow, so the clickable peek card survives a
      // reload. See the polymux server's OnShowWorkflow wiring.
      workflow_peek?: {
        msg_id: string
        graph: WorkflowGraph
      }
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

      if (meta?.credential_request) {
        const cr = meta.credential_request
        out.push({
          role: 'agent',
          text: '',
          id: m.id,
          credentialRequest: {
            msgId: cr.msg_id,
            site: cr.site,
            purpose: cr.purpose,
            suggestedUsername: cr.suggested_username,
            status: cr.status,
          },
        })
        continue
      }

      if (meta?.otp_request) {
        const or = meta.otp_request
        out.push({
          role: 'agent',
          text: '',
          id: m.id,
          otpRequest: {
            msgId: or.msg_id,
            site: or.site,
            purpose: or.purpose,
            status: or.status,
          },
        })
        continue
      }

      if (meta?.workflow_peek) {
        const wp = meta.workflow_peek
        out.push({
          role: 'agent',
          text: '',
          id: m.id,
          flowPeek: {
            msgId: wp.msg_id,
            graph: wp.graph,
          },
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
    createWorkflow,
    dropDraft,
    markDraftCommitted,
    renameSession,
    reorderWorkflows,
    reorderWorkflowScope,
    setSessionRunning,
    deleteSession,
    deleteSessionIfEmpty,
    clearAllSessions,
    fetchMessages,
    setPendingPrompt,
    consumePendingPrompt,
  }
}
