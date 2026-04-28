import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  basenameOf,
  normalizePath,
  parentOf,
  requireRead,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
  storageKey,
  storagePrefix,
} from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { copyDriveFile } from '~~/server/utils/googleOAuth'

// POST /api/workspaces/[id]/files/copy
// Body: { from, to, kind? }  — kind: 'file' | 'folder' (default 'file')
//
// Backend dispatch per-file based on the source's metadata row:
//  - supabase → Supabase Storage copy + metadata row
//  - google-drive → Drive files.copy + metadata row pointing at the new Drive id
//  - local → metadata row only (bytes stay on the original device; duplicate
//    is a no-op on disk). Included so the UI doesn't dead-end on local files.
//
// Requires read on source and write on destination parent.

type Backend = 'supabase' | 'google-drive' | 'local'

interface Body {
  from?: unknown
  to?: unknown
  kind?: unknown
}

interface FileMetaRow {
  id: string
  path: string
  kind: 'file' | 'folder'
  backend: Backend
  backend_ref: string | null
  size_bytes: number | null
  content_type: string | null
}

async function loadMetaByPath(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  path: string,
): Promise<FileMetaRow | null> {
  const { data } = await admin
    .from('files')
    .select('id, path, kind, backend, backend_ref, size_bytes, content_type')
    .eq('workspace_id', workspaceId)
    .eq('path', path)
    .maybeSingle()
  return (data ?? null) as FileMetaRow | null
}

async function loadSubtreeMeta(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  rootPath: string,
): Promise<FileMetaRow[]> {
  const { data } = await admin
    .from('files')
    .select('id, path, kind, backend, backend_ref, size_bytes, content_type')
    .eq('workspace_id', workspaceId)
    .or(`path.eq.${rootPath},path.like.${rootPath}/%`)
  return (data ?? []) as FileMetaRow[]
}

async function copySingleFile(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  fromPath: string,
  toPath: string,
  userSub: string,
  metaCache?: FileMetaRow | null,
): Promise<void> {
  const meta = metaCache ?? await loadMetaByPath(admin, workspaceId, fromPath)
  const backend: Backend = meta?.backend ?? 'supabase'

  if (backend === 'supabase') {
    const { error: cErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .copy(storageKey(workspaceId, fromPath), storageKey(workspaceId, toPath))
    if (cErr) {
      console.error('[files] copy error (supabase)', cErr)
      throw createError({ statusCode: 500, statusMessage: cErr.message })
    }
    // Metadata row is optional on supabase-backed files (legacy rows may be
    // missing); upsert one so the new path is queryable the same way.
    await admin.from('files').upsert({
      workspace_id: workspaceId,
      path: toPath,
      kind: 'file',
      backend: 'supabase',
      backend_ref: storageKey(workspaceId, toPath),
      size_bytes: meta?.size_bytes ?? null,
      content_type: meta?.content_type ?? null,
      backend_mtime: new Date().toISOString(),
      created_by: userSub,
    }, { onConflict: 'workspace_id,path' })
    return
  }

  if (backend === 'google-drive') {
    if (!meta?.backend_ref) {
      throw createError({ statusCode: 404, statusMessage: 'Drive file reference missing.' })
    }
    const access = await resolveDriveAccess(admin, workspaceId)
    const copied = await copyDriveFile(
      access.accessToken,
      meta.backend_ref,
      basenameOf(toPath),
      access.rootFolderId,
      workspaceId,
    )
    const size = meta.size_bytes ?? (copied.size ? Number(copied.size) : null)
    const { error: upsertErr } = await admin.from('files').upsert({
      workspace_id: workspaceId,
      path: toPath,
      kind: 'file',
      backend: 'google-drive',
      backend_ref: copied.id,
      size_bytes: size,
      content_type: meta.content_type,
      backend_mtime: new Date().toISOString(),
      created_by: userSub,
    }, { onConflict: 'workspace_id,path' })
    if (upsertErr) {
      console.error('[files] copy error (drive metadata)', upsertErr)
      throw createError({ statusCode: 500, statusMessage: 'Failed to record Drive copy metadata.' })
    }
    return
  }

  // backend === 'local'
  // Local bytes live in OPFS on the source device. We can't reach them from
  // the server, so the copy is metadata-only: the new row points to the same
  // device id, but its own row id has no bytes on that device. Marking the row
  // keeps the path listable; download from the source device will return
  // "not available locally" until the user re-uploads the duplicate.
  const { error: upsertErr } = await admin.from('files').upsert({
    workspace_id: workspaceId,
    path: toPath,
    kind: 'file',
    backend: 'local',
    backend_ref: meta?.backend_ref ?? null,
    size_bytes: meta?.size_bytes ?? null,
    content_type: meta?.content_type ?? null,
    backend_mtime: new Date().toISOString(),
    created_by: userSub,
  }, { onConflict: 'workspace_id,path' })
  if (upsertErr) {
    console.error('[files] copy error (local metadata)', upsertErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record local copy metadata.' })
  }
}

async function copySupabaseSubtree(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
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
      await copySupabaseSubtree(admin, workspaceId, `${fromPath}/${item.name}`, `${toPath}/${item.name}`)
    }
    else {
      const { error: cErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .copy(`${fromPrefix}${item.name}`, `${toPrefix}${item.name}`)
      if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })
    }
  }
}

