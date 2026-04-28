import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { isConnectorId } from '~~/server/connectors/registry'

// GET /api/marketplace/integrations
//
// Lists catalog items the current user can see in the Marketplace UI:
//   - all `visibility = 'public'` rows
//   - all `visibility = 'unlisted'` rows (RLS allows discoverable-by-link;
//     for v1 we surface them in the catalog response too)
//   - rows the user authored
//   - rows installed in any workspace the user belongs to
//
// RLS does the access enforcement; this endpoint just shapes the join.
//
// Each row carries the joined `current_version` (manifest, version, status)
// and a `requires_oauth` hint: true when the slug matches an in-tree
// ConnectorHandler. The frontend uses this to pick the OAuth-redirect path
// for first-party connectors vs the third-party install endpoint (Phase 2).

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  type Row = {
    id: string
    slug: string
    name: string
    description: string | null
    kind: 'integration' | 'workflow' | 'plugin'
    visibility: 'private' | 'unlisted' | 'public'
    author_user_id: string | null
    author_name: string
    homepage_url: string | null
    source_repo_url: string | null
    is_first_party: boolean
    is_verified: boolean
    install_count: number
    tags: string[]
    icon_url: string | null
    current_version_id: string | null
    created_at: string
    updated_at: string
    current_version?: {
      id: string
      version: string
      manifest: Record<string, unknown>
      status: string
      published_at: string | null
    } | null
  }

  const supabase = await serverSupabaseClient(event)
  // The Supabase types don't yet know about the new `integrations` table —
  // cast through `any` so tsc accepts the call. Once `bun x supabase gen
  // types typescript` regenerates the schema types this can drop.
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => { order: (col: string, opts: { ascending: boolean }) => Promise<{ data: Row[] | null, error: { message: string } | null }> }
    }
  }
  const { data, error } = await sb
    .from('integrations')
    .select(`
      id, slug, name, description, kind, visibility,
      author_user_id, author_name, homepage_url, source_repo_url,
      is_first_party, is_verified, install_count, tags, icon_url,
      current_version_id, created_at, updated_at,
      current_version:integration_versions!integrations_current_version_fk (
        id, version, manifest, status, published_at
      )
    `)
    .order('install_count', { ascending: false })

  if (error) {
    console.error('[marketplace] catalog list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load marketplace.' })
  }

  // Live install count: number of workspaces currently connected to each
  // provider. Computed fresh per request from `workspace_integrations` so
  // disconnects decrement the displayed number without needing a counter
  // column or trigger. Service role is used for the aggregate so the count
  // reflects all workspaces, not just ones the user can read via RLS.
  const admin = serverSupabaseServiceRole(event)
  const adminSb = admin as unknown as {
    from: (t: string) => { select: (cols: string) => Promise<{ data: { provider: string }[] | null, error: { message: string } | null }> }
  }
  const { data: connections, error: countError } = await adminSb
    .from('workspace_integrations')
    .select('provider')
  if (countError) {
    console.error('[marketplace] install count error', countError)
  }
  const connectionCounts = new Map<string, number>()
  for (const row of connections ?? []) {
    connectionCounts.set(row.provider, (connectionCounts.get(row.provider) ?? 0) + 1)
  }

  return (data ?? []).map(row => ({
    id: row.slug, // Stable client identifier; matches workspace_integrations.provider for joins.
    /** Database UUID for cases that need the real PK (plugin bundle children, etc.). */
    dbId: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    category: row.kind,
    author: row.author_name,
    isFirstParty: row.is_first_party,
    isVerified: row.is_verified,
    homepageUrl: row.homepage_url,
    sourceRepoUrl: row.source_repo_url,
    githubUrl: row.source_repo_url,
    iconUrl: row.icon_url,
    tags: row.tags ?? [],
    popularity: connectionCounts.get(row.slug) ?? 0,
    currentVersion: row.current_version?.version ?? null,
    requiresOauth: isConnectorId(row.slug),
  }))
})
