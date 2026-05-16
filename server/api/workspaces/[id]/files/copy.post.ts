import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/app/types/database.types'
import {
  assertMembership,
  basenameOf,
  normalizePath,
  parentOf,
  requireRead,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
} from '~~/server/utils/workspace/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
import { copyDriveFile } from '~~/server/utils/oauth/googleOAuth'

// POST /api/workspaces/[id]/files/copy
// Body: { from, to, kind? }  — kind: 'file' | 'folder' (default 'file')
//
// Backend dispatch per-file based on the source's metadata row:
//  - google-drive → Drive files.copy + metadata row pointing at the new Drive id
//  - local → metadata row only (bytes stay on the original device; duplicate
//    is a no-op on disk). Included so the UI doesn't dead-end on local files.
//
// Requires read on source and write on destination parent.

type Backend = 'google-drive' | 'local'

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
  admin: SupabaseClient<Database>,
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
  admin: SupabaseClient<Database>,
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
  admin: SupabaseClient<Database>,
  workspaceId: string,
  fromPath: string,
  toPath: string,
  userSub: string,
  metaCache?: FileMetaRow | null,
): Promise<void> {
  const meta = metaCache ?? await loadMetaByPath(admin, workspaceId, fromPath)
  if (!meta) {
    throw createError({ statusCode: 404, statusMessage: 'Source file not found.' })
  }
  const backend: Backend = meta.backend

  if (backend === 'google-drive') {
    if (!meta.backend_ref) {
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
    backend_ref: meta.backend_ref ?? null,
    size_bytes: meta.size_bytes ?? null,
    content_type: meta.content_type ?? null,
    backend_mtime: new Date().toISOString(),
    created_by: userSub,
  }, { onConflict: 'workspace_id,path' })
  if (upsertErr) {
    console.error('[files] copy error (local metadata)', upsertErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record local copy metadata.' })
  }
}

async function copyFolder(
  admin: SupabaseClient<Database>,
  workspaceId: string,
  fromPath: string,
  toPath: string,
  userSub: string,
): Promise<void> {
  const subtree = await loadSubtreeMeta(admin, workspaceId, fromPath)
  const rootMeta = subtree.find(r => r.path === fromPath) ?? null
  const rootBackend: Backend = rootMeta?.backend ?? 'local'

  for (const row of subtree) {
    const suffix = row.path === fromPath ? '' : row.path.slice(fromPath.length)
    const destPath = `${toPath}${suffix}`
    if (row.kind === 'folder') {
      await admin.from('files').upsert({
        workspace_id: workspaceId,
        path: destPath,
        kind: 'folder',
        backend: row.backend,
        backend_ref: row.backend_ref,
        created_by: userSub,
      }, { onConflict: 'workspace_id,path' })
      continue
    }
    await copySingleFile(admin, workspaceId, row.path, destPath, userSub, row)
  }

  await admin.from('files').upsert({
    workspace_id: workspaceId,
    path: toPath,
    kind: 'folder',
    backend: rootBackend,
    backend_ref: rootMeta?.backend_ref ?? null,
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
