import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  parentOf,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
} from '~~/server/utils/workspace/workspaceFiles'

// POST /api/workspaces/[id]/files/move
// Body: { from, to, kind? } where kind is 'file' (default) or 'folder'
//
// Renames / re-parents within the metadata layer. Bytes themselves never move
// — Drive files keep their Drive id, local files keep their OPFS entry. Only
// the logical path on the `files` row changes.

interface Body {
  from?: unknown
  to?: unknown
  kind?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)
  const from = normalizePath(body.from)
  const to = normalizePath(body.to)
  const kind = body.kind === 'folder' ? 'folder' : 'file'

  if (!from || !to) {
    throw createError({ statusCode: 400, statusMessage: 'from and to are required.' })
  }
  if (from === to) {
    return { ok: true as const, from, to }
  }

  const toLeaf = to.split('/').pop() ?? ''
  if (!toLeaf || sanitizeSegment(toLeaf) !== toLeaf) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid destination name.' })
  }

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)
  await requireWrite(supabase, workspaceId, parentOf(from), user.sub)
  await requireWrite(supabase, workspaceId, parentOf(to), user.sub)

  const admin = serverSupabaseServiceRole(event)

  if (kind === 'folder') {
    const { data: rows } = await admin
      .from('files')
      .select('id, path')
      .eq('workspace_id', workspaceId)
      .or(`path.eq.${from},path.like.${from}/%`)
    for (const row of rows ?? []) {
      const newPath = row.path === from ? to : `${to}${row.path.slice(from.length)}`
      await admin.from('files').update({ path: newPath }).eq('id', row.id)
    }
  } else {
    await admin
      .from('files')
      .update({ path: to })
      .eq('workspace_id', workspaceId)
      .eq('path', from)
  }

  return { ok: true as const, from, to }
})
