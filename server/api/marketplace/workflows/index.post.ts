import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'

// POST /api/marketplace/workflows
//
// Publishes (or updates) a kind='workflow' catalog row. Body:
//   {
//     slug:                string,         // unique catalog slug
//     workflow_id:         uuid,           // existing workflows row
//     workflow_version_id: uuid,           // pinned version to publish
//     name:                string,
//     description?:        string,
//     tags?:               string[],
//     icon_url?:           string
//   }
//
// On first publish: inserts an integrations row and a corresponding
// integration_workflow_refs row.
// On re-publish (slug already owned by the same user): updates the
// integration_workflow_refs.workflow_version_id pointer.
//
// Cross-workspace nuance: the workflow itself is workspace-scoped (RLS).
// The catalog row is global. For an installer in another workspace to
// run the published workflow, the executor will load the pinned version
// via service-role at install time. For Phase 3 we just persist the
// reference; runtime cross-workspace execution is wired in Phase 4+.

interface PublishBody {
  slug?: unknown
  workflow_id?: unknown
  workflow_version_id?: unknown
  name?: unknown
  description?: unknown
  tags?: unknown
  icon_url?: unknown
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*\/)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

function expectString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a non-empty string.` })
  }
  return v
}

function optionalString(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a string.` })
  }
  return v
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<PublishBody>(event)
  const slug = expectString(body?.slug, 'slug')
  if (!SLUG_RE.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'slug must be lowercase, optionally namespaced as `author/name`.' })
  }
  const workflowId = expectString(body?.workflow_id, 'workflow_id')
  const workflowVersionId = expectString(body?.workflow_version_id, 'workflow_version_id')
  const name = expectString(body?.name, 'name')
  const description = optionalString(body?.description, 'description')
  const iconUrl = optionalString(body?.icon_url, 'icon_url')
  let tags: string[] = []
  if (body?.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every(t => typeof t === 'string')) {
      throw createError({ statusCode: 400, statusMessage: 'tags must be an array of strings.' })
    }
    tags = body.tags as string[]
  }

  // Verify the workflow_version_id belongs to workflow_id and the user can
  // see it. The user-scoped client respects workflow RLS — if they can't see
  // the workflow, the lookup returns null.
  const supabase = await serverSupabaseClient(event)
  const sbUser = supabase as unknown as {
    from: (t: string) => { select: (cols: string) => { eq: (col: string, val: string) => { eq?: (col: string, val: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } } } }
  }
  const versionRes = await sbUser
    .from('workflow_versions')
    .select('id, workflow_id')
    .eq('id', workflowVersionId)
    .eq?.('workflow_id', workflowId)
    .single()
  if (!versionRes?.data) {
    throw createError({ statusCode: 404, statusMessage: 'Workflow version not found or not visible.' })
  }

  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } }
      insert: (row: Record<string, unknown>) => { select?: (cols: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } } & Promise<{ error: { message: string } | null }>
      update: (p: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>
    }
  }

  // Slug-collision guard.
  const existing = await sb.from('integrations').select('id, author_user_id, is_first_party, kind').eq('slug', slug).maybeSingle()
  if (existing.error) {
    console.error('[marketplace workflows] slug lookup failed', existing.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to look up slug.' })
  }
  const e = existing.data as { id: string, author_user_id?: string | null, is_first_party?: boolean, kind?: string } | null
  if (e) {
    if (e.is_first_party) {
      throw createError({ statusCode: 409, statusMessage: 'Slug is reserved.' })
    }
    if (e.author_user_id !== user.sub) {
      throw createError({ statusCode: 409, statusMessage: 'Slug is owned by another author.' })
    }
    if (e.kind !== 'workflow') {
      throw createError({ statusCode: 409, statusMessage: `Slug is already used as a kind=${e.kind} listing.` })
    }
  }

  let integrationId: string
  if (e) {
    integrationId = e.id
    // Update metadata.
    const upd = await sb.from('integrations').update({ name, description, tags, icon_url: iconUrl }).eq('id', integrationId)
    if (upd.error) {
      console.error('[marketplace workflows] update failed', upd.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update workflow listing.' })
    }
  }
  else {
    const author = user.email ?? 'Unknown author'
    const insertRes = await sb.from('integrations').insert({
      slug,
      name,
      description,
      kind: 'workflow',
      visibility: 'private',
      author_user_id: user.sub,
      author_name: author,
      icon_url: iconUrl,
      tags,
    }).select?.('id').single()
    if (!insertRes || insertRes.error || !insertRes.data) {
      console.error('[marketplace workflows] insert failed', insertRes?.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to publish workflow.' })
    }
    integrationId = (insertRes.data as { id: string }).id
  }

  // Upsert the integration_workflow_refs row to point at the chosen version.
  const refRes = await sb.from('integration_workflow_refs').upsert({
    integration_id: integrationId,
    workflow_id: workflowId,
    workflow_version_id: workflowVersionId,
  }, { onConflict: 'integration_id' })
  if (refRes.error) {
    console.error('[marketplace workflows] ref upsert failed', refRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to set workflow version.' })
  }

  return {
    ok: true as const,
    integration_id: integrationId,
    slug,
    workflow_id: workflowId,
    workflow_version_id: workflowVersionId,
  }
})
