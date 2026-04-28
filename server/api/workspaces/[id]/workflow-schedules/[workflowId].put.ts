import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// PUT /api/workspaces/[id]/workflow-schedules/[workflowId]
// Upsert schedule for a workflow. Body carries the full config; server
// enforces field shape and lets RLS gate workspace membership.

const FREQUENCIES = ['none', 'hourly', 'daily', 'weekly', 'monthly', 'custom'] as const
type Frequency = typeof FREQUENCIES[number]

interface UpsertBody {
  active?: unknown
  frequency?: unknown
  cron_expression?: unknown
  weekdays?: unknown
  timezone?: unknown
  one_off_ms?: unknown
}

function isFrequency(v: unknown): v is Frequency {
  return typeof v === 'string' && (FREQUENCIES as readonly string[]).includes(v)
}

function toIntArray(v: unknown, min: number, max: number): number[] {
  if (!Array.isArray(v)) return []
  const out: number[] = []
  for (const raw of v) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= min && n <= max) out.push(Math.floor(n))
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

function toMsArray(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  const out: number[] = []
  for (const raw of v) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) out.push(Math.floor(n))
  }
  return out
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  const workflowId = getRouterParam(event, 'workflowId')
  if (!workspaceId || !workflowId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace id and workflow id are required.' })
  }

  const body = (await readBody<UpsertBody>(event).catch(() => ({}))) as UpsertBody
  if (!isFrequency(body.frequency)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid frequency.' })
  }

  const supabase = await serverSupabaseClient(event)

  // Membership check — redundant with RLS but surfaces a clean 403.
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this workspace.' })
  }

  const row = {
    workflow_id: workflowId,
    workspace_id: workspaceId,
    active: Boolean(body.active),
    frequency: body.frequency,
    cron_expression: typeof body.cron_expression === 'string' ? body.cron_expression : '',
    weekdays: toIntArray(body.weekdays, 0, 6),
    timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC',
    one_off_ms: toMsArray(body.one_off_ms),
    updated_by: user.sub,
  }

  // workflow_schedules isn't in the generated Supabase types yet (new table).
  // Cast through unknown to keep the runtime path clean — same pattern as
  // server/utils/driveTokens.ts.
  const admin = supabase as unknown as {
    from: (table: string) => {
      upsert: (row: unknown, opts: { onConflict: string }) => {
        select: (cols: string) => { single: () => Promise<{ data: unknown, error: { message: string } | null }> }
      }
    }
  }
  const { data, error } = await admin
    .from('workflow_schedules')
    .upsert(row, { onConflict: 'workflow_id' })
    .select('workflow_id, workspace_id, active, frequency, cron_expression, weekdays, timezone, one_off_ms, updated_by, created_at, updated_at')
    .single()

  if (error) {
    console.error('[workflow-schedules] upsert error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save schedule.' })
  }

  return data
})
