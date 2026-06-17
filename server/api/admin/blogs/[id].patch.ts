import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// PATCH /api/admin/blogs/[id]
// Body: { slug, title, excerpt, body_markdown, category, accent, cover_image_url, published_at }
//
// Saves post metadata + markdown. published_at is the publish/schedule/draft
// switch: ISO 8601 string to publish/schedule, null to unpublish (back to
// draft). accent is constrained to the known palette; everything else is
// trimmed/normalised the same way the console did before writing.

const ACCENTS = ['slate', 'zinc', 'stone']

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const body = await readBody<Record<string, unknown>>(event)

  const title = typeof body?.title === 'string' ? body.title : ''
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : ''
  if (!title.trim()) throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Slug is required.' })

  const accent = typeof body?.accent === 'string' && ACCENTS.includes(body.accent) ? body.accent : 'slate'
  const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : null
  const coverImageUrl = typeof body?.cover_image_url === 'string' && body.cover_image_url.trim() ? body.cover_image_url.trim() : null
  const publishedAt = typeof body?.published_at === 'string' && body.published_at ? body.published_at : null

  const patch = {
    slug,
    title,
    excerpt: typeof body?.excerpt === 'string' ? body.excerpt : '',
    body_markdown: typeof body?.body_markdown === 'string' ? body.body_markdown : '',
    category,
    accent,
    cover_image_url: coverImageUrl,
    published_at: publishedAt,
  }

  const { data, error } = await sb.from('blog_posts').update(patch).eq('id', id).select().single()
  if (error || !data) {
    console.error('[admin/blogs] update error', error)
    // Surface a unique-slug clash as a 409 so the editor can show it inline.
    if (error?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'That slug is already taken.' })
    throw createError({ statusCode: 500, statusMessage: 'Failed to save post.' })
  }
  return { env, post: data }
})
