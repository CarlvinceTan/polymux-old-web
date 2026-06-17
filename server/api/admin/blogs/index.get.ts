import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient, availableAdminEnvs } from '~~/server/utils/admin/adminEnv'

// GET /api/admin/blogs
//
// Lists every blog post (drafts, scheduled, and published) for the maintainer
// editor, in the admin-selected environment. Ported from the console's Blogs
// page, which read public.blog_posts directly via useSupabaseClient(); here the
// read goes through a service-role client so the page never needs the anon key.
//
// Order mirrors the console: published_at desc with drafts (NULL) first, then
// updated_at desc as a tiebreaker so freshly edited rows float up.

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const { data, error } = await sb
    .from('blog_posts')
    .select('id, slug, title, excerpt, body_markdown, category, accent, cover_image_url, published_at, author_id, created_at, updated_at')
    .order('published_at', { ascending: false, nullsFirst: true })
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[admin/blogs] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list blog posts.' })
  }
  return { env, available_envs: availableAdminEnvs(), posts: data ?? [] }
})
