import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

// PATCH /api/marketplace/integrations/[id]
//
// Lets the author edit their catalog row's metadata (name, description,
// visibility, tags, icon, homepage, source repo). The actual *manifest*
// for a kind='integration' row lives in integration_versions and is only
// changed by publishing a new version (POST .../versions). For
// kind='workflow' the underlying workflow_version_id changes via the
// integration_workflow_refs row, not here.
//
// First-party rows can't be patched by anyone — RLS enforces that, but we
// also reject explicitly for a clearer error.

const ALLOWED_FIELDS = ['name', 'description', 'visibility', 'tags', 'icon_url', 'homepage_url', 'source_repo_url'] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

const VISIBILITY_OPTIONS = ['private', 'unlisted', 'public']

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const body = await readBody<Record<string, unknown>>(event)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body.' })
  }

  const patch: Partial<Record<AllowedField, unknown>> = {}
  for (const k of ALLOWED_FIELDS) {
    if (k in body) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No editable fields supplied.' })
  }

  if (patch.visibility !== undefined) {
    if (typeof patch.visibility !== 'string' || !VISIBILITY_OPTIONS.includes(patch.visibility)) {
      throw createError({ statusCode: 400, statusMessage: 'visibility must be private|unlisted|public.' })
    }
    // Until a public review process lands (Phase 4), only private/unlisted are
    // user-selectable. Reject 'public' to keep the marketplace gated.
    if (patch.visibility === 'public') {
      throw createError({ statusCode: 403, statusMessage: 'Public visibility is not yet user-selectable.' })
    }
  }
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags) || !patch.tags.every(t => typeof t === 'string')) {
      throw createError({ statusCode: 400, statusMessage: 'tags must be an array of strings.' })
    }
  }
  for (const k of ['name', 'description', 'icon_url', 'homepage_url', 'source_repo_url'] as const) {
    if (patch[k] !== undefined && patch[k] !== null && typeof patch[k] !== 'string') {
      throw createError({ statusCode: 400, statusMessage: `${k} must be a string or null.` })
    }
  }

  const supabase = await serverSupabaseClient(event)
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } }
      update: (p: Record<string, unknown>) => { eq: (col: string, val: string) => { select: (cols: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } } }
    }
  }

  // RLS will reject if the row isn't owned by this user. Look it up first
  // so we can surface a clear 404 vs 403.
  const existing = await sb.from('integrations').select('id, author_user_id, is_first_party').eq('id', id).single()
  if (existing.error || !existing.data) {
    throw createError({ statusCode: 404, statusMessage: 'Integration not found.' })
  }
  const e = existing.data as { author_user_id?: string | null, is_first_party?: boolean }
  if (e.is_first_party) {
    throw createError({ statusCode: 403, statusMessage: 'First-party integrations are read-only here.' })
  }
  if (e.author_user_id !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: "You don't own this integration." })
  }

  const update = await sb.from('integrations').update(patch as Record<string, unknown>).eq('id', id).select('id, slug, name, description, visibility, tags, icon_url, homepage_url, source_repo_url, updated_at').single()
  if (update.error || !update.data) {
    console.error('[marketplace patch] update failed', update.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update integration.' })
  }
  return update.data
})
