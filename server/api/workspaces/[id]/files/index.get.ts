import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  effectivePermission,
  normalizePath,
  resolveWorkspaceId,
  storagePrefix,
} from '~~/server/utils/workspaceFiles'

// GET /api/workspaces/[id]/files?path=reports
// Lists files and folders under a logical path. Applies the per-path
// effective-permission filter — entries the caller cannot read are omitted.
//
// Phase B reads from the Supabase Storage bucket as the source of truth for
// listing (so existing uploads keep showing up). Metadata in the `files` table
// is layered on top when available. A future migration job (Phase F) will
// backfill the table and the bucket enumeration will be dropped.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const query = getQuery(event)
  const path = normalizePath(query.path)

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)

  const prefix = storagePrefix(workspaceId, path)
  const { data: entries, error: listError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })

  if (listError) {
    console.error('[files] list error', listError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list files.' })
  }

  const files: Array<{
    id: string
    name: string
    path: string
    size: number
    createdAt: string
    provider: 'supabase'
  }> = []
  const folders: Array<{ name: string, path: string, provider: 'supabase' }> = []

  for (const item of entries ?? []) {
    const isFolder = item.id === null
    const name = item.name
    if (isFolder && name === '.keep') continue
    if (!isFolder && name === '.keep') continue

    const logicalPath = path ? `${path}/${name}` : name
    const level = await effectivePermission(supabase, workspaceId, logicalPath, user.sub)
    if (level === 'none') continue

    if (isFolder) {
      folders.push({ name, path: logicalPath, provider: 'supabase' })
    } else {
      files.push({
        id: item.id as string,
        name,
        path: logicalPath,
        size: item.metadata?.size ?? 0,
        createdAt: item.created_at ?? new Date().toISOString(),
        provider: 'supabase',
      })
    }
  }

  return { files, folders }
})
