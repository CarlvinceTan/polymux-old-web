import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token is required',
    })
  }

  const supabase = await serverSupabaseClient(event)

  // Find the mailing list entry by token
  const { data: subscriber, error: fetchError } = await supabase
    .from('mailing_list')
    .select('id, email, token_expires_at, is_verified')
    .eq('verification_token', token)
    .single()

  if (fetchError || !subscriber) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Verification link not found',
    })
  }

  // Check if token has expired
  if (subscriber.token_expires_at && new Date(subscriber.token_expires_at) < new Date()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verification link has expired',
    })
  }

  // Check if already verified
  if (subscriber.is_verified) {
    return {
      status: 'success',
      message: 'Email already verified',
      email: subscriber.email,
    }
  }

  // Update mailing list entry to mark as verified
  const { error: updateError } = await supabase
    .from('mailing_list')
    .update({
      is_verified: true,
      verified_at: new Date().toISOString(),
      verification_token: null,
      token_expires_at: null,
    })
    .eq('id', subscriber.id)

  if (updateError) {
    console.error('[mailing-list/verify] update error:', updateError)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to verify email. Please try again.',
    })
  }

  return {
    status: 'success',
    message: 'Email verified successfully',
    email: subscriber.email,
  }
})
