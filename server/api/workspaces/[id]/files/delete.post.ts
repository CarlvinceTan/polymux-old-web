import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  normalizePath,
  parentOf,
  requireWrite,
  resolveWorkspaceId,
  storageKey,
  storagePrefix,
} from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { deleteDriveFile } from '~~/server/utils/googleOAuth'

// POST /api/workspaces/[id]/files/delete
// Body: { paths: [...], kind? }  — kind: 'file' | 'folder' (default 'file')
//
// Batch delete. For each target we look up the metadata row to find the
// backend (supabase / google-drive) and dispatch accordingly. Per-target
// failures abort the batch — best-effort partial delete adds more confusion
// than it saves.

interface Body {
  paths?: unknown
  kind?: unknown
}

async function collectFolderObjects(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  folderPath: string,
): Promise<string[]> {
  const keys: string[] = []
  const prefix = storagePrefix(workspaceId, folderPath)

  const { data: entries, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  for (const item of entries ?? []) {
    if (item.id === null) {
      const subKeys = await collectFolderObjects(admin, workspaceId, `${folderPath}/${item.name}`)
      keys.push(...subKeys)
    } else {
      keys.push(`${prefix}${item.name}`)
    }
  }
  return keys
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)
  const rawPaths = Array.isArray(body.paths) ? body.paths : []
  const kind = body.kind === 'folder' ? 'folder' : 'file'

  const paths = rawPaths
    .map(normalizePath)
    .filter((p): p is string => p.length > 0)
  if (paths.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one path is required.' })
  }

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)

  for (const p of paths) {
    await requireWrite(supabase, workspaceId, parentOf(p), user.sub)
  }

  const admin = serverSupabaseServiceRole(event)

  if (kind === 'folder') {
    for (const folder of paths) {
      // Drive files inside the folder — delete by metadata row.
      const { data: driveRows } = await admin
        .from('files')
        .select('path, backend, backend_ref')
        .eq('workspace_id', workspaceId)
        .eq('backend', 'google-drive')
        .or(`path.eq.${folder},path.like.${folder}/%`)
      if (driveRows && driveRows.length > 0) {
        const access = await resolveDriveAccess(admin, workspaceId)
        for (const row of driveRows) {
          if (row.backend_ref) {
            await deleteDriveFile(access.accessToken, row.backend_ref, workspaceId)
          }
        }
      }

      // Supabase objects.
      const objectKeys = await collectFolderObjects(admin, workspaceId, folder)
      if (objectKeys.length > 0) {
        const { error } = await admin.storage.from(STORAGE_BUCKET).remove(objectKeys)
        if (error) {
          console.error('[files] folder delete error', error)
          throw createError({ statusCode: 500, statusMessage: error.message })
        }
      }
      await admin
        .from('files')
        .delete()
        .eq('workspace_id', workspaceId)
        .or(`path.eq.${folder},path.like.${folder}/%`)
    }
    return { ok: true as const, deleted: paths.length }
  }

  // file kind — fetch each row to find backend.
  const { data: rows } = await admin
    .from('files')
    .select('path, backend, backend_ref')
    .eq('workspace_id', workspaceId)
    .in('path', paths)

  const driveRefs: string[] = []
  const supabasePaths: string[] = []
  const knownPaths = new Set<string>()
  for (const r of rows ?? []) {
    knownPaths.add(r.path)
    if (r.backend === 'google-drive' && r.backend_ref) driveRefs.push(r.backend_ref)
    else supabasePaths.push(r.path)
  }
  // Paths with no row default to Supabase (legacy entries).
  for (const p of paths) {
    if (!knownPaths.has(p)) supabasePaths.push(p)
  }

  if (driveRefs.length > 0) {
    const access = await resolveDriveAccess(admin, workspaceId)
    for (const ref of driveRefs) {
      await deleteDriveFile(access.accessToken, ref, workspaceId)
    }
  }

  if (supabasePaths.length > 0) {
    const keys = supabasePaths.map(p => storageKey(workspaceId, p))
    const { error } = await admin.storage.from(STORAGE_BUCKET).remove(keys)
    if (error) {
      console.error('[files] delete error', error)
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  await admin
    .from('files')
    .delete()
    .eq('workspace_id', workspaceId)
    .in('path', paths)

  return { ok: true as const, deleted: paths.length }
})
