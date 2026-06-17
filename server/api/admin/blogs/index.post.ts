import { requireMaintainer, envMaintainerId } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// POST /api/admin/blogs  { slug?, title?, excerpt?, body_markdown?, accent? }
//
// Creates a new draft post (published_at stays NULL). The console set author_id
// from useSupabaseUser().id; here we resolve the maintainer's id in the *target*
// environment so the FK to auth.users holds when managing prod data (mirrors the
// reviewed_by handling in judgments/review). Falls back to NULL if the
// maintainer doesn't exist in that env — author_id is nullable on the table.

export default defineEventHandler(async (event) => {
  const m = await requireMaintainer(event)
  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const body = await readBody<{ slug?: string, title?: string, excerpt?: string, body_markdown?: string, accent?: string }>(event)

  // Pick a slug that doesn't already exist so the unique index doesn't reject
  // the insert in the common "click + New repeatedly" case.
  const base = (typeof body?.slug === 'string' && body.slug.trim()) ? slugify(body.slug) : 'untitled'
  const { data: existingSlugs } = await sb.from('blog_posts').select('slug')
  const taken = new Set<string>((existingSlugs ?? []).map((r: { slug: string }) => r.slug))
  let slug = base || 'untitled'
  let n = 1
  while (taken.has(slug)) {
    n += 1
    slug = `${base}-${n}`
  }

  const authorId = await envMaintainerId(client, m.email)

  const insert = {
    slug,
    title: typeof body?.title === 'string' ? body.title : 'Untitled post',
    excerpt: typeof body?.excerpt === 'string' ? body.excerpt : '',
    body_markdown: typeof body?.body_markdown === 'string' ? body.body_markdown : '# Untitled post\n\nStart writing…\n',
    accent: typeof body?.accent === 'string' ? body.accent : 'slate',
    author_id: authorId,
  }

  const { data, error } = await sb.from('blog_posts').insert(insert).select().single()
  if (error || !data) {
    console.error('[admin/blogs] create error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create draft.' })
  }
  return { env, post: data }
})

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
