import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { KNOWN_TARGET_SECTIONS } from '~~/server/utils/integrations/layoutSections'

// POST /api/marketplace/layouts
//
// Publishes (or updates) a kind='layout' catalog row. Body:
//   {
//     slug:           string,            // unique catalog slug
//     name:           string,
//     target_section: 'integrations' | 'storage' | 'vault' | 'dashboard',
//     body:           string,            // raw HTML/CSS/JS rendered in an iframe
//     description?:   string,
//     tags?:          string[],
//     icon_url?:      string
//   }
//
// First publish: inserts an `integrations` row + `integration_layout_refs`
// row. Re-publish (slug owned by same user): updates the metadata + UPSERTs
// the layout_refs row. Slug rules match the workflow/plugin endpoints — one
// shared namespace across all four kinds.

interface PublishBody {
  slug?: unknown
  name?: unknown
  description?: unknown
  tags?: unknown
  icon_url?: unknown
  target_section?: unknown
  body?: unknown
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*\/)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i
const MAX_BODY_BYTES = 256 * 1024 // 256 KB — generous for HTML/CSS/JS but bounded.

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

  const raw = await readBody<PublishBody>(event)
  const slug = expectString(raw?.slug, 'slug')
  if (!SLUG_RE.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'slug must be lowercase, optionally namespaced as `author/name`.' })
  }
  const name = expectString(raw?.name, 'name')
  const targetSection = expectString(raw?.target_section, 'target_section')
  if (!KNOWN_TARGET_SECTIONS.includes(targetSection as typeof KNOWN_TARGET_SECTIONS[number])) {
    throw createError({ statusCode: 400, statusMessage: `target_section must be one of: ${KNOWN_TARGET_SECTIONS.join(', ')}.` })
  }
  const body = expectString(raw?.body, 'body')
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    throw createError({ statusCode: 400, statusMessage: `Layout body exceeds ${MAX_BODY_BYTES} bytes.` })
  }
  const description = optionalString(raw?.description, 'description')
  const iconUrl = optionalString(raw?.icon_url, 'icon_url')
  let tags: string[] = []
  if (raw?.tags !== undefined) {
    if (!Array.isArray(raw.tags) || !raw.tags.every(t => typeof t === 'string')) {
      throw createError({ statusCode: 400, statusMessage: 'tags must be an array of strings.' })
    }
    tags = raw.tags as string[]
  }

  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> }
      }
      insert: (row: Record<string, unknown>) => { select?: (cols: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } } & Promise<{ error: { message: string } | null }>
      update: (p: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>
    }
  }

  // Slug-collision guard.
  const existing = await sb.from('integrations').select('id, author_user_id, is_first_party, kind').eq('slug', slug).maybeSingle()
  if (existing.error) {
    console.error('[marketplace layouts] slug lookup failed', existing.error)
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
    if (e.kind !== 'layout') {
      throw createError({ statusCode: 409, statusMessage: `Slug is already used as a kind=${e.kind} listing.` })
    }
  }

  let integrationId: string
  if (e) {
    integrationId = e.id
    const upd = await sb.from('integrations').update({ name, description, tags, icon_url: iconUrl }).eq('id', integrationId)
    if (upd.error) {
      console.error('[marketplace layouts] update failed', upd.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update layout listing.' })
    }
  }
  else {
    const author = user.email ?? 'Unknown author'
    const insertRes = await sb.from('integrations').insert({
      slug,
      name,
      description,
      kind: 'layout',
      visibility: 'private',
      author_user_id: user.sub,
      author_name: author,
      icon_url: iconUrl,
      tags,
    }).select?.('id').single()
    if (!insertRes || insertRes.error || !insertRes.data) {
      console.error('[marketplace layouts] insert failed', insertRes?.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to publish layout.' })
    }
    integrationId = (insertRes.data as { id: string }).id
  }

  const refRes = await sb.from('integration_layout_refs').upsert({
    integration_id: integrationId,
    body,
    target_section: targetSection,
  }, { onConflict: 'integration_id' })
  if (refRes.error) {
    console.error('[marketplace layouts] ref upsert failed', refRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save layout body.' })
  }

  return { ok: true as const, integration_id: integrationId, slug, target_section: targetSection }
})
