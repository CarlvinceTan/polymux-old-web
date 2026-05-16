import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  requireWrite,
  resolveWorkspaceId,
} from '~~/server/utils/workspace/workspaceFiles'

// POST /api/workspaces/[id]/files/reorder
// Body: { parent: string, orderedNames: string[] }
//
// Persists user-defined ordering for entries under `parent` in this workspace.
// Unknown / stale names are tolerated — the read path filters them against the
// current bucket contents — so no cross-table cascade is needed when items
// move, rename, or delete.

interface Body {
  parent?: unknown
  orderedNames?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)
  const parent = normalizePath(body.parent)
  const names = Array.isArray(body.orderedNames)
    ? body.orderedNames
        .filter((n): n is string =>
          typeof n === 'string' && n.length > 0 && !n.includes('/') && n !== '.keep',
        )
        .slice(0, 2000)
    : []

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)
  await requireWrite(supabase, workspaceId, parent, user.sub)

  const admin = serverSupabaseServiceRole(event)
  const { error } = await admin
    .from('file_order')
    .upsert(
      {
        workspace_id: workspaceId,
        parent_path: parent,
        ordered_names: names,
        updated_by: user.sub,
      },
      { onConflict: 'workspace_id,parent_path' },
    )
  if (error) {
    console.error('[files] reorder upsert error', error)
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true as const }
})
