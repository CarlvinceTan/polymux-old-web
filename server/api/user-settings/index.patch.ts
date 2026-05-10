import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<{
    blog_newsletter_subscribed?: boolean
    settings?: Record<string, unknown>
    cloaked_browser_enabled?: boolean
    show_cursor_overlay?: boolean
  }>(event)

  if (
    typeof body.blog_newsletter_subscribed !== 'boolean'
    && typeof body.cloaked_browser_enabled !== 'boolean'
    && typeof body.show_cursor_overlay !== 'boolean'
    && body.settings === undefined
  ) {
    throw createError({ statusCode: 400, statusMessage: 'No valid settings provided.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase.rpc('upsert_user_settings', {
    p_blog_newsletter_subscribed: body.blog_newsletter_subscribed ?? null,
    p_settings: (body.settings as Json) ?? null,
    p_cloaked_browser_enabled: body.cloaked_browser_enabled ?? null,
    p_show_cursor_overlay: body.show_cursor_overlay ?? null,
  })

  if (error) {
    console.error('Settings update error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update settings.' })
  }

  return {
    blog_newsletter_subscribed: data.blog_newsletter_subscribed,
    cloaked_browser_enabled: data.cloaked_browser_enabled,
    show_cursor_overlay: data.show_cursor_overlay,
    settings: data.settings,
    updated_at: data.updated_at,
  }
})
