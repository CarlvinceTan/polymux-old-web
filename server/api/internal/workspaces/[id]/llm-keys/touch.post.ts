import { serverSupabaseServiceRole } from '#supabase/server'
import { requirePolymuxSecret } from '~~/server/utils/security/internalAuth'
import { resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'

// POST /api/internal/workspaces/[id]/llm-keys/touch
//
// Body: { provider: string }
//
// Updates last_used_at on the matching workspace_llm_keys row so the UI
// can show "Last used 4m ago" next to each key. Polymux calls this from
// the BYOK resolver on the first cache miss for a (workspace, provider)
// pair; it's intentionally fire-and-forget — a failure here is logged
// and ignored so it can never block a Chat() call.

export default defineEventHandler(async (event) => {
  await requirePolymuxSecret(event)
  const workspaceId = resolveWorkspaceId(event)

  const body = await readBody<{ provider?: unknown }>(event)
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : ''
  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: 'provider is required.' })
  }

  const admin = serverSupabaseServiceRole(event)
  const { error } = await admin
    .from('workspace_llm_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)

  if (error) {
    console.error('[internal/llm-keys/touch] update error', error)
    return { ok: false as const }
  }
  return { ok: true as const }
})
