import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  const body = await readBody<{ order?: string[] }>(event)
  const order = [...new Set((body.order ?? []).filter(id => typeof id === 'string' && id.length > 0))]
  if (order.length === 0 || order.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'A valid folder order is required.' })
  }
  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  // Generated database types are refreshed separately from feature work.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db.rpc('reorder_flow_folders', {
    p_workspace_id: workspaceId,
    p_ordered_ids: order,
  })
  if (error) throw createError({ statusCode: 500, statusMessage: 'Failed to reorder flow folders.' })
  return { order }
})
