import type { SupabaseClient } from '@supabase/supabase-js'
import { isConnectorId } from '~~/server/connectors/registry'
import { validateManifest } from './integrationManifest'
import { isLayoutTargetSection, type LayoutTargetSection } from './layoutSections'

// Installs a single catalog row into a workspace. Handles kind='integration'
// (third-party, manifest-backed) and kind='workflow' (published workflow
// version). Plugins are NOT installed via this helper — the unified endpoint
// expands a plugin into its children and calls this per child.
//
// First-party OAuth slugs are never installed here: those go through the
// OAuth redirect (/api/integrations/[provider]/connect) so token-bearing
// rows are only ever created by the OAuth callback.

export type InstallOutcome =
  | { kind: 'installed', workspaceIntegrationId: string, slug: string }
  | { kind: 'already_installed', workspaceIntegrationId: string, slug: string }
  | { kind: 'requires_oauth', slug: string }
  | { kind: 'error', slug: string, message: string }

interface CatalogRow {
  id: string
  slug: string
  kind: 'integration' | 'workflow' | 'plugin' | 'layout'
  is_first_party: boolean
  current_version_id: string | null
  name?: string | null
}

/** Per-install configuration for kind='layout'. */
export interface LayoutInstallConfig {
  /** Override the listing's default target_section. Falls back to the listing's value. */
  targetSection?: LayoutTargetSection
}

// Minimal shape we need from the service-role client. The Supabase generated
// types don't know about the marketplace tables yet — same `as unknown as`
// pattern the existing endpoints use.
type Sb = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
        eq?: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
          single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
        }
      }
    }
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
      select?: (cols: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
      }
    } & Promise<{ error: { message: string } | null }>
  }
}

export async function fetchCatalogRowBySlug(admin: SupabaseClient, slug: string): Promise<CatalogRow | null> {
  const sb = admin as unknown as Sb
  const res = await sb.from('integrations').select('id, slug, kind, is_first_party, current_version_id, name').eq('slug', slug).maybeSingle()
  if (res.error) {
    console.error('[installCatalog] catalog lookup failed', res.error)
    return null
  }
  const r = res.data as CatalogRow | null
  return r
}

export interface InstallContext {
  admin: SupabaseClient
  workspaceId: string
  userId: string
  /** If installing as part of a plugin bundle, the plugin's integrations.id. */
  installedViaPluginId?: string | null
  /** kind='layout' install configuration. Optional for non-layout rows. */
  layout?: LayoutInstallConfig
}

export async function installCatalogRow(ctx: InstallContext, row: CatalogRow): Promise<InstallOutcome> {
  const sb = ctx.admin as unknown as Sb

  if (row.kind === 'plugin') {
    return { kind: 'error', slug: row.slug, message: 'installCatalogRow does not handle plugins; expand the bundle first.' }
  }

  // First-party OAuth connectors must go through the OAuth redirect — surface
  // as requires_oauth so the caller can prompt the user.
  if (isConnectorId(row.slug)) {
    return { kind: 'requires_oauth', slug: row.slug }
  }

  // Idempotency check: if this workspace already has this provider installed,
  // return the existing row id rather than failing the unique constraint.
  const existingRes = await sb.from('workspace_integrations').select('id').eq('workspace_id', ctx.workspaceId).eq?.('provider', row.slug).maybeSingle()
  const existing = existingRes?.data as { id: string } | null | undefined
  if (existing) {
    return { kind: 'already_installed', workspaceIntegrationId: existing.id, slug: row.slug }
  }

  if (row.kind === 'workflow') {
    return installWorkflowKind(ctx, row)
  }
  if (row.kind === 'integration') {
    return installIntegrationKind(ctx, row)
  }
  if (row.kind === 'layout') {
    return installLayoutKind(ctx, row)
  }
  return { kind: 'error', slug: row.slug, message: `Unknown kind: ${row.kind}` }
}

