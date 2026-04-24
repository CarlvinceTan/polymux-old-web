import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { forumDisplayName, forumInitials, isForumCategory } from '~~/server/utils/forumAuthor'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to start a discussion.' })
  }

  const body = await readBody<{
    category?: unknown
    title?: unknown
    body?: unknown
  }>(event)

  const category = typeof body?.category === 'string' ? body.category.trim() : ''
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const content = typeof body?.body === 'string' ? body.body.trim() : ''

  if (!isForumCategory(category)) {
    throw createError({ statusCode: 400, statusMessage: 'Pick a valid category.' })
  }
  if (title.length < 3 || title.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Title must be 3 to 200 characters.' })
  }
  if (content.length < 10 || content.length > 20000) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be 10 to 20,000 characters.' })
  }

  const supabase = await serverSupabaseClient(event)
  const authorName = forumDisplayName({
    email: user.email,
    user_metadata: (user as { user_metadata?: Record<string, unknown> }).user_metadata,
  })
  const authorInitials = forumInitials(authorName)

  const { data, error } = await supabase
    .from('forum_discussions')
    .insert({
      category,
      title,
      body: content,
      author_id: user.sub,
      author_name: authorName,
      author_initials: authorInitials,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[forum] create discussion error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to publish discussion.' })
  }

  return { discussion: data }
})
