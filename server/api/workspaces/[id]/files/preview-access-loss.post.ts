import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { resolveWorkspaceId } from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/preview-access-loss
// Body: { source: 'google-drive' }
//
// Returns the workspace members and share-grantee users who will lose access
// to files in `source` once they're migrated to the caller's device (i.e.
// flipped to backend='local'). The UI shows this list in the migration
// confirm modal so the user can back out.
//
// The count is workspace-scoped (all files in the given source backend);
// we don't iterate the file table for share grants — instead we surface
// every user whose workspace currently has any share pointing at this
// workspace. False-positive safe.

interface Body {
  source?: unknown
}

interface AffectedUser {
  user_id: string
  display_name: string
  email: string
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event).catch(() => ({}))
  const source = body?.source === 'local' ? 'local' : 'google-drive'

  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only owners and admins can preview workspace migrations.',
    })
  }

  const admin = serverSupabaseServiceRole(event)

  const { count: affectedFilesCount } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('backend', source)
    .eq('kind', 'file')

  const { data: members, error: membersError } = await admin
    .rpc('list_workspace_members_with_profiles', { ws_id: workspaceId })
  if (membersError) {
    console.error('[preview-access-loss] members RPC failed', membersError)
  }

  const affected = new Map<string, AffectedUser>()
  for (const m of (members ?? []) as Array<{ user_id: string; email: string | null; display_name: string | null }>) {
    if (m.user_id === user.sub) continue
    affected.set(m.user_id, {
      user_id: m.user_id,
      display_name: m.display_name ?? (m.email ? m.email.split('@')[0] : ''),
      email: m.email ?? '',
    })
  }

  // Fan out to other workspaces this one shares with. We pull every unique
  // shared_with_workspace_id, then list each of their members.
  const { data: shares } = await admin
    .from('workspace_file_shares')
    .select('shared_with_workspace_id')
    .eq('workspace_id', workspaceId)
  const shareTargets = Array.from(new Set((shares ?? []).map(s => s.shared_with_workspace_id).filter(Boolean)))

  for (const targetWs of shareTargets) {
    const { data: targetMembers } = await admin
      .rpc('list_workspace_members_with_profiles', { ws_id: targetWs })
    for (const m of (targetMembers ?? []) as Array<{ user_id: string; email: string | null; display_name: string | null }>) {
      if (m.user_id === user.sub) continue
      if (affected.has(m.user_id)) continue
      affected.set(m.user_id, {
        user_id: m.user_id,
        display_name: m.display_name ?? (m.email ? m.email.split('@')[0] : ''),
        email: m.email ?? '',
      })
    }
  }

  return {
    ok: true as const,
    source,
    affectedFilesCount: affectedFilesCount ?? 0,
    affectedUsers: Array.from(affected.values()),
  }
})
