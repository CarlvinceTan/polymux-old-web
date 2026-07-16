import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  const body = await readBody<{ folder_id?: string | null, order?: string[] }>(event)
  const folderId = typeof body.folder_id === 'string' && body.folder_id ? body.folder_id : null
  const order = [...new Set((body.order ?? []).filter(id => typeof id === 'string' && id.length > 0))]
  if (order.length === 0 || order.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'A valid flow order is required.' })
  }
  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  // Generated database types are refreshed separately from feature work.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db.rpc('reorder_folder_workflows', {
    p_workspace_id: workspaceId,
    p_folder_id: folderId,
    p_ordered_ids: order,
  })
  if (error) throw createError({ statusCode: 500, statusMessage: 'Failed to reorder flows.' })
  return { folder_id: folderId, order }
})
