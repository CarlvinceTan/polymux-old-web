import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { forumDisplayName, forumInitials } from '~~/server/utils/forumAuthor'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to reply.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id || !UUID_RE.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid discussion id.' })
  }

  const body = await readBody<{ body?: unknown }>(event)
  const content = typeof body?.body === 'string' ? body.body.trim() : ''
  if (content.length < 1 || content.length > 20000) {
    throw createError({ statusCode: 400, statusMessage: 'Reply must be 1 to 20,000 characters.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data: discussion, error: dErr } = await supabase
    .from('forum_discussions')
    .select('id')
    .eq('id', id)
    .single()

  if (dErr?.code === 'PGRST116' || !discussion) {
    throw createError({ statusCode: 404, statusMessage: 'Discussion not found.' })
  }
  if (dErr) {
    console.error('[forum] verify discussion error', dErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to verify discussion.' })
  }

  const authorName = forumDisplayName({
    email: user.email,
    user_metadata: (user as { user_metadata?: Record<string, unknown> }).user_metadata,
  })
  const authorInitials = forumInitials(authorName)

  const { data, error } = await supabase
    .from('forum_replies')
    .insert({
      discussion_id: id,
      body: content,
      author_id: user.sub,
      author_name: authorName,
      author_initials: authorInitials,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[forum] create reply error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to post reply.' })
  }

  return { reply: data }
})
