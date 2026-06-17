import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// DELETE /api/admin/blogs/[id]
//
// Permanently removes a post. The console gated this behind a confirm() in the
// UI; the server just performs the delete in the admin-selected environment.

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const { error } = await sb.from('blog_posts').delete().eq('id', id)
  if (error) {
    console.error('[admin/blogs] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete post.' })
  }
  return { env, ok: true }
})
