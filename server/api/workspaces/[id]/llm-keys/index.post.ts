import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { byokAllowed, isValidProvider } from '~~/server/utils/billing/planLimits'
import { planLimitsEnforce } from '~~/server/utils/billing/planLimitsEnforce'
import { encryptToken } from '~~/server/utils/security/tokenCrypto'

// POST /api/workspaces/[id]/llm-keys
//
// Body: { provider: 'anthropic' | 'openai' | 'gemini', api_key: string }
//
// Stores an encrypted LLM API key for this workspace + provider. Replaces
// any existing key for the same (workspace, provider) pair via upsert so
// rotation is a single round-trip.
//
// Plan gate: Pro+ only. Free workspaces hit 402 with a clear "upgrade"
// message — same status code we use for the other plan-feature gates
// (members cap, storage cap).
//
// Auth: admin/owner of the workspace. Same gate as the other settings
// surfaces. We do NOT validate the key against the provider here — a
// bad key surfaces as a Chat error at runtime, which the user can fix
// by updating the row.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const body = await readBody<{ provider?: unknown; api_key?: unknown }>(event)
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : ''
  const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''

  if (!isValidProvider(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Provider must be anthropic, openai, or gemini.' })
  }
  if (!apiKey || apiKey.length < 16) {
    // 16 is intentionally generous — every real provider key is far longer,
    // but we don't hardcode prefixes so a future provider with a shorter
    // key format still works.
    throw createError({ statusCode: 400, statusMessage: 'API key looks too short.' })
  }

  const supabase = await serverSupabaseClient(event)

  // Owner/admin check + plan check happen in one workspace lookup.
  const { data: ws, error: wsError } = await supabase
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()

  if (wsError || !ws) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found.' })
  }
  if (await planLimitsEnforce() && !byokAllowed(typeof ws.plan === 'string' ? ws.plan : 'free')) {
    throw createError({
      statusCode: 402,
      statusMessage: 'BYOK is available on Pro and above. Upgrade your plan to bring your own LLM API key.',
    })
  }

  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()

  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can manage LLM keys.' })
  }

  const lastFour = apiKey.slice(-4)
  const apiKeyEnc = encryptToken(apiKey)

  const { data, error } = await supabase
    .from('workspace_llm_keys')
    .upsert({
      workspace_id: workspaceId,
      provider,
      api_key_enc: apiKeyEnc,
      last_four: lastFour,
      created_by: user.sub,
    }, { onConflict: 'workspace_id,provider' })
    .select('id, workspace_id, provider, last_four, created_by, created_at, updated_at, last_used_at')
    .single()

  if (error) {
    console.error('[llm-keys] upsert error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save LLM key.' })
  }

  return data
})
