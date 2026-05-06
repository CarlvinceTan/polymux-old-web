import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// POST /api/workspaces/[id]/shares/apply
// Body:
//   {
//     filePaths: string[],
//     targetWorkspaceIds: string[],
//     permissionLevel: 'viewer' | 'editor',
//     cascade?: boolean    // default true
//   }
//
// For each (filePath, targetWorkspaceId) pair:
//   - If a parent of filePath is already shared with that target, refuse — the
//     existing parent share already covers it. Surfaced per-pair in `errors`.
//   - Otherwise upsert the share at filePath.
//   - If `cascade`, delete any existing shares to that target whose file_path
//     is a descendant of filePath. The new parent share supersedes them, so
//     this matches the "latest manage access always overrides recursively"
//     rule on the share table.
//
// Returns { ok, created: FileShare[], errors: { filePath, targetWorkspaceId, message }[] }.

interface Body {
  filePaths?: unknown
  targetWorkspaceIds?: unknown
  permissionLevel?: unknown
  cascade?: unknown
}

interface ShareRow {
  id: string
  workspace_id: string
  shared_with_workspace_id: string
  file_path: string
  permission_level: 'viewer' | 'editor'
  created_by: string
  created_at: string
  updated_at: string
}

function normalizeFilePath(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\\+/g, '/').replace(/^\/+|\/+$/g, '').trim()
}

function isDescendant(candidate: string, parent: string): boolean {
  if (parent === '') return candidate !== ''
  return candidate.startsWith(`${parent}/`)
}

function isAncestor(candidate: string, child: string): boolean {
  if (candidate === '') return child !== ''
  return child.startsWith(`${candidate}/`)
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const body = await readBody<Body>(event)
  const filePaths = Array.from(new Set(
    Array.isArray(body.filePaths) ? body.filePaths.map(normalizeFilePath).filter(Boolean) : [],
  ))
  const targetWorkspaceIds = Array.from(new Set(
    Array.isArray(body.targetWorkspaceIds)
      ? body.targetWorkspaceIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [],
  ))
  const permissionLevel: 'viewer' | 'editor' = body.permissionLevel === 'editor' ? 'editor' : 'viewer'
  const cascade = body.cascade !== false

  if (filePaths.length === 0 || targetWorkspaceIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'filePaths and targetWorkspaceIds are required.' })
  }
  if (targetWorkspaceIds.includes(workspaceId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot share with your own workspace.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can share directories.' })
  }

  // Enforce that the user is a member of every target workspace, matching the
  // existing single-share endpoint's check.
  const { data: targetMemberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.sub)
    .in('workspace_id', targetWorkspaceIds)
  const memberOf = new Set((targetMemberships ?? []).map(r => r.workspace_id))
  for (const target of targetWorkspaceIds) {
    if (!memberOf.has(target)) {
      throw createError({ statusCode: 403, statusMessage: 'You are not a member of every target workspace.' })
    }
  }

  // Pull all existing shares from this workspace once. We'll reason about
  // ancestor/descendant relationships in JS using starts_with-style matching
  // (no LIKE escaping pitfalls).
  const { data: existingShares, error: existingError } = await supabase
    .from('file_shares')
    .select('id, workspace_id, shared_with_workspace_id, file_path, permission_level, created_by, created_at, updated_at')
    .eq('workspace_id', workspaceId)
  if (existingError) {
    console.error('[shares/apply] load existing error', existingError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load existing shares.' })
  }
  const existing: ShareRow[] = (existingShares ?? []) as unknown as ShareRow[]

  const created: ShareRow[] = []
  const errors: { filePath: string; targetWorkspaceId: string; message: string }[] = []

  for (const filePath of filePaths) {
    for (const targetWorkspaceId of targetWorkspaceIds) {
      const sharesToTarget = existing.filter(s => s.shared_with_workspace_id === targetWorkspaceId)

      const blockingParent = sharesToTarget.find(s => isAncestor(s.file_path, filePath))
      if (blockingParent) {
        errors.push({
          filePath,
          targetWorkspaceId,
          message: `A parent directory ("${blockingParent.file_path || '/'}") is already shared with that workspace.`,
        })
        continue
      }

      const same = sharesToTarget.find(s => s.file_path === filePath)
      const descendants = sharesToTarget.filter(s => isDescendant(s.file_path, filePath))

      let upserted: ShareRow | null = null
      if (same) {
        if (same.permission_level !== permissionLevel) {
          const { data, error } = await supabase
            .from('file_shares')
            .update({ permission_level: permissionLevel, updated_at: new Date().toISOString() })
            .eq('id', same.id)
            .select('id, workspace_id, shared_with_workspace_id, file_path, permission_level, created_by, created_at, updated_at')
            .single()
          if (error) {
            console.error('[shares/apply] update error', error)
            errors.push({ filePath, targetWorkspaceId, message: 'Failed to update share.' })
            continue
          }
          upserted = data as unknown as ShareRow
        }
        else {
          upserted = same
        }
      }
      else {
        const { data, error } = await supabase
          .from('file_shares')
          .insert({
            workspace_id: workspaceId,
            shared_with_workspace_id: targetWorkspaceId,
            file_path: filePath,
            permission_level: permissionLevel,
            created_by: user.sub,
          })
          .select('id, workspace_id, shared_with_workspace_id, file_path, permission_level, created_by, created_at, updated_at')
          .single()
        if (error) {
          if (error.code === '23505') {
            errors.push({ filePath, targetWorkspaceId, message: 'Already shared with that workspace.' })
          }
          else {
            console.error('[shares/apply] insert error', error)
            errors.push({ filePath, targetWorkspaceId, message: 'Failed to share directory.' })
          }
          continue
        }
        upserted = data as unknown as ShareRow
      }

      if (cascade && descendants.length > 0) {
        const ids = descendants.map(d => d.id)
        const { error: delError } = await supabase
          .from('file_shares')
          .delete()
          .in('id', ids)
        if (delError) {
          console.error('[shares/apply] cascade delete error', delError)
          errors.push({ filePath, targetWorkspaceId, message: 'Share saved but cascade cleanup failed.' })
        }
        else {
          for (const id of ids) {
            const idx = existing.findIndex(s => s.id === id)
            if (idx >= 0) existing.splice(idx, 1)
          }
        }
      }

      if (upserted) {
        created.push(upserted)
        // Keep `existing` in sync so subsequent pairs in the same call see
        // this share as already present.
        const idx = existing.findIndex(s => s.id === upserted!.id)
        if (idx >= 0) existing[idx] = upserted
        else existing.push(upserted)
      }
    }
  }

  return { ok: true as const, created, errors }
})
