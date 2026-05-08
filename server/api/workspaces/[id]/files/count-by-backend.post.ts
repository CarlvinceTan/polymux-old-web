import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { resolveWorkspaceId } from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/count-by-backend
// Body: { backend: 'google-drive' | 'local' }
//
// Returns the number of files (kind='file') currently stored on the given
// backend. Drives the disconnect-storage-provider warning modal: if a user
// tries to remove a backend that still has files, the UI must force them to
// migrate first.

interface Body {
  backend?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event).catch(() => ({}))
  const backend = body?.backend
  if (backend !== 'google-drive' && backend !== 'local') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid backend.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this workspace.' })
  }

  const admin = serverSupabaseServiceRole(event)

  // Count files and folders separately. Folder rows carry no bytes — they're
  // pure metadata — but they still pin the backend (the FileBrowser pulls
  // the folder icon from the folder row's `backend`). If a folder is left
  // on the source after a bulk migration we must block the disconnect, or
  // the folder will display the icon of a now-disconnected provider.
  const [fileRes, folderRes] = await Promise.all([
    admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('backend', backend)
      .eq('kind', 'file'),
    admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('backend', backend)
      .eq('kind', 'folder'),
  ])

  if (fileRes.error || folderRes.error) {
    console.error('[count-by-backend] failed', fileRes.error || folderRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to count files.' })
  }

  const fileCount = fileRes.count ?? 0
  const folderCount = folderRes.count ?? 0
  return {
    ok: true as const,
    backend,
    count: fileCount + folderCount,
    fileCount,
    folderCount,
  }
})
