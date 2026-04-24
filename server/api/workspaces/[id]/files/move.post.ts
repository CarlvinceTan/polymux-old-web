import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  normalizePath,
  parentOf,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
  storageKey,
  storagePrefix,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/move
// Body: { from, to, kind? } where kind is 'file' (default) or 'folder'
//
// Moves within the Supabase backend. Requires write on both source parent and
// destination parent. For folders, walks the subtree and moves each object.

interface Body {
  from?: unknown
  to?: unknown
  kind?: unknown
}

async function moveSubtree(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  fromPath: string,
  toPath: string,
) {
  const fromPrefix = storagePrefix(workspaceId, fromPath)
  const toPrefix = storagePrefix(workspaceId, toPath)

  const { data: entries, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .list(fromPrefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  for (const item of entries ?? []) {
    const isFolder = item.id === null
    if (isFolder) {
      await moveSubtree(
        admin,
        workspaceId,
        `${fromPath}/${item.name}`,
        `${toPath}/${item.name}`,
      )
    } else {
      const { error: mErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .move(`${fromPrefix}${item.name}`, `${toPrefix}${item.name}`)
      if (mErr) {
        throw createError({ statusCode: 500, statusMessage: mErr.message })
      }
    }
  }
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
    await moveSubtree(admin, workspaceId, from, to)
  } else {
    const { error: mErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .move(storageKey(workspaceId, from), storageKey(workspaceId, to))
    if (mErr) {
      console.error('[files] move error', mErr, { from, to })
      throw createError({ statusCode: 500, statusMessage: `${mErr.message} (from=${from} to=${to})` })
    }
  }

  // Reconcile metadata: update path on any rows that match either the exact
  // path (file) or anything nested under the folder.
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
