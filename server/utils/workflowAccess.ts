import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/app/types/database.types'
import type { H3Event } from 'h3'

type TypedSupabaseClient = SupabaseClient<Database>

// Shared helpers for workflow-scoped routes (currently used by
// /api/workflows/[id]/artifacts/*).
//
// Workflow membership is implicit: a user can read a workflow iff they're a
// member of the workspace that owns it. The workflow row carries the
// workspace id; one round-trip joins both checks.

export function resolveWorkflowId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Workflow ID is required.' })
  }
  return id
}

export function resolveArtifactId(event: H3Event): string {
  const aid = getRouterParam(event, 'aid')
  if (!aid) {
    throw createError({ statusCode: 400, statusMessage: 'Artifact ID is required.' })
  }
  return aid
}

export interface WorkflowAccess {
  workflowId: string
  workspaceId: string
}

// assertWorkflowMember loads the workflow row + verifies the user is a workspace
// member. Returns the workspace id so callers don't need a second query for
// permission checks against workspace-scoped helpers (effective_file_permission, etc.).
export async function assertWorkflowMember(
  supabase: TypedSupabaseClient,
  workflowId: string,
  userId: string,
): Promise<WorkflowAccess> {
  const { data: workflow, error: workflowErr } = await supabase
    .from('workflows')
    .select('id, workspace_id')
    .eq('id', workflowId)
    .single()
  if (workflowErr || !workflow?.workspace_id) {
    throw createError({ statusCode: 404, statusMessage: 'Workflow not found.' })
  }

  const { data: member, error: memberErr } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workflow.workspace_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (memberErr || !member) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this workflow\'s workspace.' })
  }

  return { workflowId: workflow.id, workspaceId: workflow.workspace_id }
}
