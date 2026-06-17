// Gate for the in-web admin area (plugin review, etc.).
//
// A maintainer is a row in public.maintainers — the same canonical table the
// separate console app's gate consults. We always check against web's default
// (local/dev) project where the user authenticated; the admin environment
// switch only changes which *data* is managed, never who the admin is.

import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'

export interface Maintainer {
  userId: string
  email: string
  isOwner: boolean
}

export async function requireMaintainer(event: H3Event): Promise<Maintainer> {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }
  const admin = serverSupabaseServiceRole(event) as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { email?: string, is_owner?: boolean } | null }> } } }
  }
  const { data } = await admin
    .from('maintainers')
    .select('user_id, email, is_owner')
    .eq('user_id', user.sub)
    .maybeSingle()
  if (!data) {
    throw createError({ statusCode: 403, statusMessage: 'Maintainers only.' })
  }
  return { userId: user.sub, email: data.email || user.email || '', isOwner: !!data.is_owner }
}

/** Like requireMaintainer, but also requires the owner tier (e.g. to manage maintainers). */
export async function requireOwner(event: H3Event): Promise<Maintainer> {
  const m = await requireMaintainer(event)
  if (!m.isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Owners only.' })
  }
  return m
}

/**
 * Resolve a maintainer's user_id within a specific environment's database by
 * email. The admin authenticates against the default (dev) project, but when
 * acting on prod data, reviewed_by/provisioned_by must reference a prod
 * auth.users row — so we look the maintainer up by email in the target env.
 * Returns null if they aren't a maintainer there (caller decides whether that
 * is attribution-only or a hard block).
 */
export async function envMaintainerId(client: unknown, email: string): Promise<string | null> {
  if (!email) return null
  const sb = client as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { user_id?: string } | null }> } } }
  }
  const { data } = await sb.from('maintainers').select('user_id').eq('email', email).maybeSingle()
  return data?.user_id ?? null
}
