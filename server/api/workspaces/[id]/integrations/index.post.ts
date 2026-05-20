import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { isConnectorId } from '~~/server/connectors/registry'
import {
  fetchCatalogRowBySlug,
  installCatalogRow,
  type InstallOutcome,
  type LayoutInstallConfig,
} from '~~/server/utils/integrations/installCatalog'
import { isLayoutTargetSection } from '~~/server/utils/integrations/layoutSections'

// POST /api/workspaces/[id]/integrations
//
// Catalog-aware install entrypoint. Admin-only. The client posts
//   { provider: slug }
// and we route by the catalog row's `kind`:
//   - first-party OAuth slugs are rejected (use /api/integrations/[provider]/connect)
//   - kind='integration' (third-party, manifest-backed): install the pinned
//     current version + record scope grants + audit event
//   - kind='workflow': bind to the pinned workflow_version_id + audit event
//   - kind='plugin': install the plugin shell + each non-plugin child (with
//     installed_via_plugin_id set to the plugin's integrations.id). OAuth-
//     dependent children (first-party connector slugs) are returned in
//     requires_oauth_children so the UI can prompt the user to connect them.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const body = await readBody<{ provider?: unknown, layout?: unknown }>(event)
  const slug = typeof body?.provider === 'string' ? body.provider.trim() : ''
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'provider is required.' })
  }

  // Optional kind='layout' install config. Ignored for other kinds. The tab
  // label is intentionally NOT a per-install setting — it lives on the
  // catalog row's `name` so re-publishing updates installed tabs.
  const layoutConfig: LayoutInstallConfig = {}
  if (body?.layout && typeof body.layout === 'object') {
    const l = body.layout as { target_section?: unknown }
    if (typeof l.target_section === 'string') {
      if (!isLayoutTargetSection(l.target_section)) {
        throw createError({ statusCode: 400, statusMessage: `Unknown layout target_section: ${l.target_section}` })
      }
      layoutConfig.targetSection = l.target_section
    }
  }

  if (isConnectorId(slug)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'OAuth integrations must be connected via /api/integrations/[provider]/connect.',
    })
  }

  // Admin gate via user-scoped client so RLS applies.
  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can manage integrations.' })
  }

  // From here we use the service role: install crosses RLS boundaries
  // (catalog rows may be private/unlisted; install rows are admin-gated).
  const admin = serverSupabaseServiceRole(event)
  const row = await fetchCatalogRowBySlug(admin, slug)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Integration not found in catalog.' })
  }

  if (row.kind !== 'plugin') {
    const outcome = await installCatalogRow(
      { admin, workspaceId, userId: user.sub, layout: layoutConfig },
      row,
    )
    return shapeSingleOutcome(outcome)
  }

  // Plugin: install the shell row first (so installed_via_plugin_id on
  // children has a clear semantic — installs are linked to the plugin
  // catalog row, not to the shell workspace_integrations row, because
  // re-installing later should still group them). Then expand bundle items.
  const adminSb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq?: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
          }
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null, error: { message: string } | null }>
          in?: (col: string, vals: string[]) => Promise<{ data: Record<string, unknown>[] | null, error: { message: string } | null }>
        }
      }
      insert: (row: Record<string, unknown>) => {
        select?: (cols: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
        }
      } & Promise<{ error: { message: string } | null }>
    }
  }

  // Insert the plugin shell row (idempotent — if already there, fetch it).
  let shellId: string
  const existingShellRes = await adminSb.from('workspace_integrations').select('id').eq('workspace_id', workspaceId).eq?.('provider', row.slug).maybeSingle()
  const existingShell = existingShellRes?.data as { id: string } | null | undefined
  if (existingShell) {
    shellId = existingShell.id
  }
  else {
    const insertShell = adminSb.from('workspace_integrations').insert({
      workspace_id: workspaceId,
      provider: row.slug,
      connected_by: user.sub,
      metadata: { kind: 'plugin' },
      status: 'active',
      auto_update_channel: 'pinned',
    })
    const shellRes = await insertShell.select?.('id').single()
    if (!shellRes || shellRes.error || !shellRes.data) {
      console.error('[install] plugin shell insert failed', shellRes?.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to install plugin shell.' })
    }
    shellId = (shellRes.data as { id: string }).id
  }

  // Load bundle items.
  const itemsRes = await adminSb.from('integration_plugin_items').select('child_integration_id, sort_order').eq('plugin_integration_id', row.id).order('sort_order', { ascending: true })
  if (itemsRes.error) {
    console.error('[install] bundle items lookup failed', itemsRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read bundle items.' })
  }
  const items = (itemsRes.data ?? []) as { child_integration_id: string }[]

  // Load each child's catalog row in one round-trip. The `Sb` shape used by
  // this endpoint is intentionally narrow; cast through `unknown` here so we
  // can reach for `.in(col, vals)` without modeling every Supabase chain.
  const childIds = items.map(it => it.child_integration_id)
  const childRows: Record<string, { id: string, slug: string, kind: 'integration' | 'workflow' | 'plugin', is_first_party: boolean, current_version_id: string | null }> = {}
  if (childIds.length > 0) {
    const adminAny = admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (col: string, vals: string[]) => Promise<{ data: unknown[] | null, error: { message: string } | null }>
        }
      }
    }
    const childRes = await adminAny.from('integrations').select('id, slug, kind, is_first_party, current_version_id').in('id', childIds)
    const rows = (childRes.data ?? []) as { id: string, slug: string, kind: 'integration' | 'workflow' | 'plugin', is_first_party: boolean, current_version_id: string | null }[]
    for (const r of rows) {
      childRows[r.id] = r
    }
  }

  const childOutcomes: InstallOutcome[] = []
  for (const item of items) {
    const child = childRows[item.child_integration_id]
    if (!child) {
      childOutcomes.push({ kind: 'error', slug: item.child_integration_id, message: 'Child catalog row missing.' })
      continue
    }
    if (child.kind === 'plugin') {
      // Defense in depth — POST /marketplace/plugins also rejects nested plugins.
      childOutcomes.push({ kind: 'error', slug: child.slug, message: 'Nested plugins are not supported.' })
      continue
    }
    // Plugin children don't get installer-supplied layout config; defaults
    // (target_section from the layout listing, tab_label from listing name)
    // are applied inside installCatalogRow.
    const outcome = await installCatalogRow(
      { admin, workspaceId, userId: user.sub, installedViaPluginId: row.id },
      child,
    )
    childOutcomes.push(outcome)
  }

  // Audit the plugin install itself.
  await adminSb.from('integration_install_events').insert({
    workspace_id: workspaceId,
    integration_id: row.id,
    event_type: 'install',
    actor_user_id: user.sub,
    metadata: {
      slug: row.slug,
      kind: 'plugin',
      child_count: items.length,
      installed_count: childOutcomes.filter(o => o.kind === 'installed').length,
      already_installed_count: childOutcomes.filter(o => o.kind === 'already_installed').length,
      requires_oauth_count: childOutcomes.filter(o => o.kind === 'requires_oauth').length,
      error_count: childOutcomes.filter(o => o.kind === 'error').length,
    },
  })

  return {
    ok: true as const,
    kind: 'plugin' as const,
    workspace_integration_id: shellId,
    provider: row.slug,
    children: childOutcomes,
    requires_oauth_children: childOutcomes.filter((o): o is { kind: 'requires_oauth', slug: string } => o.kind === 'requires_oauth').map(o => o.slug),
    failed_children: childOutcomes.filter((o): o is { kind: 'error', slug: string, message: string } => o.kind === 'error').map(o => ({ slug: o.slug, message: o.message })),
  }
})

function shapeSingleOutcome(outcome: InstallOutcome) {
  if (outcome.kind === 'requires_oauth') {
    throw createError({
      statusCode: 400,
      statusMessage: `Slug '${outcome.slug}' requires OAuth; use /api/integrations/${outcome.slug}/connect.`,
    })
  }
  if (outcome.kind === 'error') {
    if (outcome.message.toLowerCase().includes('already installed')) {
      throw createError({ statusCode: 409, statusMessage: 'Integration already installed.' })
    }
    throw createError({ statusCode: 500, statusMessage: outcome.message })
  }
  return {
    ok: true as const,
    kind: outcome.kind, // 'installed' | 'already_installed'
    workspace_integration_id: outcome.workspaceIntegrationId,
    provider: outcome.slug,
  }
}
