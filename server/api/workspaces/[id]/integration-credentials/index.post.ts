import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { encryptFields, buildHint } from '~~/server/utils/integrations/pluginCredentials'

// POST /api/workspaces/[id]/integration-credentials
// Body: { integration_id, credential_key, credential_type, fields: Record<string,string> }
//
// Upserts a workspace's own (BYO) credential override for one integration
// credential. Secret fields are encrypted per-field; only a hint is returned.
// Owner/admin gated. This override takes precedence over any Polymux-managed
// default at resolve time (see pluginCredentials.ts).

const TYPES = ['oauth_client', 'api_key', 'basic', 'custom']

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })

  const body = await readBody<{ integration_id?: unknown, credential_key?: unknown, credential_type?: unknown, fields?: unknown }>(event)
  const integrationId = typeof body?.integration_id === 'string' ? body.integration_id : ''
  const key = typeof body?.credential_key === 'string' ? body.credential_key.trim() : ''
  const type = typeof body?.credential_type === 'string' ? body.credential_type : ''
  if (!integrationId || !key) throw createError({ statusCode: 400, statusMessage: 'integration_id and credential_key are required.' })
  if (!TYPES.includes(type)) throw createError({ statusCode: 400, statusMessage: `credential_type must be ${TYPES.join('|')}.` })
  if (!body?.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) {
    throw createError({ statusCode: 400, statusMessage: 'fields must be an object of { name: value }.' })
  }
  const rawFields: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.fields as Record<string, unknown>)) {
    if (typeof v === 'string' && v.length > 0) rawFields[k] = v
  }
  if (Object.keys(rawFields).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one non-empty field value is required.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: mErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (mErr || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can manage credentials.' })
  }

  const sb = supabase as unknown as { from: (t: string) => any }
  const { data, error } = await sb
    .from('workspace_integration_credentials')
    .upsert({
      workspace_id: workspaceId,
      integration_id: integrationId,
      credential_key: key,
      credential_type: type,
      fields_enc: encryptFields(rawFields),
      hint: buildHint(rawFields),
      created_by: user.sub,
    }, { onConflict: 'workspace_id,integration_id,credential_key' })
    .select('id, integration_id, credential_key, credential_type, hint, updated_at')
    .single()
  if (error || !data) {
    console.error('[ws integration-credentials] upsert error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save credential.' })
  }
  return data
})
