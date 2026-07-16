import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  const folderId = getRouterParam(event, 'folderId')
  if (!workspaceId || !folderId) throw createError({ statusCode: 400, statusMessage: 'Workspace and folder IDs are required.' })
  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error: moveError } = await db.from('workflows').update({ folder_id: null }).eq('workspace_id', workspaceId).eq('folder_id', folderId)
  if (moveError) throw createError({ statusCode: 500, statusMessage: 'Failed to empty flow folder.' })
  const { error } = await db.from('flow_folders').delete().eq('id', folderId).eq('workspace_id', workspaceId)
  if (error) throw createError({ statusCode: 500, statusMessage: 'Failed to delete flow folder.' })
  setResponseStatus(event, 204)
  return null
})
