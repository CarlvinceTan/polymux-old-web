import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// GET /api/workspaces/[id]/workflow-schedules
// Returns every schedule row for the workspace. Used by the dashboard usage
// page to project recurring cost across active schedules.

interface WorkflowScheduleRow {
  session_id: string
  workspace_id: string
  active: boolean
  frequency: string
  cron_expression: string
  weekdays: number[]
  timezone: string
  one_off_ms: number[]
  updated_by: string
  created_at: string
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this workspace.' })
  }

  // workflow_schedules isn't in the generated Supabase types yet.
  const admin = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: unknown
            error: { message: string } | null
          }>
        }
      }
    }
  }
  const { data, error } = await admin
    .from('workflow_schedules')
    .select('session_id, workspace_id, active, frequency, cron_expression, weekdays, timezone, one_off_ms, updated_by, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[workflow-schedules] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load schedules.' })
  }

  return (data ?? []) as unknown as WorkflowScheduleRow[]
})
