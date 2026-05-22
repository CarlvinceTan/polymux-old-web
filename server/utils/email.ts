// Shared email helpers for app-initiated mail (workspace invitations, blog
// newsletter verification, etc). Renders HTML matching the Supabase Auth
// templates under supabase/email-templates/ so app mail and auth mail look
// identical in the inbox.
//
// Two send entry points:
//   * sendNotificationEmail() — respects the recipient's
//     user_settings.all_notifications_enabled master toggle. Use for any
//     non-essential email triggered by the web app.
//   * sendEmail() with `bypassUserPreferences: true` — for important emails
//     dispatched from the admin console (security, billing, account
//     recovery). These ignore the toggle by design.
//
// Both helpers no-op gracefully when resendApiKey isn't configured so local
// dev without a Resend account doesn't blow up.

import type { H3Event } from 'h3'
import { Resend } from 'resend'
import { serverSupabaseServiceRole } from '#supabase/server'

const LOGO_URL = 'https://eorphiekakgrpwxvbjmu.supabase.co/storage/v1/object/public/brand/polymux-lockup.png'
const DEFAULT_FROM = 'Polymux <onboarding@resend.dev>'

export interface EmailLayoutOptions {
  /** H1 shown under the logo. */
  title: string
  /** Paragraph immediately under the title. */
  intro: string
  /** Visible label of the primary call-to-action button. */
  ctaLabel: string
  /** Destination of the CTA button. Also rendered as a paste-fallback link. */
  ctaUrl: string
  /** Small italic footer (e.g. "If you didn't request this, ignore this email."). Plain text, will be escaped. */
  footer?: string
  /** Same slot as `footer` but treated as raw HTML — use when the footer needs an inline link. Caller must pre-escape user input. */
  footerHtml?: string
  /** Optional pre-header — hidden inbox preview text shown next to the subject. */
  preheader?: string
  /** When provided, replaces the default "Or paste this link..." block. */
  pasteLinkLabel?: string
  /** Extra HTML inserted between the CTA and the paste-link row. */
  extraHtml?: string
}

export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const title = escapeHtml(opts.title)
  const intro = escapeHtml(opts.intro)
  const ctaLabel = escapeHtml(opts.ctaLabel)
  const ctaUrl = escapeAttr(opts.ctaUrl)
  const footer = opts.footerHtml ?? (opts.footer ? escapeHtml(opts.footer) : '')
  const pasteLinkLabel = escapeHtml(opts.pasteLinkLabel ?? 'Or paste this link into your browser:')
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : ''
  const extraHtml = opts.extraHtml ?? ''

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f9f9f9;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1c1c;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#f9f9f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9f9f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#ffffff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:36px 32px 8px 32px;" align="center">
              <img src="${LOGO_URL}"
                   width="176" height="49" alt="Polymux"
                   style="display:block;border:0;outline:none;text-decoration:none;height:49px;width:176px;margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px 32px;" align="center">
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:#1a1c1c;text-align:center;">
                ${title}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;" align="center">
              <p style="margin:0;font-size:15px;line-height:1.55;color:#5e5e5e;text-align:center;">
                ${intro}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px 32px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td bgcolor="#000000" style="border-radius:8px;">
                    <a href="${ctaUrl}" target="_blank" style="display:inline-block;background-color:#000000;color:#ffffff;text-decoration:none;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:500;line-height:1;padding:14px 22px;border-radius:8px;mso-padding-alt:0;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${extraHtml}
          <tr>
            <td style="padding:0 32px 32px 32px;" align="center">
              <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#7a7a7a;text-align:center;">
                ${pasteLinkLabel}
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#3a3a3a;word-break:break-all;text-align:center;">
                <a href="${ctaUrl}" style="color:#3a3a3a;text-decoration:underline;">${ctaUrl}</a>
              </p>
            </td>
          </tr>
          ${footer
            ? `<tr>
            <td style="padding:20px 32px;border-top:1px solid #ececec;background-color:#fafafa;" align="center">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#7a7a7a;text-align:center;">
                ${footer}
              </p>
            </td>
          </tr>`
            : ''}
        </table>
        <p style="margin:16px 0 0 0;font-size:11px;color:#a0a0a0;letter-spacing:0.04em;text-align:center;">
          © Polymux
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Plain-text layout variant for emails that go to the team (contact form,
 * bug reports). Same outer chrome, but the body slot accepts arbitrary
 * inner HTML the caller has already escaped.
 */
