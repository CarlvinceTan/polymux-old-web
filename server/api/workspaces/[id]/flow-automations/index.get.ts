import type { FlowAutomationRow } from '~~/server/utils/flows/automations'
import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })

  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  const admin = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown, error: { message: string } | null }>
        }
      }
    }
  }
  const { data, error } = await admin
    .from('flow_automations')
    .select('id, workspace_id, flow_id, name, active, trigger_type, frequency, cron_expression, weekdays, timezone, one_off_ms, integration_config, webhook_config, runner_config, updated_by, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[flow-automations] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load automations.' })
  }

  return (data ?? []) as FlowAutomationRow[]
})
