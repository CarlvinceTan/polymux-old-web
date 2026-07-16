import type { AutomationInput, FlowAutomationRow } from '~~/server/utils/flows/automations'
import { assertFlowInWorkspace, assertIntegrationConnection, requireWorkspaceMember, sanitizeAutomationInput } from '~~/server/utils/flows/automations'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  const automationId = getRouterParam(event, 'automationId')
  if (!workspaceId || !automationId) throw createError({ statusCode: 400, statusMessage: 'Workspace and automation IDs are required.' })

  const body = await readBody<AutomationInput>(event).catch(() => ({}))
  const { user, supabase } = await requireWorkspaceMember(event, workspaceId)
  const api = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown, error: { message: string } | null }> }
        }
      }
      update: (row: unknown) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            select: (cols: string) => { single: () => Promise<{ data: unknown, error: { message: string } | null }> }
          }
        }
      }
    }
  }
  const { data: existing, error: findError } = await api
    .from('flow_automations')
    .select('id, workspace_id, flow_id, name, active, trigger_type, frequency, cron_expression, weekdays, timezone, one_off_ms, integration_config, webhook_config, runner_config, updated_by, created_at, updated_at')
    .eq('id', automationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (findError || !existing) throw createError({ statusCode: 404, statusMessage: 'Automation not found.' })

  const row = sanitizeAutomationInput(body, workspaceId, user.sub, existing as FlowAutomationRow)
  if (!row.flow_id) throw createError({ statusCode: 400, statusMessage: 'Flow ID is required.' })
  await assertFlowInWorkspace(supabase, row.flow_id, workspaceId)
  if (row.trigger_type === 'integration') {
    await assertIntegrationConnection(supabase, workspaceId, String(row.integration_config.provider ?? ''))
  }

  const { data, error } = await api
    .from('flow_automations')
    .update(row)
    .eq('id', automationId)
    .eq('workspace_id', workspaceId)
    .select('id, workspace_id, flow_id, name, active, trigger_type, frequency, cron_expression, weekdays, timezone, one_off_ms, integration_config, webhook_config, runner_config, updated_by, created_at, updated_at')
    .single()

  if (error) {
    console.error('[flow-automations] update error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update automation.' })
  }
  return data as FlowAutomationRow
})
