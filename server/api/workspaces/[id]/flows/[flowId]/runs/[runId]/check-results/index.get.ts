import { requireWorkspaceMember } from '~~/server/utils/flows/automations'

export interface FlowCheckResultRow {
  id: string
  flow_run_id: string
  flow_version_id: string | null
  node_id: string
  check_id: string
  label: string
  status: 'passed' | 'failed' | 'changed' | 'needs_review' | 'approved' | 'rejected' | 'skipped'
  mode: 'auto' | 'comparison' | 'review'
  message: string | null
  artifact_ids: string[]
  created_at: string
}

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')
  const flowId = getRouterParam(event, 'flowId')
  const runId = getRouterParam(event, 'runId')
  if (!workspaceId || !flowId || !runId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace, Flow, and run IDs are required.' })
  }

  const { supabase } = await requireWorkspaceMember(event, workspaceId)
  const { data: run, error: runError } = await supabase
    .from('workflow_runs')
    .select('id, workflow_id')
    .eq('id', runId)
    .eq('workflow_id', flowId)
    .maybeSingle()
  if (runError || !run) throw createError({ statusCode: 404, statusMessage: 'Run not found.' })

  const api = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown, error: { message: string } | null }>
        }
      }
    }
  }
  const { data, error } = await api
    .from('flow_check_results')
    .select('id, flow_run_id, flow_version_id, node_id, check_id, label, status, mode, message, artifact_ids, created_at')
    .eq('flow_run_id', runId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[flow-check-results] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load check results.' })
  }

  return { check_results: (data ?? []) as FlowCheckResultRow[] }
})
