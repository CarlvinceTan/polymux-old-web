import type { AutomationInput, FlowAutomationRow } from '~~/server/utils/flows/automations'
import { assertFlowInWorkspace, assertIntegrationConnection, requireWorkspaceMember, sanitizeAutomationInput } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })

  const body = await readBody<AutomationInput>(event).catch(() => ({}))
  const { user, supabase } = await requireWorkspaceMember(event, workspaceId)
  const row = sanitizeAutomationInput(body, workspaceId, user.sub)
  if (!row.flow_id) throw createError({ statusCode: 400, statusMessage: 'Flow ID is required.' })
  await assertFlowInWorkspace(supabase, row.flow_id, workspaceId)
  if (row.trigger_type === 'integration') {
    await assertIntegrationConnection(supabase, workspaceId, String(row.integration_config.provider ?? ''))
  }

  const admin = supabase as unknown as {
    from: (table: string) => {
      insert: (row: unknown) => {
        select: (cols: string) => { single: () => Promise<{ data: unknown, error: { message: string } | null }> }
      }
    }
  }
  const { data, error } = await admin
    .from('flow_automations')
    .insert(row)
    .select('id, workspace_id, flow_id, name, active, trigger_type, frequency, cron_expression, weekdays, timezone, one_off_ms, integration_config, webhook_config, runner_config, updated_by, created_at, updated_at')
    .single()

  if (error) {
    console.error('[flow-automations] create error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create automation.' })
  }
  return data as FlowAutomationRow
})
