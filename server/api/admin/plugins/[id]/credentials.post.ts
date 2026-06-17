import { requireMaintainer, envMaintainerId } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'
import { encryptFields, buildHint } from '~~/server/utils/integrations/pluginCredentials'

// POST /api/admin/plugins/[id]/credentials
// Body: { key: string, type: string, provider?: string, fields: Record<string,string>, scopes?: string[] }
//
// Provisions a Polymux-managed credential for an integration (the "team adds
// what's necessary" step). Secret fields are encrypted per-field with web's
// INTEGRATION_ENCRYPTION_KEY and upserted into integration_credentials; only a
// non-secret hint (last 4) is ever returned. Maintainer-gated.
//
// Provisioning is blocked when the admin env is 'prod' because encryption uses
// web's (dev) key — a prod managed secret needs PROD_INTEGRATION_ENCRYPTION_KEY,
// which isn't wired yet. Resolving + decrypting at runtime is unaffected.

const TYPES = ['oauth_client', 'api_key', 'basic', 'custom']

export default defineEventHandler(async (event) => {
  const m = await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const { env, client } = adminServiceClient(event)
  if (env !== 'dev') {
    throw createError({ statusCode: 400, statusMessage: 'Provisioning managed credentials against prod requires PROD_INTEGRATION_ENCRYPTION_KEY (not configured). Switch the env to dev to provision.' })
  }

  const body = await readBody<{ key?: unknown, type?: unknown, provider?: unknown, fields?: unknown, scopes?: unknown }>(event)
  const key = typeof body?.key === 'string' ? body.key.trim() : ''
  const type = typeof body?.type === 'string' ? body.type : ''
  if (!key) throw createError({ statusCode: 400, statusMessage: 'key is required.' })
  if (!TYPES.includes(type)) throw createError({ statusCode: 400, statusMessage: `type must be ${TYPES.join('|')}.` })
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
  const scopes = Array.isArray(body?.scopes) ? (body.scopes as unknown[]).filter(s => typeof s === 'string') as string[] : []
  const provider = typeof body?.provider === 'string' ? body.provider : null

  const sb = client as unknown as { from: (t: string) => any }
  const provisionedBy = await envMaintainerId(client, m.email)

  const { error } = await sb
    .from('integration_credentials')
    .upsert({
      integration_id: id,
      credential_key: key,
      credential_type: type,
      provider,
      fields_enc: encryptFields(rawFields),
      scopes,
      hint: buildHint(rawFields),
      provisioned_by: provisionedBy,
    }, { onConflict: 'integration_id,credential_key' })
  if (error) {
    console.error('[admin/plugins credentials] upsert failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to provision credential.' })
  }
  return { env, key, hint: buildHint(rawFields), provisioned: true }
})
