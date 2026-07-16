import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  const folderId = getRouterParam(event, 'folderId')
  if (!workspaceId || !folderId) throw createError({ statusCode: 400, statusMessage: 'Workspace and folder IDs are required.' })
  const body = await readBody<{ name?: string }>(event)
  const name = body.name?.trim().slice(0, 80)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Folder name is required.' })
  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db.from('flow_folders').update({ name }).eq('id', folderId).eq('workspace_id', workspaceId).select('id, workspace_id, name, position, created_at, updated_at').maybeSingle()
  if (error || !data) throw createError({ statusCode: 404, statusMessage: 'Flow folder not found.' })
  return data
})
