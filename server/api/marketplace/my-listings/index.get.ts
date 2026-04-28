import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

// GET /api/marketplace/my-listings
//
// Returns catalog rows the current user has authored (i.e. third-party
// items they published via the Editor). First-party rows are excluded
// here because they have author_user_id=NULL.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const supabase = await serverSupabaseClient(event)
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null, error: { message: string } | null }>
        }
      }
    }
  }

  const { data, error } = await sb
    .from('integrations')
    .select(`
      id, slug, name, description, kind, visibility,
      is_first_party, is_verified, install_count, tags, icon_url,
      current_version_id, source_repo_url, homepage_url,
      created_at, updated_at,
      current_version:integration_versions!integrations_current_version_fk (
        id, version, status, published_at
      )
    `)
    .eq('author_user_id', user.sub)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[marketplace] my-listings error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load your listings.' })
  }

  return data ?? []
})
