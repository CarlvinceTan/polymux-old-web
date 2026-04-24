import { serverSupabaseClient } from '#supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !UUID_RE.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid discussion id.' })
  }

  const supabase = await serverSupabaseClient(event)

  const [{ data: discussion, error: dErr }, { data: replies, error: rErr }] = await Promise.all([
    supabase.from('forum_discussions').select('*').eq('id', id).single(),
    supabase
      .from('forum_replies')
      .select('*')
      .eq('discussion_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (dErr?.code === 'PGRST116') {
    throw createError({ statusCode: 404, statusMessage: 'Discussion not found.' })
  }
  if (dErr) {
    console.error('[forum] get discussion error', dErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load discussion.' })
  }
  if (rErr) {
    console.error('[forum] list replies error', rErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load replies.' })
  }

  // Best-effort view bump — ignore failure so a stale cache doesn't block the read.
  supabase.rpc('increment_forum_discussion_views', { p_id: id }).then(({ error }) => {
    if (error) console.warn('[forum] view increment failed', error.message)
  })

  return { discussion, replies: replies ?? [] }
})