async function installWorkflowKind(ctx: InstallContext, row: CatalogRow): Promise<InstallOutcome> {
  const sb = ctx.admin as unknown as Sb
  const refRes = await sb.from('integration_workflow_refs').select('workflow_id, workflow_version_id').eq('integration_id', row.id).maybeSingle()
  if (refRes.error || !refRes.data) {
    return { kind: 'error', slug: row.slug, message: 'Workflow listing is missing its version pointer.' }
  }
  const ref = refRes.data as { workflow_id: string, workflow_version_id: string }

  const insert = sb.from('workspace_integrations').insert({
    workspace_id: ctx.workspaceId,
    provider: row.slug,
    connected_by: ctx.userId,
    workflow_version_id: ref.workflow_version_id,
    status: 'active',
    auto_update_channel: 'pinned',
    metadata: { workflow_id: ref.workflow_id, kind: 'workflow' },
    installed_via_plugin_id: ctx.installedViaPluginId ?? null,
  })
  const installRes = await insert.select?.('id').single()
  if (!installRes || installRes.error || !installRes.data) {
    const msg = installRes?.error?.message ?? 'Insert failed.'
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return { kind: 'error', slug: row.slug, message: 'Already installed.' }
    }
    console.error('[installCatalog] workflow install failed', installRes?.error)
    return { kind: 'error', slug: row.slug, message: msg }
  }
  const installId = (installRes.data as { id: string }).id

  await sb.from('integration_install_events').insert({
    workspace_id: ctx.workspaceId,
    integration_id: row.id,
    event_type: 'install',
    actor_user_id: ctx.userId,
    metadata: { slug: row.slug, kind: 'workflow', workflow_version_id: ref.workflow_version_id, installed_via_plugin_id: ctx.installedViaPluginId ?? null },
  })

  return { kind: 'installed', workspaceIntegrationId: installId, slug: row.slug }
}

async function installLayoutKind(ctx: InstallContext, row: CatalogRow): Promise<InstallOutcome> {
  const sb = ctx.admin as unknown as Sb
  const refRes = await sb.from('integration_layout_refs').select('target_section').eq('integration_id', row.id).maybeSingle()
  if (refRes.error || !refRes.data) {
    return { kind: 'error', slug: row.slug, message: 'Layout listing is missing its body/section.' }
  }
  const ref = refRes.data as { target_section: string }

  const requestedSection = ctx.layout?.targetSection
  const targetSection = isLayoutTargetSection(requestedSection) ? requestedSection : ref.target_section
  if (!isLayoutTargetSection(targetSection)) {
    return { kind: 'error', slug: row.slug, message: `Layout's stored target_section is invalid: ${ref.target_section}` }
  }

  // Compute the next tab_index in this workspace+section so the new tab
  // appends to the right of any existing custom tabs in the same section.
  // We use the service-role client; RLS would scope it anyway.
  const nextIndex = await computeNextTabIndex(ctx, targetSection)

  // The tab label is NOT stored on the install row — it's read from the
  // catalog row's `name` at render time. That way an author re-publishing
  // with a new name updates the label across every workspace that installed
  // the layout, no migration / configure-after-install step needed.

  const insert = sb.from('workspace_integrations').insert({
    workspace_id: ctx.workspaceId,
    provider: row.slug,
    connected_by: ctx.userId,
    status: 'active',
    auto_update_channel: 'pinned',
    metadata: {
      kind: 'layout',
      target_section: targetSection,
      tab_index: nextIndex,
    },
    installed_via_plugin_id: ctx.installedViaPluginId ?? null,
  })
  const installRes = await insert.select?.('id').single()
  if (!installRes || installRes.error || !installRes.data) {
    const msg = installRes?.error?.message ?? 'Insert failed.'
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return { kind: 'error', slug: row.slug, message: 'Already installed.' }
    }
    console.error('[installCatalog] layout install failed', installRes?.error)
    return { kind: 'error', slug: row.slug, message: msg }
  }
  const installId = (installRes.data as { id: string }).id

  await sb.from('integration_install_events').insert({
    workspace_id: ctx.workspaceId,
    integration_id: row.id,
    event_type: 'install',
    actor_user_id: ctx.userId,
    metadata: {
      slug: row.slug,
      kind: 'layout',
      target_section: targetSection,
      installed_via_plugin_id: ctx.installedViaPluginId ?? null,
    },
  })

  return { kind: 'installed', workspaceIntegrationId: installId, slug: row.slug }
}

