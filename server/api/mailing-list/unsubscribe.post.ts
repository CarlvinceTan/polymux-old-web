import { serverSupabaseServiceRole } from '#supabase/server'
import { applyUnsubscribe } from '~~/server/utils/mailing/mailingListUnsubscribe'

// POST /api/mailing-list/unsubscribe?token=<unsubscribe_token>
//
// Two callers:
//   1. The frontend /unsubscribed page (the visible footer link in emails).
//      Calls this on mount with the token from the URL query.
//   2. Mailbox providers (Gmail, Yahoo, etc.) doing RFC 8058 one-click. They
//      POST with an empty body to whatever URL is in the `List-Unsubscribe`
//      header when the user clicks the inbox-level "Unsubscribe" button.
//
// No GET counterpart — keeping the surface POST-only protects against email
// scanner / link-preview prefetches accidentally unsubscribing users.
export default defineEventHandler(async (event) => {
  const token = String(getQuery(event).token ?? '')
  const admin = serverSupabaseServiceRole(event)
  const result = await applyUnsubscribe(admin, token)
  if (!result.ok) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_unsubscribe_token' })
  }
  return { ok: true as const, email: result.email }
})
