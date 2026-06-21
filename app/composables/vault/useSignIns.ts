import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

// Workspace-shared browser sign-ins (cookies + localStorage captured by the
// agent during a session and preloaded into every subsequent managed browser
// in the workspace). The vault/passwords page lists these alongside the
// classic workspace_passwords rows so a member sees every saved authentication
// surface in one place.
//
// Only metadata is loaded here — the encrypted cookie values and localStorage
// blobs never come down to the client. RLS lets workspace_members SELECT;
// member+ DELETE. The capture path is server-side (Go), so this composable
// only handles read + forget.

export interface SignInEntry {
  origin: string
  capturedBy: string | null
  lastSeenAt: string
  lastUsedAt: string | null
  lastUsedBy: string | null
  useCount: number
  enabled: boolean
}

interface WorkspaceBrowserStateRow {
  id: string
  workspace_id: string
  origin: string
  captured_by: string | null
  last_seen_at: string
  last_used_at: string | null
  last_used_by: string | null
  use_count: number
  enabled: boolean
}

function toEntry(row: WorkspaceBrowserStateRow): SignInEntry {
  return {
    origin: row.origin,
    capturedBy: row.captured_by,
    lastSeenAt: row.last_seen_at,
    lastUsedAt: row.last_used_at,
    lastUsedBy: row.last_used_by,
    useCount: row.use_count,
    enabled: row.enabled,
  }
}

// Single source of truth for the sign-ins listing fetch + row→entry mapping.
// Shared by the live useQuery below and the warm-cache prefetch hook so both
// populate the ['workspace-signins', wsId] slot with the SAME mapped shape.
export async function fetchSignInEntries(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<SignInEntry[]> {
  const { data, error } = await supabase
    .from('workspace_browser_states')
    .select('id, workspace_id, origin, captured_by, last_seen_at, last_used_at, last_used_by, use_count, enabled')
    .eq('workspace_id', workspaceId)
    .order('last_seen_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toEntry)
}

export function prefetchSignIns(
  queryClient: ReturnType<typeof useQueryClient>,
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: ['workspace-signins', workspaceId],
    queryFn: () => fetchSignInEntries(supabase, workspaceId),
  })
}

export function useSignIns() {
  const supabase = useSupabaseClient()
  const { currentWorkspace } = useWorkspaces()
  const queryClient = useQueryClient()

  const wsId = computed(() => currentWorkspace.value?.id)

  const query = useQuery({
    queryKey: computed(() => ['workspace-signins', wsId.value]),
    queryFn: async () => {
      const id = wsId.value
      if (!id) return []
      return fetchSignInEntries(supabase, id)
    },
    enabled: computed(() => !!wsId.value),
  })

  const signIns = computed(() => query.data.value ?? [])
  const loading = computed(() => query.isLoading.value)
  const error = computed(() => query.error.value instanceof Error ? query.error.value.message : query.error.value ? String(query.error.value) : null)

  async function fetchSignIns(opts?: { force?: boolean }) {
    if (opts?.force) {
      await queryClient.invalidateQueries({ queryKey: ['workspace-signins', wsId.value] })
    } else {
      await queryClient.fetchQuery({ queryKey: ['workspace-signins', wsId.value] })
    }
  }

  async function forgetOrigin(origin: string): Promise<boolean> {
    const id = wsId.value
    if (!id) return false
    try {
      const { error: err } = await supabase.rpc('delete_workspace_browser_origin', {
        p_workspace_id: id,
        p_origin: origin,
      })
      if (err) throw err
      queryClient.setQueryData(['workspace-signins', id], (old: SignInEntry[] | undefined) =>
        (old ?? []).filter(s => s.origin !== origin),
      )
      return true
    }
    catch (e: unknown) {
      return false
    }
  }

  return {
    signIns,
    loading,
    error,
    fetchSignIns,
    forgetOrigin,
  }
}
