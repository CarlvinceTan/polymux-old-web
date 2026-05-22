import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not authenticated.',
    })
  }

  const supabase = await serverSupabaseClient(event)

  // Check if email exists in mailing list
  const { data: subscriber } = await supabase
    .from('mailing_list')
    .select('id, user_id, is_verified')
    .eq('email', user.email ?? '')
    .is('user_id', null)
    .single()

  if (!subscriber) {
    // Email not in mailing list or already linked
    return {
      status: 'success',
      message: 'No mailing list subscriber found or already linked',
      linked: false,
    }
  }

  // Auto-link the user to the mailing list entry
  const { error } = await supabase
    .from('mailing_list')
    .update({
      user_id: user.sub,
    })
    .eq('id', subscriber.id)

  if (error) {
    console.error('[mailing-list/auto-link] update error:', error)
    // Don't fail the auth flow if linking fails
    return {
      status: 'success',
      message: 'User verified but auto-link failed',
      linked: false,
    }
  }

  return {
    status: 'success',
    message: 'Successfully linked to mailing list',
    linked: true,
    verified: subscriber.is_verified,
  }
})
