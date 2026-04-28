import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// DELETE /api/workspaces/[id]/workflow-schedules/[workflowId]
// Removes the persisted schedule for a workflow. RLS requires workspace
// membership; additional membership check here for a clean 403 message.

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
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
        }
      }
    }
  }
  const { error } = await admin
    .from('workflow_schedules')
    .delete()
    .eq('workflow_id', workflowId)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('[workflow-schedules] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete schedule.' })
  }

  return { ok: true as const }
})
