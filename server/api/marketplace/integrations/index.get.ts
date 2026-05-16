import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
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
// Each row carries the joined `current_version` (just `version`, the only
// field the catalog UI actually consumes) and a `requires_oauth` hint:
// true when the slug matches an in-tree ConnectorHandler. The frontend
// uses this to pick the OAuth-redirect path for first-party connectors
// vs the third-party install endpoint (Phase 2).
//
// Popularity comes from `integrations.install_count`, which is maintained
// by triggers on `workspace_integrations` (see migration
// `20260430000000_install_count_trigger.sql`). We deliberately do NOT
// recompute counts per request — full scans of `workspace_integrations`
// were the dominant cost on this endpoint.

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
    current_version?: { version: string } | null
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
      current_version:integration_versions!integrations_current_version_fk ( version )
    `)
    .order('install_count', { ascending: false })

  if (error) {
    console.error('[marketplace] catalog list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load marketplace.' })
  }

  // The catalog is per-user (RLS scopes which rows are visible) but rarely
  // changes inside a session. Browser revalidation + a short SWR window keeps
  // back/forward navigation instant without ever showing seriously stale data.
  setHeader(event, 'Cache-Control', 'private, max-age=30, stale-while-revalidate=300')

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
    tags: (row.tags?.length ? row.tags : ['General']),
    popularity: row.install_count ?? 0,
    currentVersion: row.current_version?.version ?? null,
    requiresOauth: isConnectorId(row.slug),
  }))
})
