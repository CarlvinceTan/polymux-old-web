import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  const automationId = getRouterParam(event, 'automationId')
  if (!workspaceId || !automationId) throw createError({ statusCode: 400, statusMessage: 'Workspace and automation IDs are required.' })

  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  const api = supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
        }
      }
    }
  }
  const { error } = await api
    .from('flow_automations')
    .delete()
    .eq('id', automationId)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('[flow-automations] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete automation.' })
  }
  return { ok: true as const }
})
