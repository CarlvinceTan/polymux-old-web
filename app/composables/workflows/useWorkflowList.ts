import { computed, useState, useRuntimeConfig, useSupabaseClient, useSupabaseUser } from '#imports'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useWorkspaces } from '../useWorkspaces'
import type { ChatMessage, ChatMessageAttachment } from '../types'

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
  /** Legacy: URLs of browser sub-agents active when the user last left this
   *  workflow. Deprecated in favour of the server-authored last_browser_states
   *  column carried via session_state. Kept on the type so old API responses
   *  still parse. */
  last_viewport_urls?: string[]
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

function draftStorageKey(workspaceID: string): string {
  return `polymux_draft_workflow:${workspaceID}`
}

function pendingPromptKey(sessionID: string): string {
  return `polymux_pending_prompt:${sessionID}`
}

export function useWorkflowList() {
  const realSessions = useState<WorkflowSummary[]>('chat-sessions', () => [])
  const draft = useState<WorkflowSummary | null>('chat-draft-session', () => null)
  // Becomes true once fetchSessions has completed at least once for the
  // current workspace. Lets pages distinguish "still loading" from
  // "loaded, list is empty" so they can validate stale URLs (e.g. a
  // /workflow/{id} that points at a deleted session) without false positives.
  const sessionsLoaded = useState<boolean>('chat-sessions-loaded', () => false)
  // Per-workspace last-fetch timestamp. Suppresses the redundant network
  // round-trip when multiple consumers (SidePanel, dashboard, etc.) call
  // fetchSessions on mount within a short window.
  const sessionsFetchedAt = useState<Record<string, number>>('chat-sessions-fetched-at', () => ({}))
  // Per-session running indicator overrides keyed by session id. Owned by the
  // workflow page's runningKind watch — for the focused workflow it has
  // earlier, finer-grained signals than the server (orchestrator streaming /
  // mid-think / freshly-sent prompt awaiting a reply, none of which the
  // server's Session.RunningKind catches because it only tracks activeRuns
  // and agent statuses). The map sticks until the page explicitly clears
  // the entry (kind === null on unmount / chat idle).
  //
  // For BACKGROUND rows (workflows the user isn't currently focused on),
  // the override is absent and the row falls back to the server-authored
  // running_kind on the WorkflowSummary returned by /sessions — the Go
  // server now persists running_kind alongside is_running, so background
  // chat-driven activity is correctly rendered as a chat spinner instead
  // of being misrepresented as a workflow_run progress arc.
  const runningOverrides = useState<Record<string, { is_running: boolean; running_kind: 'chat' | 'workflow' | null }>>('chat-running-overrides', () => ({}))
  const { authFetch } = useAuthFetch()

  const { currentWorkspaceId, waitForWorkspace } = useWorkspaces()
  const currentUser = useSupabaseUser()

  // Hide other members' in-progress "New Workflow" rows (briefly present during
  // another user's first-prompt commit). The caller's own drafts live purely
  // on the client (with a real uuid) and never appear in this list.
  // If we don't yet know who the caller is (the supabase user ref can be
  // momentarily null right after auth/HMR), skip the filter — otherwise we'd
  // mistakenly drop the caller's own "New Workflow" rows and the sidebar entry
  // would briefly disappear while the backend title is still generating.
  function visibleReal(all: WorkflowSummary[]): WorkflowSummary[] {
    const me = currentUser.value?.id
    if (!me) return all
    return all.filter(s => s.title !== 'New Workflow' || s.user_id === me)
  }

  const sessions = computed<WorkflowSummary[]>(() => {
    const real = realSessions.value
    return draft.value ? [draft.value, ...real] : real
  })

  // Stale-while-revalidate window for the session list. Multiple consumers
  // (SidePanel + dashboard) call fetchSessions on mount; without this they'd
  // each issue a round-trip on every navigation.
  const SESSIONS_STALE_MS = 30_000

  async function fetchSessions(opts?: { force?: boolean }) {
    const wsId = currentWorkspaceId.value
    const cacheKey = wsId ?? '_no_workspace_'
    if (!opts?.force) {
      const last = sessionsFetchedAt.value[cacheKey] ?? 0
      if (Date.now() - last < SESSIONS_STALE_MS) return
    }
    try {
      const path = wsId ? `/sessions?workspace_id=${wsId}` : '/sessions'
      const data = await authFetch<WorkflowSummary[]>(path)
      realSessions.value = visibleReal(data ?? [])
      sessionsFetchedAt.value = { ...sessionsFetchedAt.value, [cacheKey]: Date.now() }
    } catch (err) {
      console.error('[useWorkflowList] fetchSessions failed', err)
    } finally {
      sessionsLoaded.value = true
    }
  }

  function persistDraft(d: WorkflowSummary | null) {
    if (!import.meta.client) return
    const wsId = currentWorkspaceId.value
    if (!wsId) return
    const key = draftStorageKey(wsId)
    if (d) {
      try { sessionStorage.setItem(key, JSON.stringify(d)) } catch {}
    } else {
      try { sessionStorage.removeItem(key) } catch {}
    }
  }

  async function restoreDraft() {
    if (!import.meta.client) return
    const wsId = currentWorkspaceId.value
    if (!wsId) return  // workspace not loaded yet — leave draft untouched
    // If a draft already exists for this workspace in memory, keep it (avoid
    // clobbering a freshly-created draft whose persist hasn't been read back).
    if (draft.value && draft.value.workspace_id === wsId) return

    let stored: WorkflowSummary | null = null
    try {
      const raw = sessionStorage.getItem(draftStorageKey(wsId))
      stored = raw ? (JSON.parse(raw) as WorkflowSummary) : null
    } catch {
      stored = null
    }
    if (!stored) {
      draft.value = null
      return
    }

    // Drafts live in the backend's in-memory registry — server restarts and
    // the idle sweep both wipe them, so a sessionStorage entry can outlive
    // the registry record. Verify the id is still valid before reusing it,
    // otherwise we'd send the user into a WS reconnect loop on an unknown id.
    try {
      await authFetch(`/draft-sessions/${stored.id}`, { method: 'GET' })
      draft.value = stored
    } catch {
      try { sessionStorage.removeItem(draftStorageKey(wsId)) } catch {}
      draft.value = null
    }
  }

  // createDraft asks the backend to allocate a uuid for an unpersisted "New
  // Workflow" sandbox. Idempotent within a tab: if a draft already exists in
  // memory or sessionStorage, we reuse it — otherwise the user would lose
  // already-uploaded files when they navigate away and back within the tab.
  async function createDraft(): Promise<WorkflowSummary | null> {
    if (draft.value) return draft.value
    // Workspace bootstrap (SidePanel.bootstrapData) may still be in flight on
    // post-login navigation — localStorage has no cached workspace id and
    // /workflow/new mounts in parallel with fetchWorkspaces. Wait for the id
    // before erroring so the draft creation isn't lost to that race.
    const wsId = currentWorkspaceId.value ?? await waitForWorkspace()
    if (!wsId) {
      console.error('[useWorkflowList] createDraft: no workspace')
      return null
    }
    // After the wait, try the sessionStorage restore again — if the page
    // called restoreDraft() before the workspace was loaded, that call was a
    // no-op and we'd otherwise create a duplicate draft alongside the stored one.
    if (!draft.value) await restoreDraft()
    if (draft.value) return draft.value
    const me = currentUser.value?.id ?? ''
    try {
      const res = await authFetch<{ id: string }>('/draft-sessions', {
        method: 'POST',
        body: JSON.stringify({ workspace_id: wsId }),
      })
      if (!res?.id) {
        console.error('[useWorkflowList] createDraft: no id in response')
        return null
      }
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
      persistDraft(d)
      return d
    } catch (err) {
      console.error('[useWorkflowList] createDraft failed', err)
      return null
    }
  }

  function dropDraft() {
    draft.value = null
    persistDraft(null)
  }

  // markDraftCommitted moves the in-memory draft into the realSessions list
  // without re-fetching. Called by the new-workflow page right after it sends
  // the first prompt: the backend creates the workflows row synchronously
  // (handleUserMessage → CreateSession with the draft uuid) before persisting
  // the message, so the row is guaranteed to exist by the time the agent
  // page loads.
  function markDraftCommitted(): WorkflowSummary | null {
    const d = draft.value
    if (!d) return null
    const promoted: WorkflowSummary = { ...d, is_draft: false }
    realSessions.value = [promoted, ...realSessions.value.filter(x => x.id !== promoted.id)]
    dropDraft()
    return promoted
  }

  async function renameSession(id: string, title: string) {
    const target = sessions.value.find(s => s.id === id)
    if (target?.is_draft) return
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      await authFetch(`/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmed }),
      })
      // Replace the array entry (and reassign the ref) rather than mutating
      // `s.title` in place. Some downstream computeds — notably the session
      // page's `workflowTitle` and SidePanel's `displaySessions` watcher —
      // miss array-element property mutations but pick up reference swaps.
      const idx = realSessions.value.findIndex(s => s.id === id)
      if (idx !== -1) {
        const next = [...realSessions.value]
        next[idx] = { ...next[idx]!, title: trimmed }
        realSessions.value = next
      }
    } catch (err) {
      // 404 = the row was deleted (e.g. deleteSessionIfEmpty fired on route
      // leave) or RLS-hidden. Title renames are best-effort — a stale title
      // arriving over the WS shouldn't surface as an error.
      const e = err as { status?: number }
      if (e?.status === 404) return
      console.error('[useWorkflowList] renameSession failed', err)
    }
  }

  // Records the workflow page's authoritative view of what's driving the
  // current session — chat-building vs. workflow_run-executing — into the
  // override map the SidePanel merges over server data. Stays decoupled from
  // `realSessions` on purpose: `fetchSessions` and `markDraftCommitted` both
  // rebuild rows without `running_kind`, so writing here would be wiped on
  // the next refresh.
  //
  // Pass a non-null `kind` to assert "this row is running, with this engine."
  // Pass `null` to release the override entirely so the SidePanel falls back
  // to server data — that's the right behaviour both when the local view
  // observes idle (no chat / no workflow_run / no sessionState.is_running)
  // and on page unmount, when we've lost the signals to keep it accurate.
  // Keeping a stale `is_running=false` override would otherwise mask a real
  // cloud-side run that started after we stopped watching.
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
        // Best-effort: server may have already swept the draft. UI proceeds
        // either way so the user can re-create.
        console.warn('[useWorkflowList] cancel draft failed (continuing)', err)
      }
      dropDraft()
      return
    }
    try {
      await authFetch(`/sessions/${id}`, { method: 'DELETE' })
      realSessions.value = realSessions.value.filter(s => s.id !== id)
    } catch (err) {
      console.error('[useWorkflowList] deleteSession failed', err)
    }
  }

  // Fire-and-forget backend delete for a real session that was never committed
  // to (no messages persisted). Called on route leave from an unused workflow.
  async function deleteSessionIfEmpty(id: string) {
    const target = sessions.value.find(s => s.id === id)
    if (target?.is_draft) {
      // Drafts are already covered by deleteSession's draft branch + the
      // server's idle sweep — no fire-and-forget DELETE here.
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
      realSessions.value = realSessions.value.filter(s => s.id !== id)
    }
    catch (err) {
      console.error('[useWorkflowList] deleteSessionIfEmpty failed', err)
    }
  }

  // Persists the list of viewport URLs for `sessionId` so the UI can restore
  // browser sub-agents to those URLs on next visit. Updates the in-memory
  // session row optimistically so consecutive reads see the latest value.
  async function updateSessionViewportUrls(sessionID: string, urls: string[]): Promise<void> {
    const target = sessions.value.find(s => s.id === sessionID)
    // Skip drafts (no DB row) and sessions that are no longer in the list:
    // when the user deletes the active workflow from the sidebar, the page's
    // onBeforeRouteLeave fires this save for the just-deleted id, and the
    // backend 500s because RLS hides the soft-deleted row from the PATCH.
    if (!target || target.is_draft) return
    try {
      await authFetch(`/sessions/${sessionID}/viewport-urls`, {
        method: 'PATCH',
        body: JSON.stringify({ urls }),
      })
    } catch (err) {
      console.error('[useWorkflowList] updateSessionViewportUrls failed', err)
      return
    }
    const s = realSessions.value.find(s => s.id === sessionID)
    if (s) s.last_viewport_urls = urls
  }

  // Returns null when the workflow is forbidden / gone (HTTP 403) so callers
  // can redirect away from a stale URL instead of treating it as an empty
  // history. Empty array still means "loaded, no messages yet".
  //
  // Transient errors (network blip, 5xx, gateway timeout) trigger a single
  // retry with a short delay before giving up. Without the retry, a remount
  // mid-turn that lost the GET to a transient hiccup would silently return []
  // — loadHistory would then short-circuit, and the user would only see the
  // live in-progress partials with all prior turns missing from the panel.
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

      // Mirror the live merge in handleAgentThinking: collapse the bubble's
      // thinking entries into one collapsible AgentAction (latest action,
      // concatenated detail) placed before the agent reply.
      const thinking = meta?.thinking
      if (thinking && thinking.length > 0) {
        const action = thinking[thinking.length - 1]?.action ?? ''
        const detail = thinking.map(t => t.detail ?? '').join('')
        out.push({ role: 'thinking', text: action, action, detail })
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
    restoreDraft,
    renameSession,
    setSessionRunning,
    deleteSession,
    deleteSessionIfEmpty,
    fetchMessages,
    setPendingPrompt,
    consumePendingPrompt,
    updateSessionViewportUrls,
  }
}
