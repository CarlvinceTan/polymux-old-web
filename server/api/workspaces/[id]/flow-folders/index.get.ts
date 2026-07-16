import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  // New migration-backed table; generated database types are refreshed separately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const [{ data: folders, error: foldersError }, { data: flows, error: flowsError }] = await Promise.all([
    db.from('flow_folders').select('id, workspace_id, name, position, created_at, updated_at').eq('workspace_id', workspaceId).order('position', { ascending: false }).order('created_at', { ascending: true }),
    db.from('workflows').select('id, folder_id').eq('workspace_id', workspaceId).is('deleted_at', null),
  ])
  if (foldersError || flowsError) throw createError({ statusCode: 500, statusMessage: 'Failed to load flow folders.' })
  return {
    folders: folders ?? [],
    assignments: Object.fromEntries((flows ?? []).map((flow: { id: string, folder_id: string | null }) => [flow.id, flow.folder_id])),
  }
})