export function renderTeamMessageLayout(opts: {
  title: string
  fromEmail: string
  subjectLine: string
  bodyHtml: string
}): string {
  const title = escapeHtml(opts.title)
  const fromEmail = escapeHtml(opts.fromEmail)
  const subjectLine = escapeHtml(opts.subjectLine)
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f9f9f9;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1c1c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9f9f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 0 32px;" align="center">
              <img src="${LOGO_URL}"
                   width="140" height="39" alt="Polymux"
                   style="display:block;border:0;outline:none;text-decoration:none;height:39px;width:140px;margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 4px 32px;">
              <h1 style="margin:0;font-size:18px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:#1a1c1c;">
                ${title}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 32px 16px 32px;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#5e5e5e;">
                <strong style="color:#1a1c1c;">From:</strong> ${fromEmail}<br />
                <strong style="color:#1a1c1c;">Subject:</strong> ${subjectLine}
              </p>
            </td>
          </tr>
          <tr><td style="padding:0 32px;"><hr style="border:0;border-top:1px solid #ececec;margin:0;" /></td></tr>
          <tr>
            <td style="padding:20px 32px 32px 32px;font-size:14px;line-height:1.6;color:#1a1c1c;">
              ${opts.bodyHtml}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:11px;color:#a0a0a0;letter-spacing:0.04em;text-align:center;">
          © Polymux
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
}

export interface SendResult {
  ok: true
  sent: boolean
  /** When sent === false, explains why (missing API key, suppressed by preference, etc). */
  reason?: 'resend_not_configured' | 'suppressed_by_user_preference'
}

/**
 * Low-level send. Use when the email is "important" (admin console paths,
 * password resets dispatched outside Supabase Auth, etc) and must bypass the
 * user's All-notifications toggle.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const config = useRuntimeConfig()
  if (!config.resendApiKey) {
    return { ok: true, sent: false, reason: 'resend_not_configured' }
  }

  const resend = new Resend(config.resendApiKey)
  const { error } = await resend.emails.send({
    from: opts.from ?? DEFAULT_FROM,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
    headers: opts.headers,
  })

  if (error) {
    console.error('[email] resend error', error)
    throw createError({ statusCode: 502, statusMessage: 'Failed to send email.' })
  }

  return { ok: true, sent: true }
}

/**
 * Send a non-essential notification to a single recipient. Respects the
 * recipient's user_settings.all_notifications_enabled if they have a
 * Polymux account; sends unconditionally for non-users (the email itself
 * is often how they create the account).
 */
export async function sendNotificationEmail(
  event: H3Event,
  opts: SendEmailOptions & { to: string },
): Promise<SendResult> {
  const allowed = await notificationsEnabledFor(event, opts.to)
  if (!allowed) {
    return { ok: true, sent: false, reason: 'suppressed_by_user_preference' }
  }
  return sendEmail(opts)
}

/**
 * Returns true when the given email address is either not a Polymux user
 * or is a user who has not disabled all notifications. False only when an
 * existing user has explicitly opted out.
 */
export async function notificationsEnabledFor(event: H3Event, email: string): Promise<boolean> {
  try {
    const admin = serverSupabaseServiceRole(event)
    const { data, error } = await admin.rpc('notifications_enabled_for_email', { p_email: email })
    if (error) {
      console.error('[email] notifications_enabled_for_email failed', error)
      // Fail open — better to deliver one unwanted message than to silently
      // drop every notification when the RPC errors.
      return true
    }
    return data !== false
  }
  catch (e) {
    console.error('[email] notifications_enabled_for_email exception', e)
    return true
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Same as escapeHtml but tuned for HTML attribute values (no need to escape '<'). */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
