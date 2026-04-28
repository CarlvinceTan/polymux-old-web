import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'

// POST /api/marketplace/plugins
//
// Publishes (or updates) a kind='plugin' catalog row. A plugin bundles
// other catalog rows (integrations + workflows) so installing it installs
// every child. Body:
//   {
//     slug:        string,
//     name:        string,
//     description?: string,
//     tags?:       string[],
//     icon_url?:   string,
//     items: [
//       { child_integration_id: uuid, child_min_version_id?: uuid, sort_order?: number }
//     ]
//   }
//
// items can reference any kind='integration' or kind='workflow' rows the
// author can see (RLS-gated). Plugins themselves can't be nested in v1.

interface PublishBody {
  slug?: unknown
  name?: unknown
  description?: unknown
  tags?: unknown
  icon_url?: unknown
  items?: unknown
}

interface BundleItem {
  child_integration_id?: unknown
  child_min_version_id?: unknown
  sort_order?: unknown
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
    throw createError({ statusCode: 400, statusMessage: 'slug must match `[author/]name` format.' })
  }
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
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'items must be a non-empty array.' })
  }
  const itemsRaw = body.items as BundleItem[]
  const items = itemsRaw.map((it, i) => ({
    child_integration_id: expectString(it.child_integration_id, `items[${i}].child_integration_id`),
    child_min_version_id: optionalString(it.child_min_version_id, `items[${i}].child_min_version_id`),
    sort_order: typeof it.sort_order === 'number' ? it.sort_order : i,
  }))

  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> }
        in: (col: string, vals: string[]) => Promise<{ data: Record<string, unknown>[] | null, error: { message: string } | null }>
      }
      insert: (row: Record<string, unknown> | Record<string, unknown>[]) => { select?: (cols: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } } & Promise<{ error: { message: string } | null }>
      update: (p: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
      delete: () => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
    }
  }

  // 1. Verify all child rows exist and aren't kind='plugin' (no nesting in v1).
  const childIds = items.map(i => i.child_integration_id)
  const childRes = await sb.from('integrations').select('id, kind').in('id', childIds)
  if (childRes.error) {
    console.error('[marketplace plugins] child lookup failed', childRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to verify bundle items.' })
  }
  const children = (childRes.data ?? []) as { id: string, kind: string }[]
  if (children.length !== childIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'One or more bundle items not found.' })
  }
  if (children.some(c => c.kind === 'plugin')) {
    throw createError({ statusCode: 400, statusMessage: 'Bundles cannot include other plugins (no nesting in v1).' })
  }

  // 2. Slug guard.
  const existing = await sb.from('integrations').select('id, author_user_id, is_first_party, kind').eq('slug', slug).maybeSingle()
  if (existing.error) {
    console.error('[marketplace plugins] slug lookup failed', existing.error)
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
    if (e.kind !== 'plugin') {
      throw createError({ statusCode: 409, statusMessage: `Slug is already used as a kind=${e.kind} listing.` })
    }
  }

  // 3. Resolve the catalog row.
  let integrationId: string
  if (e) {
    integrationId = e.id
    const upd = await sb.from('integrations').update({ name, description, tags, icon_url: iconUrl }).eq('id', integrationId)
    if (upd.error) {
      console.error('[marketplace plugins] update failed', upd.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update plugin.' })
    }
  }
  else {
    const author = user.email ?? 'Unknown author'
    const insertRes = await sb.from('integrations').insert({
      slug,
      name,
      description,
      kind: 'plugin',
      visibility: 'private',
      author_user_id: user.sub,
      author_name: author,
      icon_url: iconUrl,
      tags,
    }).select?.('id').single()
    if (!insertRes || insertRes.error || !insertRes.data) {
      console.error('[marketplace plugins] insert failed', insertRes?.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to publish plugin.' })
    }
    integrationId = (insertRes.data as { id: string }).id
  }

  // 4. Replace the bundle items wholesale. Simpler than diffing for v1 —
  //    the items table is small and authors expect "what I submit becomes
  //    the bundle."
  await sb.from('integration_plugin_items').delete().eq('plugin_integration_id', integrationId)
  if (items.length > 0) {
    const insertRes = await sb.from('integration_plugin_items').insert(
      items.map(it => ({
        plugin_integration_id: integrationId,
        child_integration_id: it.child_integration_id,
        child_min_version_id: it.child_min_version_id ?? null,
        sort_order: it.sort_order,
      })),
    )
    if (insertRes.error) {
      console.error('[marketplace plugins] items insert failed', insertRes.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to write bundle items.' })
    }
  }

  return { ok: true as const, integration_id: integrationId, slug, item_count: items.length }
})
