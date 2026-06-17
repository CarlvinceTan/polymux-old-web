import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// POST /api/admin/plugins/[id]/first-party
// Body: { value: boolean }
//
// Marks/unmarks an integration as first-party (the "Built by Polymux" badge,
// and the trust tier that may later receive injected Polymux-managed secrets).
// Maintainer-gated. This is a high-trust action — ideally owner-only; gated to
// maintainers for now (tighten to owner when web grows an owner distinction).

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const body = await readBody<{ value?: unknown }>(event)
  const value = body?.value === true
  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const patch: Record<string, unknown> = { is_first_party: value }
  if (value) patch.is_verified = true

  const { data, error } = await sb
    .from('integrations')
    .update(patch)
    .eq('id', id)
    .select('id, slug, name, is_first_party, is_verified')
    .single()
  if (error || !data) {
    console.error('[admin/plugins first-party] update failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update first-party flag.' })
  }
  return { env, integration: data }
})
