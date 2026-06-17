import { serverSupabaseServiceRole } from '#supabase/server'
import { requireOwner } from '~~/server/utils/security/requireMaintainer'

// POST /api/admin/maintainers  { email }
//
// Promote an existing Polymux user to maintainer (owner-gated). In web's model a
// maintainer is an existing user — not a new auth account — so we look the user
// up by email (via the service-role-only admin_lookup_user_by_email function)
// and insert the public.maintainers row.

export default defineEventHandler(async (event) => {
  const owner = await requireOwner(event)
  const body = await readBody<{ email?: unknown }>(event)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!email) throw createError({ statusCode: 400, statusMessage: 'email is required.' })

  const admin = serverSupabaseServiceRole(event) as unknown as {
    from: (t: string) => any
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown, error: { message: string } | null }>
  }

  const { data: lookup, error: lerr } = await admin.rpc('admin_lookup_user_by_email', { p_email: email })
  if (lerr) {
    console.error('[admin/maintainers] lookup error', lerr)
    throw createError({ statusCode: 500, statusMessage: 'User lookup failed.' })
  }
  const found = (Array.isArray(lookup) ? lookup[0] : lookup) as { user_id?: string, user_email?: string } | undefined
  if (!found?.user_id) {
    throw createError({ statusCode: 404, statusMessage: `No Polymux user found with email "${email}". They need to sign up first.` })
  }

  const { data: existing } = await admin.from('maintainers').select('user_id').eq('user_id', found.user_id).maybeSingle()
  if (!existing) {
    const { error: ierr } = await admin.from('maintainers').insert({
      user_id: found.user_id,
      email: found.user_email ?? email,
      created_by: owner.userId,
    })
    if (ierr) {
      console.error('[admin/maintainers] insert error', ierr)
      throw createError({ statusCode: 500, statusMessage: 'Failed to add maintainer.' })
    }
  }
  return { ok: true, user_id: found.user_id, email: found.user_email ?? email, already: !!existing }
})
