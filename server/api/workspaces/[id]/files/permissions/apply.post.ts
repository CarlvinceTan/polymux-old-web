import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { notifyPermissionsChanged } from '~~/server/utils/notifyAgent'
import {
  assertMembership,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/permissions/apply
// Body:
//   {
//     paths: string[],
//     grants: { user_id: string|null, grant_level: 'read'|'write'|'none' }[],
//     remove?: (string|null)[],
//     cascade?: boolean    // default true
//   }
//
// Atomically applies a set of grants/removals at one or more paths and, when
// `cascade` is true, wipes any per-descendant grants under each path so the
// new state is authoritative for the entire subtree — the "latest manage
// access always overrides recursively" rule.
//
// The single-path POST/DELETE endpoints remain for callers that only mutate
// one row at a time and don't need the cascade semantic.

interface GrantInput {
  user_id?: unknown
  grant_level?: unknown
}

interface Body {
  paths?: unknown
  grants?: unknown
  remove?: unknown
  cascade?: unknown
}

const VALID_LEVELS = new Set(['read', 'write', 'none'])

function normUserId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string' || raw.length === 0) return null
  return raw
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)

  const rawPaths = Array.isArray(body.paths) ? body.paths : []
  const paths = Array.from(new Set(rawPaths.map(normalizePath)))
  if (paths.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'paths must be a non-empty array.' })
  }

  const rawGrants = Array.isArray(body.grants) ? body.grants : []
  const grants = rawGrants.map((entry) => {
    const grant = entry as GrantInput
    const grantLevel = typeof grant.grant_level === 'string' ? grant.grant_level : ''
    if (!VALID_LEVELS.has(grantLevel)) {
      throw createError({ statusCode: 400, statusMessage: 'grant_level must be read, write, or none.' })
    }
    return {
      user_id: normUserId(grant.user_id),
      grant_level: grantLevel as 'read' | 'write' | 'none',
    }
  })

  const rawRemove = Array.isArray(body.remove) ? body.remove : []
  const remove = rawRemove.map(normUserId)
  const cascade = body.cascade !== false

  const supabase = await serverSupabaseClient(event)
  const role = await assertMembership(supabase, workspaceId, user.sub)
  if (!['owner', 'admin'].includes(role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can change permissions.' })
  }

  for (const path of paths) {
    for (const userId of remove) {
      let q = supabase
        .from('workspace_file_permissions')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('path', path)
      q = userId === null ? q.is('user_id', null) : q.eq('user_id', userId)
      const { error } = await q
      if (error) {
        console.error('[permissions/apply] delete error', error)
        throw createError({ statusCode: 500, statusMessage: 'Failed to remove permissions.' })
      }
    }

    for (const grant of grants) {
      if (grant.user_id === null) {
        // Partial unique index on (workspace_id, path) WHERE user_id IS NULL
        // rejects upsert with NULL conflict targets, so delete-then-insert.
        const { error: delError } = await supabase
          .from('workspace_file_permissions')
          .delete()
          .eq('workspace_id', workspaceId)
          .eq('path', path)
          .is('user_id', null)
        if (delError) {
          console.error('[permissions/apply] all-members delete error', delError)
          throw createError({ statusCode: 500, statusMessage: 'Failed to update permissions.' })
        }
        const { error } = await supabase
          .from('workspace_file_permissions')
          .insert({
            workspace_id: workspaceId,
            path,
            user_id: null,
            grant_level: grant.grant_level,
            created_by: user.sub,
          })
        if (error) {
          console.error('[permissions/apply] all-members insert error', error)
          throw createError({ statusCode: 500, statusMessage: 'Failed to update permissions.' })
        }
      }
      else {
        const { error } = await supabase
          .from('workspace_file_permissions')
          .upsert({
            workspace_id: workspaceId,
            path,
            user_id: grant.user_id,
            grant_level: grant.grant_level,
            created_by: user.sub,
          }, { onConflict: 'workspace_id,path,user_id' })
        if (error) {
          console.error('[permissions/apply] upsert error', error)
          throw createError({ statusCode: 500, statusMessage: 'Failed to update permissions.' })
        }
      }
    }

    if (cascade) {
      const { error } = await supabase.rpc('wipe_descendant_file_permissions', {
        p_workspace_id: workspaceId,
        p_path: path,
      })
      if (error) {
        console.error('[permissions/apply] cascade wipe error', error)
        throw createError({ statusCode: 500, statusMessage: 'Failed to cascade permissions.' })
      }
    }
  }

  void notifyPermissionsChanged(workspaceId)
  return { ok: true as const, paths, cascaded: cascade }
})
