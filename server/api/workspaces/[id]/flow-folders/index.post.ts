import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  const body = await readBody<{ name?: string }>(event)
  const name = body.name?.trim().slice(0, 80)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Folder name is required.' })
  const { user, supabase } = await requireWorkspaceMember(event, workspaceId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db.from('flow_folders').insert({ workspace_id: workspaceId, name, created_by: user.sub }).select('id, workspace_id, name, position, created_at, updated_at').single()
  if (error || !data) throw createError({ statusCode: 500, statusMessage: 'Failed to create flow folder.' })
  return data
})