async function computeNextTabIndex(ctx: InstallContext, section: string): Promise<number> {
  // metadata is jsonb; ask for all existing custom-tab rows in this workspace
  // and find the highest tab_index for this section. This query stays small
  // (a few rows per workspace) so we don't bother with a SQL aggregate.
  const sbAny = ctx.admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: Array<{ metadata: Record<string, unknown> | null }> | null }>
      }
    }
  }
  const res = await sbAny.from('workspace_integrations').select('metadata').eq('workspace_id', ctx.workspaceId)
  let max = -1
  for (const row of res?.data ?? []) {
    const m = row.metadata
    if (!m || typeof m !== 'object') continue
    if ((m as Record<string, unknown>).kind !== 'layout') continue
    if ((m as Record<string, unknown>).target_section !== section) continue
    const idx = (m as Record<string, unknown>).tab_index
    if (typeof idx === 'number' && idx > max) max = idx
  }
  return max + 1
}

async function installIntegrationKind(ctx: InstallContext, row: CatalogRow): Promise<InstallOutcome> {
  const sb = ctx.admin as unknown as Sb

  if (row.is_first_party) {
    return { kind: 'requires_oauth', slug: row.slug }
  }
  if (!row.current_version_id) {
    return { kind: 'error', slug: row.slug, message: 'Integration has no published version.' }
  }

  const versionRes = await sb.from('integration_versions').select('id, manifest, status').eq('id', row.current_version_id).maybeSingle()
  const version = versionRes?.data as { id: string, manifest: unknown, status: string } | null
  if (!version) {
    return { kind: 'error', slug: row.slug, message: 'Current version not found.' }
  }
  if (version.status !== 'published') {
    return { kind: 'error', slug: row.slug, message: `Current version is ${version.status}, not published.` }
  }

  let manifest
  try {
    manifest = validateManifest(version.manifest)
  }
  catch (err) {
    return { kind: 'error', slug: row.slug, message: `Manifest invalid: ${(err as Error).message}` }
  }

  const scopes = manifest.permissions?.scopes ?? []
  const insert = sb.from('workspace_integrations').insert({
    workspace_id: ctx.workspaceId,
    provider: row.slug,
    connected_by: ctx.userId,
    scopes,
    metadata: { manifest_version: manifest.identity.version, kind: 'integration' },
    integration_version_id: version.id,
    status: 'active',
    auto_update_channel: 'pinned',
    installed_via_plugin_id: ctx.installedViaPluginId ?? null,
  })
  const installRes = await insert.select?.('id').single()
  if (!installRes || installRes.error || !installRes.data) {
    const msg = installRes?.error?.message ?? 'Insert failed.'
    console.error('[installCatalog] integration install failed', installRes?.error)
    return { kind: 'error', slug: row.slug, message: msg }
  }
  const installId = (installRes.data as { id: string }).id

  if (scopes.length > 0) {
    await sb.from('workspace_integration_grants').insert(
      scopes.map(scope => ({
        workspace_integration_id: installId,
        scope,
        granted_by: ctx.userId,
      })),
    )
  }

  await sb.from('integration_install_events').insert({
    workspace_id: ctx.workspaceId,
    integration_id: row.id,
    event_type: 'install',
    to_version_id: version.id,
    actor_user_id: ctx.userId,
    metadata: { slug: row.slug, kind: 'integration', version: manifest.identity.version, installed_via_plugin_id: ctx.installedViaPluginId ?? null },
  })

  return { kind: 'installed', workspaceIntegrationId: installId, slug: row.slug }
}
