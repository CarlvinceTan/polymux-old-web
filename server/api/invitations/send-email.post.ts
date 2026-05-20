// Send a workspace-invitation email via Resend. Called from the team page
// after the Go backend has already created (or resent) the invitation row,
// so this endpoint only handles delivery — it does no DB writes and only
// trusts inputs that the user could have supplied via the existing
// /workspaces/:id/invitations Go routes.
//
// Auth: any signed-in Supabase user. The Go endpoint that produced the token
// is the actual authorization gate; if a malicious caller forged a token
// they wouldn't have a real invitation row backing it, and the accept link
// would 404 anyway. Rate limiting / abuse protection is left to the Resend
// account quota for now.
//
// Notifications gate: invitations are non-essential, so the send is routed
// through sendNotificationEmail() — recipients who already have a Polymux
// account and have disabled all notifications won't receive it. Recipients
// without an account are sent unconditionally (the email is how they sign
// up).

import { serverSupabaseUser } from '#supabase/server'
import { renderEmailLayout, sendNotificationEmail } from '../../utils/email'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<{
    email?: unknown
    role?: unknown
    token?: unknown
    workspaceName?: unknown
    inviterName?: unknown
  }>(event)

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const role = typeof body.role === 'string' ? body.role.trim() : ''
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const workspaceName = typeof body.workspaceName === 'string' ? body.workspaceName.trim() : ''
  const inviterName = typeof body.inviterName === 'string' ? body.inviterName.trim() : ''

  if (!emailRe.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid email is required.' })
  }
  if (role !== 'admin' && role !== 'member') {
    throw createError({ statusCode: 400, statusMessage: 'Role must be admin or member.' })
  }
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Invitation token is required.' })
  }

  const config = useRuntimeConfig()
  const appUrl = (config.public.appUrl as string | undefined) ?? 'http://localhost:3000'
  const acceptUrl = `${appUrl.replace(/\/$/, '')}/invitations/accept?token=${encodeURIComponent(token)}`
  const wsLabel = workspaceName || 'a workspace on Polymux'
  const inviter = inviterName || 'A teammate'

  const result = await sendNotificationEmail(event, {
    to: email,
    subject: `${inviter} invited you to ${wsLabel} on Polymux`,
    html: renderEmailLayout({
      title: 'You\'ve been invited to Polymux',
      intro: `${inviter} invited you to join ${wsLabel} as a ${role}. Accept below to create your account and get started.`,
      ctaLabel: 'Accept invitation',
      ctaUrl: acceptUrl,
      footer: 'If you weren\'t expecting this invitation, you can safely ignore this email. The link expires in 7 days.',
      preheader: `${inviter} invited you to ${wsLabel} on Polymux.`,
    }),
  })

  return result
})
