import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// GET /api/admin/plugins/[id]
//
// Maintainer-gated detail for the review queue: the catalog row, its current
// version's manifest, the credentials the manifest declares, and which of those
// have a Polymux-managed credential provisioned.

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const { data: integration, error } = await sb
    .from('integrations')
    .select('id, slug, name, description, kind, visibility, is_first_party, is_verified, review_status, review_notes, reviewed_by, reviewed_at, author_name, author_user_id, homepage_url, source_repo_url, current_version_id, install_count, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[admin/plugins detail] load error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load plugin.' })
  }
  if (!integration) throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  let version: { version: string, status: string, manifest_url: string | null, published_at: string | null } | null = null
  let manifest: Record<string, unknown> | null = null
  let declared: Array<Record<string, unknown>> = []
  if (integration.current_version_id) {
    const { data: ver } = await sb
      .from('integration_versions')
      .select('version, manifest, manifest_url, status, published_at')
      .eq('id', integration.current_version_id)
      .maybeSingle()
    if (ver) {
      version = { version: ver.version, status: ver.status, manifest_url: ver.manifest_url ?? null, published_at: ver.published_at ?? null }
      manifest = (ver.manifest as Record<string, unknown>) ?? null
      const c = (manifest as { credentials?: unknown })?.credentials
      if (Array.isArray(c)) declared = c as Array<Record<string, unknown>>
    }
  }

  const { data: creds } = await sb
    .from('integration_credentials')
    .select('credential_key, hint, updated_at')
    .eq('integration_id', id)
  const provisioned = new Map<string, { hint: unknown, updated_at: string }>()
  for (const row of creds ?? []) provisioned.set(row.credential_key, { hint: row.hint, updated_at: row.updated_at })

  return {
    env,
    integration,
    version,
    manifest,
    credentials: declared.map((d) => {
      const key = typeof d.key === 'string' ? d.key : ''
      const p = provisioned.get(key)
      return { ...d, provisioned: !!p, hint: p?.hint ?? null }
    }),
  }
})
