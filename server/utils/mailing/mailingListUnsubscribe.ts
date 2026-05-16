import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/app/types/database.types'

/**
 * Applies an unsubscribe given a token. Idempotent — re-running against an
 * already-unsubscribed row returns `ok: true` with the original email so the
 * user UX is the same on the first click and any follow-up clicks.
 *
 * Reasons returned on failure:
 *   - 'invalid' : token doesn't exist (or was too short to be plausible) /
 *                 the update failed
 *
 * We never leak which tokens are valid vs. which rows are already unsubscribed
 * — invalid tokens always 400, valid tokens always 200 regardless of prior
 * state.
 */
export async function applyUnsubscribe(
  admin: SupabaseClient<Database>,
  token: string,
): Promise<{ ok: true; email: string } | { ok: false; reason: 'invalid' }> {
  // The default token shape is 64 hex chars (two stripped UUIDs); reject
  // anything obviously not a token before round-tripping.
  if (!token || token.length < 16) return { ok: false, reason: 'invalid' }

  const { data, error } = await admin
    .from('mailing_list')
    .select('id, email, unsubscribed_at')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  if (error || !data) return { ok: false, reason: 'invalid' }

  // Idempotent — second click on the same link from a stale tab shouldn't
  // 400 the user. Just echo back the email.
  if (data.unsubscribed_at) return { ok: true, email: data.email }

  const { error: updateErr } = await admin
    .from('mailing_list')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', data.id)
  if (updateErr) {
    console.error('[mailing-list/unsubscribe] update failed', updateErr)
    return { ok: false, reason: 'invalid' }
  }
  return { ok: true, email: data.email }
}
