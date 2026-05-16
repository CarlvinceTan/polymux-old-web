import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'

// POST /api/workspaces/[id]/files/migrate-folder-backends
// Body: { source: Backend, target: Backend, device_id?: string }
//
// Flips every folder row on `source` to `target`. Folders carry no bytes —
// they're metadata anchors for the FileBrowser's per-row provider icon. The
// drive ↔ supabase bulk endpoints flip folders inline once their file batch
// drains; the local migration flow is driven by the client, so it calls this
// endpoint at the end of its loop instead.
//
// `device_id` is required when `target='local'` — the row's backend_ref must
// point at the device that "owns" the folder, mirroring how local files work.

type Backend = 'google-drive' | 'local'

interface Body {
  source?: unknown
  target?: unknown
  device_id?: unknown
}

function asBackend(v: unknown): Backend | null {
  if (v === 'google-drive' || v === 'local') return v
  return null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event).catch(() => ({})) as Body
  const source = asBackend(body?.source)
  const target = asBackend(body?.target)
  if (!source || !target) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid source or target.' })
  }
  if (source === target) {
    return { ok: true as const, migrated: 0 }
  }

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
      statusMessage: 'Only owners and admins can migrate workspace files.',
    })
  }

  // Default backend_ref for a freshly-flipped folder row. Mirrors the values
  // folder.post.ts writes when a folder is created on each backend.
  const deviceId = typeof body?.device_id === 'string' ? body.device_id : null
  const backendRef: string | null = (() => {
    if (target === 'local') return deviceId
    if (target === 'google-drive') return null
    return null
  })()
  if (target === 'local' && !backendRef) {
    throw createError({ statusCode: 400, statusMessage: 'device_id is required for local target.' })
  }

  const admin = serverSupabaseServiceRole(event)
  const { data: updated, error: updateError } = await admin
    .from('files')
    .update({ backend: target, backend_ref: backendRef })
    .eq('workspace_id', workspaceId)
    .eq('backend', source)
    .eq('kind', 'folder')
    .select('id')
  if (updateError) {
    console.error('[migrate-folder-backends] update failed', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to migrate folder rows.' })
  }

  return { ok: true as const, migrated: (updated ?? []).length }
})
