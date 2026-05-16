import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  parentOf,
  requireWrite,
  resolveWorkspaceId,
} from '~~/server/utils/workspace/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
import { deleteDriveFile } from '~~/server/utils/oauth/googleOAuth'

// POST /api/workspaces/[id]/files/delete
// Body: { paths: [...], kind? }  — kind: 'file' | 'folder' (default 'file')
//
// Batch delete. For each target we look up the metadata row to find the
// backend and dispatch accordingly. Per-target failures abort the batch —
// best-effort partial delete adds more confusion than it saves.

interface Body {
  paths?: unknown
  kind?: unknown
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
      const { data: driveRows } = await admin
        .from('files')
        .select('backend_ref')
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

      await admin
        .from('files')
        .delete()
        .eq('workspace_id', workspaceId)
        .or(`path.eq.${folder},path.like.${folder}/%`)
    }
    return { ok: true as const, deleted: paths.length }
  }

  const { data: rows } = await admin
    .from('files')
    .select('backend, backend_ref')
    .eq('workspace_id', workspaceId)
    .in('path', paths)

  const driveRefs: string[] = []
  for (const r of rows ?? []) {
    if (r.backend === 'google-drive' && r.backend_ref) driveRefs.push(r.backend_ref)
  }

  if (driveRefs.length > 0) {
    const access = await resolveDriveAccess(admin, workspaceId)
    for (const ref of driveRefs) {
      await deleteDriveFile(access.accessToken, ref, workspaceId)
    }
  }

  await admin
    .from('files')
    .delete()
    .eq('workspace_id', workspaceId)
    .in('path', paths)

  return { ok: true as const, deleted: paths.length }
})
