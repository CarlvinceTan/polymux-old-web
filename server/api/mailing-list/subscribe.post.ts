import { serverSupabaseClient } from '#supabase/server'
import { Resend } from 'resend'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function generateVerificationToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email?: unknown
  }>(event)

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  // Validation
  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email required',
    })
  }

  if (!emailRegex.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Please enter a valid email',
    })
  }

  const supabase = await serverSupabaseClient(event)
  const config = useRuntimeConfig()

  // Check if email already exists in mailing list. `.single()` errors when
  // no row is found, but we ignore it on purpose — the destructure pulls
  // only `data` and the not-found case correctly falls through to insert.
  const { data: existing } = await supabase
    .from('mailing_list')
    .select('id, is_verified, unsubscribed_at, unsubscribe_token')
    .eq('email', email)
    .single()

  if (existing) {
    // Reactivate any previously-unsubscribed row so /unsubscribed's
    // "Re-subscribe" button (and a returning visitor on the marketing form)
    // can opt back in. Idempotent for currently-active rows.
    if (existing.unsubscribed_at) {
      const { error: reactivateErr } = await supabase
        .from('mailing_list')
        .update({ unsubscribed_at: null })
        .eq('id', existing.id)
      if (reactivateErr) {
        console.error('[mailing-list/subscribe] reactivate failed', reactivateErr)
      }
    }
    return {
      status: 'success',
      message: 'Check your email to verify your subscription',
      email,
    }
  }

  // Generate verification token
  const verificationToken = generateVerificationToken()
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // Insert new subscriber
  const { data: newSubscriber, error: insertError } = await supabase
    .from('mailing_list')
    .insert([
      {
        email,
        verification_token: verificationToken,
        token_expires_at: tokenExpiresAt.toISOString(),
        is_verified: false,
      },
    ])
    .select()
    .single()

  if (insertError || !newSubscriber) {
    console.error('[mailing-list/subscribe] insert error:', insertError)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to subscribe. Please try again.',
    })
  }

  // Send verification email
  try {
    const resend = new Resend(config.resendApiKey)
    const verificationLink = `${config.public.appUrl}/verify-email?token=${verificationToken}`
    // Visible footer link goes through the Nuxt page (which POSTs to the
    // API on mount). The List-Unsubscribe header points straight at the
    // API endpoint — mailbox providers do RFC 8058 one-click via POST and
    // don't render frontend pages from inbox-level unsubscribe buttons.
    const unsubscribePage = `${config.public.appUrl}/unsubscribed?token=${newSubscriber.unsubscribe_token}`
    const unsubscribeApi = `${config.public.appUrl}/api/mailing-list/unsubscribe?token=${newSubscriber.unsubscribe_token}`

    await resend.emails.send({
      from: 'Polymux <onboarding@resend.dev>',
      to: email,
      subject: 'Verify your subscription to the Polymux Blog',
      headers: {
        'List-Unsubscribe': `<${unsubscribeApi}>, <mailto:unsubscribe@polymux.io?subject=unsubscribe-${newSubscriber.unsubscribe_token}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify your subscription</h2>
          <p>Thanks for subscribing to the Polymux Blog! Click the button below to confirm your email address.</p>
          <div style="margin: 30px 0;">
            <a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Verify Email
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Or copy and paste this link:</p>
          <p style="color: #0066cc; font-size: 12px; word-break: break-all;">${verificationLink}</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">This link expires in 7 days.</p>
          <hr style="margin-top: 32px; border: 0; border-top: 1px solid #e5e5e5;">
          <p style="color: #999; font-size: 11px; margin-top: 16px;">
            You're receiving this because you subscribed to the Polymux Blog.
            <a href="${unsubscribePage}" style="color: #666; text-decoration: underline;">Unsubscribe</a>.
          </p>
        </div>
      `,
    })
  }
  catch (emailError) {
    console.error('[mailing-list/subscribe] email error:', emailError)
    // Don't fail the request if email sending fails, but log it
  }

  return {
    status: 'success',
    message: 'Check your email to verify your subscription',
    email,
  }
})
