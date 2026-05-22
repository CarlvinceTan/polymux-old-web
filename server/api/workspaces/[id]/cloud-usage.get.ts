import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { cloudCap } from '~~/server/utils/billing/planLimits'
import { assertMembership, resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'

// GET /api/workspaces/[id]/cloud-usage
// Returns the workspace's polymux-managed Cloud (Backblaze B2) usage and the
// plan-derived cap. Mirrors the Drive usage endpoint's shape — `{ usage, limit }`
// — so the client composable can render both behind the same card type.
//
// `limit` is null on the (currently unused) enterprise-unlimited path; for
// concrete plans it's a positive byte count. On Free workspaces the limit is
// zero — the client should treat that as "Cloud not available on this plan"
// and surface the locked UI rather than a 0% bar.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()
  if (wsError || !workspace) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load workspace plan.' })
  }
  const plan = typeof workspace.plan === 'string' ? workspace.plan : 'free'

  // Sum every B2-backed file row's recorded size. Drive/Local files are
  // ignored here — they don't draw against the polymux-managed cap.
  const admin = serverSupabaseServiceRole(event)
  const { data: rows, error: filesError } = await admin
    .from('files')
    .select('size_bytes')
    .eq('workspace_id', workspaceId)
    .eq('backend', 'b2')
  if (filesError) {
    console.error('[cloud-usage] files query error', filesError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load cloud usage.' })
  }

  let usage = 0
  for (const row of rows ?? []) {
    const n = Number((row as { size_bytes?: number | null }).size_bytes ?? 0)
    if (Number.isFinite(n) && n > 0) usage += Math.floor(n)
  }

  const cap = cloudCap(plan)
  // cap > 0 → tracked. cap == 0 → Cloud disabled on this plan; client renders
  // locked. We still return `limit: 0` so the composable can detect that.
  return {
    ok: true as const,
    usage,
    limit: cap,
  }
})
