import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

export const AUTOMATION_TRIGGERS = ['schedule', 'integration', 'webhook'] as const
export type AutomationTrigger = typeof AUTOMATION_TRIGGERS[number]
export const SCHEDULE_FREQUENCIES = ['none', 'hourly', 'daily', 'weekly', 'monthly', 'custom'] as const
export type ScheduleFrequency = typeof SCHEDULE_FREQUENCIES[number]

export interface FlowAutomationRow {
  id: string
  workspace_id: string
  flow_id: string
  name: string
  active: boolean
  trigger_type: AutomationTrigger
  frequency: ScheduleFrequency
  cron_expression: string
  weekdays: number[]
  timezone: string
  one_off_ms: number[]
  integration_config: Record<string, unknown>
  webhook_config: Record<string, unknown>
  runner_config: Record<string, unknown>
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface AutomationInput {
  flow_id?: unknown
  name?: unknown
  active?: unknown
  trigger_type?: unknown
  frequency?: unknown
  cron_expression?: unknown
  weekdays?: unknown
  timezone?: unknown
  one_off_ms?: unknown
  integration_config?: unknown
  webhook_config?: unknown
  runner_config?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function isTrigger(v: unknown): v is AutomationTrigger {
  return typeof v === 'string' && (AUTOMATION_TRIGGERS as readonly string[]).includes(v)
}

function isFrequency(v: unknown): v is ScheduleFrequency {
  return typeof v === 'string' && (SCHEDULE_FREQUENCIES as readonly string[]).includes(v)
}

function intArray(v: unknown, min: number, max: number): number[] {
  if (!Array.isArray(v)) return []
  const out: number[] = []
  for (const raw of v) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= min && n <= max) out.push(Math.floor(n))
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

function msArray(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return v.map(Number).filter(n => Number.isFinite(n) && n > 0).map(Math.floor)
}

export function newWebhookSecret(): string {
  return randomBytes(24).toString('base64url')
}

export function sanitizeAutomationInput(body: AutomationInput, workspaceId: string, userId: string, existing?: FlowAutomationRow) {
  const trigger = isTrigger(body.trigger_type) ? body.trigger_type : existing?.trigger_type ?? 'schedule'
  const webhookConfig = isRecord(body.webhook_config)
    ? { ...body.webhook_config }
    : { ...(existing?.webhook_config ?? {}) }
  if (trigger === 'webhook' && !webhookConfig.secret) {
    webhookConfig.secret = newWebhookSecret()
  }

  return {
    workspace_id: workspaceId,
    flow_id: typeof body.flow_id === 'string' && body.flow_id ? body.flow_id : existing?.flow_id,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing?.name ?? 'Automation',
    active: typeof body.active === 'boolean' ? body.active : existing?.active ?? false,
    trigger_type: trigger,
    frequency: isFrequency(body.frequency) ? body.frequency : existing?.frequency ?? 'none',
    cron_expression: typeof body.cron_expression === 'string' ? body.cron_expression : existing?.cron_expression ?? '',
    weekdays: Array.isArray(body.weekdays) ? intArray(body.weekdays, 0, 6) : existing?.weekdays ?? [],
    timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : existing?.timezone ?? 'UTC',
    one_off_ms: Array.isArray(body.one_off_ms) ? msArray(body.one_off_ms) : existing?.one_off_ms ?? [],
    integration_config: isRecord(body.integration_config) ? body.integration_config : existing?.integration_config ?? {},
    webhook_config: webhookConfig,
    runner_config: isRecord(body.runner_config) ? body.runner_config : existing?.runner_config ?? { platform: 'web' },
    updated_by: userId,
  }
}

export async function requireWorkspaceMember(event: H3Event, workspaceId: string) {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .maybeSingle()
  if (error || !data) throw createError({ statusCode: 403, statusMessage: 'Not a member of this workspace.' })
  return { user, supabase }
}

export async function assertFlowInWorkspace(supabase: Awaited<ReturnType<typeof serverSupabaseClient>>, flowId: string, workspaceId: string) {
  const { data, error } = await supabase
    .from('workflows')
    .select('id')
    .eq('id', flowId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error || !data) throw createError({ statusCode: 404, statusMessage: 'Flow not found in this workspace.' })
}

export function verifyHmacHeader(raw: string, header: string | undefined, secret: string, prefix: string): boolean {
  if (!secret || !header) return false
  const expected = `${prefix}${createHmac('sha256', secret).update(raw).digest('hex')}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function safeEqualString(actual: string | undefined, expected: string): boolean {
  if (!actual || !expected) return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function verifyGitlabStandardWebhook(raw: string, headers: {
  id?: string
  timestamp?: string
  signature?: string
}, signingToken: string): boolean {
  if (!signingToken || !headers.id || !headers.timestamp || !headers.signature) return false
  if (!signingToken.startsWith('whsec_')) return false
  let key: Buffer
  try {
    key = Buffer.from(signingToken.slice('whsec_'.length), 'base64')
  }
  catch {
    return false
  }
  if (!key.length) return false
  const message = `${headers.id}.${headers.timestamp}.${raw}`
  const expected = `v1,${createHmac('sha256', key).update(message).digest('base64')}`
  return headers.signature.split(/\s+/).some(sig => safeEqualString(sig, expected))
}

export function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export interface TriggerProviderConnection {
  id: string
  workspace_id: string
  provider: string
  metadata: Record<string, unknown>
}

export async function loadTriggerProviderConnections(event: H3Event, provider: 'github' | 'gitlab'): Promise<TriggerProviderConnection[]> {
  const admin = serverSupabaseServiceRole(event)
  const { data, error } = await (admin as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ data: unknown[] | null, error: { message: string } | null }>
        }
      }
    }
  })
    .from('workspace_integrations')
    .select('id, workspace_id, provider, metadata')
    .eq('provider', provider)
    .eq('status', 'active')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: `Failed to load ${provider} connections.` })
  }
  return ((data ?? []) as TriggerProviderConnection[])
    .filter(row => row.metadata && typeof row.metadata === 'object')
}

export function connectionSecret(connection: TriggerProviderConnection): string {
  const secret = connection.metadata?.webhook_secret
  return typeof secret === 'string' ? secret : ''
}

export async function queueAutomationRun(opts: {
  event: H3Event
  automation: FlowAutomationRow
  provider: string
  eventType: string
  idempotencyKey: string
  summary: Record<string, unknown>
  trigger: 'integration' | 'webhook'
}) {
  const admin = serverSupabaseServiceRole(opts.event)
  const { automation } = opts

  const { data: version, error: versionError } = await admin
    .from('workflow_versions')
    .select('id')
    .eq('workflow_id', automation.flow_id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (versionError || !version?.id) {
    return { queued: false, reason: 'no_flow_version' }
  }

  const cleanSummary = { ...opts.summary }

  const { data: eventRow, error: eventError } = await admin
    .from('flow_trigger_events')
    .upsert({
      workspace_id: automation.workspace_id,
      flow_id: automation.flow_id,
      automation_id: automation.id,
      provider: opts.provider,
      event_type: opts.eventType,
      idempotency_key: opts.idempotencyKey,
      status: 'queued',
      summary: cleanSummary,
    }, { onConflict: 'provider,idempotency_key' })
    .select('id, run_id')
    .single()
  if (eventError || !eventRow?.id) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to record trigger event.' })
  }
  if (eventRow.run_id) return { queued: true, run_id: eventRow.run_id, duplicate: true }

  const { data: run, error: runError } = await admin
    .from('workflow_runs')
    .insert({
      workflow_id: automation.flow_id,
      workflow_version_id: version.id,
      status: 'pending',
      trigger: opts.trigger,
      scheduled_for: new Date().toISOString(),
      automation_id: automation.id,
      trigger_event_id: eventRow.id,
      external_event: cleanSummary,
      started_by: automation.updated_by,
      current_node_path: [],
      node_states: {},
    })
    .select('id')
    .single()
  if (runError || !run?.id) {
    await admin.from('flow_trigger_events').update({ status: 'failed', error: runError?.message ?? 'run insert failed' }).eq('id', eventRow.id)
    throw createError({ statusCode: 500, statusMessage: 'Failed to queue flow run.' })
  }

  await admin.from('flow_trigger_events').update({ run_id: run.id, status: 'queued' }).eq('id', eventRow.id)
  return { queued: true, run_id: run.id }
}

export function automationMatchesIntegration(automation: FlowAutomationRow, provider: string, eventType: string, payload: Record<string, unknown>): boolean {
  const cfg = automation.integration_config ?? {}
  if (String(cfg.provider ?? '').toLowerCase() !== provider) return false
  const cfgEvent = String(cfg.event_type ?? cfg.event ?? '').toLowerCase()
  if (cfgEvent && cfgEvent !== eventType) return false
  const repo = String(cfg.repository ?? cfg.repo ?? cfg.project ?? '').toLowerCase()
  const payloadRepo = String(payload.repository_full_name ?? payload.project_path ?? payload.repository ?? '').toLowerCase()
  if (repo && payloadRepo && repo !== payloadRepo) return false
  const branch = String(cfg.branch ?? '').replace(/^refs\/heads\//, '').trim()
  const branchScope = String(cfg.branch_scope ?? 'event').toLowerCase()
  const payloadBranch = String(
    branchScope === 'target'
      ? payload.target_branch ?? payload.branch ?? ''
      : branchScope === 'source'
        ? payload.source_branch ?? payload.branch ?? ''
        : payload.branch ?? '',
  ).replace(/^refs\/heads\//, '').trim()
  const branchMode = String(cfg.branch_match ?? 'exact').toLowerCase()
  if (branch && payloadBranch) {
    if (branchMode === 'prefix' && !payloadBranch.startsWith(branch)) return false
    else if (branchMode === 'contains' && !payloadBranch.includes(branch)) return false
    else if (branchMode === 'glob') {
      const pattern = `^${branch.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
      if (!new RegExp(pattern).test(payloadBranch)) return false
    }
    else if (branchMode !== 'any' && payloadBranch !== branch) return false
  }
  const status = String(cfg.status ?? '').toLowerCase().trim()
  const payloadStatus = String(payload.status ?? payload.state ?? '').toLowerCase().trim()
  if (status && payloadStatus && status !== payloadStatus) return false
  return true
}

export async function assertIntegrationConnection(supabase: Awaited<ReturnType<typeof serverSupabaseClient>>, workspaceId: string, provider: string) {
  if (!provider) return
  const { data, error } = await supabase
    .from('workspace_integrations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !data) {
    throw createError({ statusCode: 400, statusMessage: `Connect ${provider} before creating this automation.` })
  }
}
