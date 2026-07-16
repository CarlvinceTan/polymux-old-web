import { timingSafeEqual } from 'node:crypto'
import {
  automationMatchesIntegration,
  connectionSecret,
  loadTriggerProviderConnections,
  queueAutomationRun,
  stableHash,
  verifyGitlabStandardWebhook,
  type FlowAutomationRow,
} from '~~/server/utils/flows/automations'
import { serverSupabaseServiceRole } from '#supabase/server'

function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (!expected || !actual) return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function gitlabSummary(eventType: string, payload: Record<string, unknown>) {
  const project = payload.project as Record<string, unknown> | undefined
  const attrs = payload.object_attributes as Record<string, unknown> | undefined
  const ref = typeof payload.ref === 'string' ? payload.ref : ''
  return {
    project_path: project?.path_with_namespace,
    repository_full_name: project?.path_with_namespace,
    branch: ref.replace(/^refs\/(?:heads|tags)\//, '') || attrs?.target_branch || attrs?.source_branch,
    source_branch: attrs?.source_branch,
    target_branch: attrs?.target_branch,
    action: attrs?.action,
    event_type: eventType,
    title: attrs?.title,
    iid: attrs?.iid,
    status: attrs?.status || attrs?.state,
  }
}

function normalizeGitlabEvent(rawEvent: string, payload: Record<string, unknown>): string {
  if (rawEvent === 'Merge Request Hook') {
    const attrs = payload.object_attributes as Record<string, unknown> | undefined
    const action = String(attrs?.action ?? 'updated')
    if (action === 'merge' || action === 'merged') return 'merge_request.merged'
    return `merge_request.${action}`
  }
  if (rawEvent === 'Push Hook') return 'push'
  if (rawEvent === 'Tag Push Hook') return 'tag_push'
  if (rawEvent === 'Pipeline Hook') return 'pipeline'
  if (rawEvent === 'Job Hook') return 'job'
  if (rawEvent === 'Deployment Hook') return 'deployment'
  if (rawEvent === 'Release Hook') return 'release'
  return rawEvent.toLowerCase().replace(/\s+/g, '_')
}

export default defineEventHandler(async (event) => {
  const raw = await readRawBody(event, 'utf8')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Empty payload.' })

  const payload = JSON.parse(raw) as Record<string, unknown>
  const providerEvent = getHeader(event, 'x-gitlab-event') || 'gitlab'
  const eventType = normalizeGitlabEvent(providerEvent, payload)
  const summary = gitlabSummary(eventType, payload)
  const delivery = getHeader(event, 'webhook-id')
    || getHeader(event, 'idempotency-key')
    || getHeader(event, 'x-gitlab-webhook-uuid')
    || stableHash(raw)
  const token = getHeader(event, 'x-gitlab-token')
  const signatureHeaders = {
    id: getHeader(event, 'webhook-id'),
    timestamp: getHeader(event, 'webhook-timestamp'),
    signature: getHeader(event, 'webhook-signature'),
  }

  const connections = await loadTriggerProviderConnections(event, 'gitlab')
  const globalSecret = process.env.POLYMUX_GITLAB_WEBHOOK_SECRET || process.env.GITLAB_WEBHOOK_SECRET || ''
  const globalVerified = !!globalSecret && (
    tokenMatches(token, globalSecret)
    || verifyGitlabStandardWebhook(raw, signatureHeaders, globalSecret)
  )
  const verifiedWorkspaceIds = globalVerified
    ? null
    : new Set(
      connections
        .filter((connection) => {
          const secret = connectionSecret(connection)
          return tokenMatches(token, secret) || verifyGitlabStandardWebhook(raw, signatureHeaders, secret)
        })
        .map(connection => connection.workspace_id),
    )
  if (!globalVerified && verifiedWorkspaceIds.size === 0) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid GitLab token.' })
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
    .filter(a => automationMatchesIntegration(a, 'gitlab', eventType, summary))

  const queued = []
  for (const automation of matches) {
    queued.push(await queueAutomationRun({
      event,
      automation,
      provider: 'gitlab',
      eventType,
      idempotencyKey: `${delivery}:${automation.id}`,
      summary,
      trigger: 'integration',
    }))
  }

  return { ok: true, matched: matches.length, queued }
})
