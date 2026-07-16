import type { AgentAccessPolicy, CredentialType, PasswordEntry } from './usePasswords'
import type { SignInEntry } from './useSignIns'

// Vault-B unified credential model. A workspace stores three kinds of
// authentication surface:
//   - 'login'        — a site credential (url + username + secret password)
//   - 'secret'       — a free-standing API key / token (name + value)
//   - 'saved_signin' — cookies + localStorage captured by an agent (read-only)
//
// 'login' and 'secret' are rows in workspace_passwords (the Postgres
// credential_type enum). 'saved_signin' is a UI-only kind that wraps the
// workspace_browser_states rows surfaced by useSignIns(). Merging them here
// lets the credentials table render every saved authentication in one place
// while keeping the two source composables (and their query caches) intact.
export type CredentialKind = CredentialType | 'saved_signin'

export interface CredentialEntry {
  // For login/secret this is the workspace_passwords row id; for saved_signin
  // it is the origin (which is unique per workspace and stable for forget()).
  id: string
  kind: CredentialKind
  // Display name. login → user-given name; secret → key name; sign-in → host.
  name: string
  // Site host (login + sign-in) or undefined for secrets.
  url?: string
  // Username/scope line: login → username; secret → optional scope; sign-in → host.
  username?: string
  // Agent-access policy. Saved sign-ins are always preloaded by the agent, so
  // they read as 'allowed' and are not editable from the table.
  agentAccess: AgentAccessPolicy
  // Whether the access policy can be changed (false for saved sign-ins).
  agentAccessEditable: boolean
  usageCount: number
  lastUsedAt: string | null
  lastUsedBy: string | null
  createdBy: string | null
  createdAt: string
  // The weak-password flag (login only); used by the existing weak filter.
  weak: boolean
}

export interface ListCredentialsOptions {
  kind?: CredentialKind
  agentAccess?: AgentAccessPolicy
  search?: string
}

function passwordToCredential(p: PasswordEntry): CredentialEntry {
  return {
    id: p.id,
    kind: p.type,
    name: p.name,
    url: p.type === 'login' ? p.url : undefined,
    username: p.type === 'login' ? p.username : undefined,
    agentAccess: p.agentAccess,
    agentAccessEditable: true,
    usageCount: p.usageCount,
    lastUsedAt: p.lastUsed,
    lastUsedBy: p.lastUsedBy,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    weak: p.weak,
  }
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host
  }
  catch {
    return origin
  }
}

function signInToCredential(s: SignInEntry): CredentialEntry {
  const host = hostOf(s.origin)
  return {
    id: s.origin,
    kind: 'saved_signin',
    name: host,
    url: s.origin,
    username: host,
    // A captured sign-in is, by definition, already trusted to load into every
    // managed browser — there is no per-use gate, so it reads as allowed and
    // the only management action is "Forget".
    agentAccess: 'allowed',
    agentAccessEditable: false,
    usageCount: s.useCount,
    lastUsedAt: s.lastUsedAt ?? s.lastSeenAt,
    lastUsedBy: s.lastUsedBy,
    createdBy: s.capturedBy,
    createdAt: s.lastSeenAt,
    weak: false,
  }
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query.trim()) return true
  const lo = text.toLowerCase()
  const q = query.toLowerCase().trim()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lo.indexOf(q[qi]!, ti)
    if (idx === -1) return false
    ti = idx + 1
  }
  return true
}

export function useCredentials() {
  const supabase = useSupabaseClient()
  const { currentWorkspace } = useWorkspaces()
  const queryClient = useQueryClient()

  const {
    passwords,
    loading: passwordsLoading,
    fetchPasswords,
    addPassword,
    updatePassword,
    deletePassword,
    importPasswords,
  } = usePasswords()

  const {
    signIns,
    loading: signInsLoading,
    fetchSignIns,
    forgetOrigin,
  } = useSignIns()

  const wsId = computed(() => currentWorkspace.value?.id)
  const error = ref<string | null>(null)

  // Only owners and admins may change a credential's agent-access policy.
  const canManageAccess = computed(() => {
    const role = currentWorkspace.value?.role
    return role === 'owner' || role === 'admin'
  })

  // The merged, unfiltered credential list — newest-ish first within each
  // source (passwords already arrive created_at desc; sign-ins last_seen desc).
  const credentials = computed<CredentialEntry[]>(() => [
    ...passwords.value.map(passwordToCredential),
    ...signIns.value.map(signInToCredential),
  ])

  const loading = computed(() => passwordsLoading.value || signInsLoading.value)

  function counts() {
    const list = credentials.value
    const byKind = {
      all: list.length,
      login: list.filter(c => c.kind === 'login').length,
      secret: list.filter(c => c.kind === 'secret').length,
      saved_signin: list.filter(c => c.kind === 'saved_signin').length,
    }
    const byAccess = {
      all: list.length,
      allowed: list.filter(c => c.agentAccess === 'allowed').length,
      consent_required: list.filter(c => c.agentAccess === 'consent_required').length,
      blocked: list.filter(c => c.agentAccess === 'blocked').length,
    }
    return { byKind, byAccess }
  }

  // Client-side filtering keeps the unified list reactive without round-tripping
  // the get_workspace_credentials RPC for every filter toggle. (That RPC backs
  // server-side filtering for callers that need it, e.g. agent tooling.)
  function listCredentials(opts: ListCredentialsOptions = {}): CredentialEntry[] {
    let result = credentials.value

    if (opts.kind) {
      result = result.filter(c => c.kind === opts.kind)
    }
    if (opts.agentAccess) {
      result = result.filter(c => c.agentAccess === opts.agentAccess)
    }
    if (opts.search?.trim()) {
      const term = opts.search
      result = result.filter(
        c =>
          fuzzyMatch(c.name, term) ||
          fuzzyMatch(c.url ?? '', term) ||
          fuzzyMatch(c.username ?? '', term),
      )
    }
    return result
  }

  async function fetchCredentials(o?: { force?: boolean }) {
    await Promise.all([fetchPasswords(o), fetchSignIns(o)])
  }

  // Owner/admin-only. Writes the new policy through update_credential_agent_access
  // and patches both the passwords and unified credentials query caches so the
  // chip reflects the change immediately.
  async function updateAgentAccess(
    credentialId: string,
    policy: AgentAccessPolicy,
  ): Promise<boolean> {
    error.value = null
    try {
      const { error: err } = await supabase.rpc('update_credential_agent_access', {
        p_credential_id: credentialId,
        p_agent_access: policy,
      })
      if (err) throw err
      const id = wsId.value
      if (id) {
        const patch = (old: PasswordEntry[] | undefined) => {
          const arr = [...(old ?? [])]
          const idx = arr.findIndex(p => p.id === credentialId)
          if (idx !== -1) arr[idx] = { ...arr[idx]!, agentAccess: policy }
          return arr
        }
        queryClient.setQueryData(['workspace-passwords', id], patch)
        queryClient.setQueryData(['workspace-credentials', id], patch)
      }
      return true
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to update agent access'
      return false
    }
  }

  async function forgetCredential(credential: CredentialEntry): Promise<boolean> {
    if (credential.kind === 'saved_signin') {
      return forgetOrigin(credential.id)
    }
    return deletePassword(credential.id)
  }

  return {
    credentials,
    loading,
    error,
    canManageAccess,
    counts,
    listCredentials,
    fetchCredentials,
    updateAgentAccess,
    // Re-exported source actions so the page works through one composable.
    addPassword,
    updatePassword,
    deletePassword,
    importPasswords,
    forgetOrigin,
    forgetCredential,
  }
}
