import { assertFlowInWorkspace, requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  const flowId = getRouterParam(event, 'flowId')
  if (!workspaceId || !flowId) throw createError({ statusCode: 400, statusMessage: 'Workspace and flow IDs are required.' })
  const body = await readBody<{ folder_id?: string | null }>(event)
  const folderId = typeof body.folder_id === 'string' && body.folder_id ? body.folder_id : null
  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  await assertFlowInWorkspace(supabase, flowId, workspaceId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { error } = await db.rpc('move_workflow_to_folder', {
    p_workspace_id: workspaceId,
    p_workflow_id: flowId,
    p_folder_id: folderId,
  })
  if (error) throw createError({ statusCode: 500, statusMessage: 'Failed to move flow.' })
  return { flow_id: flowId, folder_id: folderId }
})
