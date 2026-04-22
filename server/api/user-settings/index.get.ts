import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('user_settings')
    .select('blog_newsletter_subscribed, settings, updated_at')
    .eq('user_id', user.sub)
    .single()

  if (error?.code === 'PGRST116') {
    // Row not found - create default settings
    return { blog_newsletter_subscribed: false, settings: {}, updated_at: null }
  }

  if (error) {
    console.error('Settings fetch error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch settings.' })
  }

  return data
})