import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { createHash } from 'node:crypto'
import { fetchManifest, SafeFetchError } from '~~/server/utils/integrationFetch'
import { validateManifest, ManifestValidationError } from '~~/server/utils/integrationManifest'
import { generateSigningSecret } from '~~/server/utils/integrationSignature'
import { encryptToken } from '~~/server/utils/tokenCrypto'
import { isConnectorId } from '~~/server/connectors/registry'

// POST /api/marketplace/integrations
//
// Publishes a third-party integration. The author POSTs `{ manifest_url }`;
// Polymux fetches the manifest (SSRF-defended), validates it, and inserts:
//   - one `integrations` row (kind='integration', visibility='private',
//     author_user_id=current user)
//   - one `integration_versions` row (status='published') with a freshly
//     generated signing secret, encrypted at rest. Plaintext is returned
//     ONCE in the response so the author can paste it into their plugin's
//     env. Polymux can't show it again — it's hashed nowhere; just rotate
//     by publishing a new version.
//
// First-party slugs are reserved (`google-drive`, `gmail`, etc.) and rejected
// here so a third party can't claim them. Same goes for slugs that already
// exist with a different author, or that the same author has already
// registered as a workflow or plugin — slugs share one namespace across
// all three kinds.

interface PublishBody {
  manifest_url?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<PublishBody>(event)
  const manifestUrl = typeof body?.manifest_url === 'string' ? body.manifest_url : ''
  if (!manifestUrl) {
    throw createError({ statusCode: 400, statusMessage: 'manifest_url is required.' })
  }

  // 1. Fetch and validate.
  let manifest
  let raw: string
  try {
    const fetched = await fetchManifest(manifestUrl)
    raw = fetched.raw
    manifest = validateManifest(fetched.parsed)
  }
  catch (err) {
    if (err instanceof SafeFetchError) {
      throw createError({ statusCode: 400, statusMessage: `Manifest fetch failed: ${err.message}` })
    }
    if (err instanceof ManifestValidationError) {
      throw createError({ statusCode: 400, statusMessage: err.message })
    }
    throw createError({ statusCode: 400, statusMessage: `Manifest invalid: ${(err as Error).message}` })
  }

  // 2. Reserved-slug check. First-party connector slugs (google-drive, gmail,
  //    etc.) can't be claimed by third parties.
  if (isConnectorId(manifest.identity.slug)) {
    throw createError({
      statusCode: 409,
      statusMessage: `Slug '${manifest.identity.slug}' is reserved for first-party connectors.`,
    })
  }

  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } }
      insert: (row: Record<string, unknown>) => { select: (cols: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } }
      update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
    }
  }

  // 3. Look up an existing row. Three rejection cases, then the publish path:
  //    (a) slug taken by another author → reject.
  //    (b) slug owned by this user but registered as a workflow/plugin →
  //        reject. Slugs are one shared namespace across kinds.
  //    (c) slug owned by this user as an integration → publish a new version.
  const existingRes = await sb.from('integrations').select('id, author_user_id, is_first_party, kind').eq('slug', manifest.identity.slug).maybeSingle()
  if (existingRes.error) {
    console.error('[marketplace publish] slug lookup failed', existingRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to look up existing slug.' })
  }
  const existing = existingRes.data as { id: string, author_user_id?: string | null, is_first_party?: boolean, kind?: string } | null
  if (existing) {
    if (existing.is_first_party) {
      throw createError({ statusCode: 409, statusMessage: 'Slug is reserved for first-party connectors.' })
    }
    if (existing.author_user_id && existing.author_user_id !== user.sub) {
      throw createError({ statusCode: 409, statusMessage: 'Slug is owned by another author.' })
    }
    if (existing.kind && existing.kind !== 'integration') {
      throw createError({ statusCode: 409, statusMessage: `Slug is already used as a kind=${existing.kind} listing.` })
    }
  }

  // 4. Resolve the integration row (insert if new).
  let integrationId: string
  if (existing) {
    integrationId = existing.id
  }
  else {
    const author = manifest.identity.author?.name ?? user.email ?? 'Unknown author'
    const insertRes = await sb.from('integrations').insert({
      slug: manifest.identity.slug,
      name: manifest.identity.name,
      description: manifest.identity.description ?? null,
      kind: 'integration',
      visibility: 'private',
      author_user_id: user.sub,
      author_name: author,
      homepage_url: manifest.identity.homepage ?? null,
      source_repo_url: manifestUrl,
      icon_url: manifest.identity.icon ?? null,
      tags: manifest.identity.tags ?? [],
    }).select('id').single()
    if (insertRes.error || !insertRes.data) {
      console.error('[marketplace publish] integrations insert failed', insertRes.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to insert integration row.' })
    }
    integrationId = (insertRes.data as { id: string }).id
  }

  // 5. Insert the version. A re-publish of the same `version` would conflict
  //    on the unique (integration_id, version) index — we surface that as a
  //    409 so authors bump the manifest version explicitly.
  const signingSecret = generateSigningSecret()
  const sha256 = createHash('sha256').update(raw).digest('hex')
  const versionRes = await sb.from('integration_versions').insert({
    integration_id: integrationId,
    version: manifest.identity.version,
    manifest: manifest as unknown as Record<string, unknown>,
    manifest_sha256: sha256,
    manifest_url: manifestUrl,
    webhook_signing_secret_enc: encryptToken(signingSecret),
    status: 'published',
    published_at: new Date().toISOString(),
  }).select('id, version').single()
  if (versionRes.error || !versionRes.data) {
    const msg = versionRes.error?.message ?? ''
    if (msg.includes('duplicate') || msg.includes('unique')) {
      throw createError({ statusCode: 409, statusMessage: `Version ${manifest.identity.version} already published. Bump the manifest version.` })
    }
    console.error('[marketplace publish] versions insert failed', versionRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to insert integration version.' })
  }
  const newVersionId = (versionRes.data as { id: string }).id

  // 6. Point the catalog row at this version (current).
  const updateRes = await sb.from('integrations').update({ current_version_id: newVersionId }).eq('id', integrationId)
  if (updateRes.error) {
    console.error('[marketplace publish] current_version_id update failed', updateRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update current_version_id.' })
  }

  return {
    ok: true as const,
    integration_id: integrationId,
    version_id: newVersionId,
    slug: manifest.identity.slug,
    version: manifest.identity.version,
    /**
     * Plaintext signing secret. Returned ONCE — Polymux only stores the
     * encrypted form. The author should paste this into their plugin's
     * environment as POLYMUX_SIGNING_SECRET.
     */
    signing_secret: signingSecret,
  }
})
