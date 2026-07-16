import {
  automationMatchesIntegration,
  connectionSecret,
  loadTriggerProviderConnections,
  queueAutomationRun,
  stableHash,
  verifyHmacHeader,
  type FlowAutomationRow,
} from '~~/server/utils/flows/automations'
import { serverSupabaseServiceRole } from '#supabase/server'

function githubSummary(eventType: string, payload: Record<string, unknown>) {
  const repository = payload.repository as Record<string, unknown> | undefined
  const pullRequest = payload.pull_request as Record<string, unknown> | undefined
  const deployment = payload.deployment as Record<string, unknown> | undefined
  const deploymentStatus = payload.deployment_status as Record<string, unknown> | undefined
  const workflowRun = payload.workflow_run as Record<string, unknown> | undefined
  const ref = typeof payload.ref === 'string' ? payload.ref : ''
  const head = pullRequest?.head as Record<string, unknown> | undefined
  const base = pullRequest?.base as Record<string, unknown> | undefined
  return {
    repository_full_name: repository?.full_name,
    branch: ref.replace(/^refs\/(?:heads|tags)\//, '') || head?.ref || deployment?.ref || workflowRun?.head_branch,
    source_branch: head?.ref,
    target_branch: base?.ref,
    action: payload.action,
    event_type: eventType,
    sender: (payload.sender as Record<string, unknown> | undefined)?.login,
    title: pullRequest?.title,
    number: pullRequest?.number,
    merged: pullRequest?.merged,
    status: deploymentStatus?.state || workflowRun?.conclusion || workflowRun?.status,
  }
}

function normalizeGithubEvent(rawEvent: string, payload: Record<string, unknown>): string {
  if (rawEvent === 'pull_request') {
    const pr = payload.pull_request as Record<string, unknown> | undefined
    if (payload.action === 'closed' && pr?.merged === true) return 'pull_request.merged'
    return `pull_request.${String(payload.action ?? 'updated')}`
  }
  if (rawEvent === 'push' && typeof payload.ref === 'string' && payload.ref.startsWith('refs/tags/')) return 'tag_push'
  if (rawEvent === 'push') return 'push'
  if (rawEvent === 'create' && payload.ref_type === 'tag') return 'tag_push'
  if (rawEvent === 'deployment_status') return 'deployment'
  if (rawEvent === 'workflow_run') return 'workflow_run.completed'
  return rawEvent
}

export default defineEventHandler(async (event) => {
  const raw = await readRawBody(event, 'utf8')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Empty payload.' })

  const payload = JSON.parse(raw) as Record<string, unknown>
  const providerEvent = getHeader(event, 'x-github-event') || 'github'
  const eventType = normalizeGithubEvent(providerEvent, payload)
  const delivery = getHeader(event, 'x-github-delivery') || stableHash(raw)
  const summary = githubSummary(eventType, payload)
  const signature = getHeader(event, 'x-hub-signature-256')

  const connections = await loadTriggerProviderConnections(event, 'github')
  const globalSecret = process.env.POLYMUX_GITHUB_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET || ''
  const globalVerified = !!globalSecret && verifyHmacHeader(raw, signature, globalSecret, 'sha256=')
  const verifiedWorkspaceIds = globalVerified
    ? null
    : new Set(
      connections
        .filter(connection => verifyHmacHeader(raw, signature, connectionSecret(connection), 'sha256='))
        .map(connection => connection.workspace_id),
    )
  if (!globalVerified && verifiedWorkspaceIds.size === 0) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid GitHub signature.' })
  }

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
    .eq('trigger_type', 'integration')

  if (error) throw createError({ statusCode: 500, statusMessage: 'Failed to load automations.' })
  const matches = ((data ?? []) as FlowAutomationRow[])
    .filter(a => globalVerified || verifiedWorkspaceIds.has(a.workspace_id))
    .filter(a => automationMatchesIntegration(a, 'github', eventType, summary))

  const queued = []
  for (const automation of matches) {
    queued.push(await queueAutomationRun({
      event,
      automation,
      provider: 'github',
      eventType,
      idempotencyKey: `${delivery}:${automation.id}`,
      summary,
      trigger: 'integration',
    }))
  }

  return { ok: true, matched: matches.length, queued }
})
