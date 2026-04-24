import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const body = await readBody<{ filePath?: unknown }>(event)
  const filePath = typeof body.filePath === 'string' ? body.filePath.trim() : ''

  if (!filePath) {
    throw createError({ statusCode: 400, statusMessage: 'filePath is required.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data: shares } = await supabase
    .from('file_shares')
    .select('file_path, permission_level')
    .eq('workspace_id', workspaceId)

  if (!shares || shares.length === 0) {
    return { canShare: true }
  }

  const inputSegments = filePath.split('/').filter(Boolean)

  for (const share of shares) {
    const shareSegments = share.file_path.split('/').filter(Boolean)

    if (inputSegments.length > shareSegments.length) {
      const isSubdirectory = shareSegments.every(
        (seg: string, i: number) => seg === inputSegments[i]
      )
      if (isSubdirectory) {
        return {
          canShare: false,
          message: 'A parent directory is already shared with a different permission level.',
          parentSharePath: share.file_path,
          parentPermission: share.permission_level,
        }
      }
    }

    if (inputSegments.length <= shareSegments.length) {
      const isParent = inputSegments.every(
        (seg: string, i: number) => seg === shareSegments[i]
      )
      if (isParent) {
        return {
          canShare: false,
          message: 'A subdirectory of this path is already shared.',
          parentSharePath: share.file_path,
          parentPermission: share.permission_level,
        }
      }
    }
  }

  return { canShare: true }
})
