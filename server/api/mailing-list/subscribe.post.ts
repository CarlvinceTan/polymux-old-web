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

  // Check if email already exists in mailing list
  const { data: existing } = await supabase
    .from('mailing_list')
    .select('id, is_verified')
    .eq('email', email)
    .single()

  if (existing) {
    // Already subscribed - silently succeed (idempotent)
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

  if (insertError) {
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

    await resend.emails.send({
      from: 'Polymux <onboarding@resend.dev>',
      to: email,
      subject: 'Verify your subscription to the Polymux Blog',
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
