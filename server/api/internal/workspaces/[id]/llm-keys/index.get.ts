import { serverSupabaseServiceRole } from '#supabase/server'
import { decryptToken } from '~~/server/utils/security/tokenCrypto'
import { requirePolymuxSecret } from '~~/server/utils/security/internalAuth'
import { resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'

// GET /api/internal/workspaces/[id]/llm-keys
//
// Returns the decrypted BYOK API keys for the workspace, one row per
// provider. Polymux Go calls this with the shared internal secret so the
// BYOK resolver can substitute the workspace's key into the runtime
// ChatModel without ever needing the encryption key on the Go side.
//
// Response shape:
//   [{ provider: 'anthropic', api_key: 'sk-ant-...', api_base: null, last_used_at: null }, …]
//
// Empty list means "use the server's configured key" — handled by the
// resolver as a fallback. Decryption errors on individual rows are logged
// and the row is skipped; we'd rather hand back the other providers than
// fail the whole resolve.

interface InternalLLMKey {
  provider: string
  api_key: string
  api_base: string | null
  last_used_at: string | null
}

export default defineEventHandler(async (event): Promise<InternalLLMKey[]> => {
  await requirePolymuxSecret(event)
  const workspaceId = resolveWorkspaceId(event)
  const admin = serverSupabaseServiceRole(event)

  const { data, error } = await admin
    .from('workspace_llm_keys')
    .select('provider, api_key_enc, api_base, last_used_at')
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('[internal/llm-keys] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read LLM keys.' })
  }

  const out: InternalLLMKey[] = []
  for (const row of data ?? []) {
    try {
      out.push({
        provider: row.provider,
        api_key: decryptToken(row.api_key_enc),
        api_base: row.api_base ?? null,
        last_used_at: row.last_used_at,
      })
    }
    catch (err) {
      console.error('[internal/llm-keys] decrypt failed; skipping row',
        { workspaceId, provider: row.provider, err })
    }
  }
  return out
})
