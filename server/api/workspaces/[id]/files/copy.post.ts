import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  normalizePath,
  parentOf,
  requireRead,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
  storageKey,
  storagePrefix,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/copy
// Body: { from, to, kind? }  — kind: 'file' | 'folder' (default 'file')
//
// Server-side copy within the Supabase backend. Requires read on source and
// write on destination parent.

interface Body {
  from?: unknown
  to?: unknown
  kind?: unknown
}

async function copySubtree(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  fromPath: string,
  toPath: string,
) {
  const fromPrefix = storagePrefix(workspaceId, fromPath)
  const toPrefix = storagePrefix(workspaceId, toPath)

  const keepKey = `${toPrefix}.keep`
  const keepBody = new Blob(['\n'], { type: 'text/plain' })
  await admin.storage.from(STORAGE_BUCKET).upload(keepKey, keepBody, {
    contentType: 'text/plain',
    upsert: true,
  })

  const { data: entries, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .list(fromPrefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  for (const item of entries ?? []) {
    if (item.name === '.keep') continue
    if (item.id === null) {
      await copySubtree(admin, workspaceId, `${fromPath}/${item.name}`, `${toPath}/${item.name}`)
    } else {
      const { error: cErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .copy(`${fromPrefix}${item.name}`, `${toPrefix}${item.name}`)
      if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })
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
    throw createError({ statusCode: 400, statusMessage: 'Source and destination must differ.' })
  }

  const toLeaf = to.split('/').pop() ?? ''
  if (!toLeaf || sanitizeSegment(toLeaf) !== toLeaf) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid destination name.' })
  }

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)
  await requireRead(supabase, workspaceId, from, user.sub)
  await requireWrite(supabase, workspaceId, parentOf(to), user.sub)

  const admin = serverSupabaseServiceRole(event)

  if (kind === 'folder') {
    await copySubtree(admin, workspaceId, from, to)
  } else {
    const { error: cErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .copy(storageKey(workspaceId, from), storageKey(workspaceId, to))
    if (cErr) {
      console.error('[files] copy error', cErr)
      throw createError({ statusCode: 500, statusMessage: cErr.message })
    }
  }

  return { ok: true as const, from, to }
})
