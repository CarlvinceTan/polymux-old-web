import { queueAutomationRun, stableHash, type FlowAutomationRow } from '~~/server/utils/flows/automations'
import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const secret = getRouterParam(event, 'secret')
  if (!secret) throw createError({ statusCode: 404, statusMessage: 'Webhook not found.' })

  const raw = await readRawBody(event, 'utf8')
  const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}
  const admin = serverSupabaseServiceRole(event)

  const { data, error } = await (admin as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ data: unknown, error: { message: string } | null }>
        }
      }
    }
  })
    .from('flow_automations')
    .select('id, workspace_id, flow_id, name, active, trigger_type, frequency, cron_expression, weekdays, timezone, one_off_ms, integration_config, webhook_config, runner_config, updated_by, created_at, updated_at')
    .eq('active', true)
    .eq('trigger_type', 'webhook')

  if (error) throw createError({ statusCode: 500, statusMessage: 'Failed to load automations.' })
  const automation = ((data ?? []) as FlowAutomationRow[])
    .find(a => String(a.webhook_config?.secret ?? '') === secret)
  if (!automation) throw createError({ statusCode: 404, statusMessage: 'Webhook not found.' })

  const eventType = String(payload.event_type ?? payload.type ?? 'webhook')
  const summary = {
    event_type: eventType,
    payload_preview: Object.fromEntries(Object.entries(payload).slice(0, 24)),
  }
  const queued = await queueAutomationRun({
    event,
    automation,
    provider: 'webhook',
    eventType,
    idempotencyKey: `${stableHash(raw || JSON.stringify(payload))}:${automation.id}`,
    summary,
    trigger: 'webhook',
  })

  return { ok: true, queued }
})