async function copyFolder(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  fromPath: string,
  toPath: string,
  userSub: string,
): Promise<void> {
  const subtree = await loadSubtreeMeta(admin, workspaceId, fromPath)
  const byPath = new Map(subtree.map(r => [r.path, r]))
  const rootMeta = byPath.get(fromPath)
  const rootBackend: Backend = rootMeta?.backend ?? 'supabase'

  // If ANY descendant is supabase-backed, replicate the bucket subtree so those
  // objects land under the new prefix. Drive/local descendants are handled
  // individually below via their metadata rows.
  const hasSupabaseDescendant = rootBackend === 'supabase'
    || subtree.some(r => r.backend === 'supabase' && r.kind === 'file')
  if (hasSupabaseDescendant) {
    await copySupabaseSubtree(admin, workspaceId, fromPath, toPath)
  }

  // Duplicate metadata rows — folders as plain rows, files via per-backend
  // handling (Drive needs an API call, local/supabase are metadata-only after
  // the bucket copy above).
  for (const row of subtree) {
    const suffix = row.path === fromPath ? '' : row.path.slice(fromPath.length)
    const destPath = `${toPath}${suffix}`
    if (row.kind === 'folder') {
      await admin.from('files').upsert({
        workspace_id: workspaceId,
        path: destPath,
        kind: 'folder',
        backend: row.backend,
        backend_ref: row.backend === 'supabase' ? storageKey(workspaceId, destPath) : row.backend_ref,
        created_by: userSub,
      }, { onConflict: 'workspace_id,path' })
      continue
    }
    if (row.backend === 'google-drive') {
      await copySingleFile(admin, workspaceId, row.path, destPath, userSub, row)
    }
    else if (row.backend === 'local') {
      await copySingleFile(admin, workspaceId, row.path, destPath, userSub, row)
    }
    else {
      // supabase — bucket bytes are already at destPath from copySupabaseSubtree;
      // upsert metadata row for consistency.
      await copySingleFile(admin, workspaceId, row.path, destPath, userSub, row)
    }
  }

  // Folder itself may not have a metadata row (legacy); ensure one exists for
  // the destination so listings attribute it correctly.
  await admin.from('files').upsert({
    workspace_id: workspaceId,
    path: toPath,
    kind: 'folder',
    backend: rootBackend,
    backend_ref: rootBackend === 'supabase' ? storageKey(workspaceId, toPath) : (rootMeta?.backend_ref ?? null),
    created_by: userSub,
  }, { onConflict: 'workspace_id,path' })
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
    await copyFolder(admin, workspaceId, from, to, user.sub)
  }
  else {
    await copySingleFile(admin, workspaceId, from, to, user.sub)
  }

  return { ok: true as const, from, to }
})
