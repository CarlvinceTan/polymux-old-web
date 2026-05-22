import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { validateManifest } from '~~/server/utils/integrations/integrationManifest'
import { isConnectorId } from '~~/server/connectors/registry'
import { useServerPostHog } from '~~/server/utils/posthog'

// POST /api/workspaces/[id]/integrations/install
//
// Third-party install path. First-party connectors still use the OAuth
// redirect (`/api/integrations/[provider]/connect`). For third-party
// integrations of `kind='integration'`, the workspace admin POSTs:
//
//   { slug: 'acme/slack-poster', integration_version_id: '<uuid>' }
//
// The endpoint:
//   1. Verifies the caller is an owner/admin of the workspace.
//   2. Verifies the catalog row exists, is kind='integration', is non
//      first-party, and the integration_version_id matches.
//   3. Inserts a `workspace_integrations` row with provider=slug, no
//      OAuth tokens (intent-only policy), and integration_version_id.
//   4. Inserts the manifest's declared scopes into
//      `workspace_integration_grants` so the orchestrator can dispatch.
//   5. Writes an audit row to `integration_install_events`.
//
// `requires_connectors` is checked best-effort: we warn (in the response)
// if the workspace hasn't connected required first-party connectors yet,
// but install proceeds — the dispatcher will refuse intents that need
// missing connectors anyway.

interface InstallBody {
  slug?: unknown
  integration_version_id?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const body = await readBody<InstallBody>(event)
  const slug = typeof body?.slug === 'string' ? body.slug : ''
  const versionId = typeof body?.integration_version_id === 'string' ? body.integration_version_id : ''
  if (!slug || !versionId) {
    throw createError({ statusCode: 400, statusMessage: 'slug and integration_version_id are required.' })
  }

  if (isConnectorId(slug)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'First-party connectors must be installed via /api/integrations/[provider]/connect.',
    })
  }

  // Membership check via the user-scoped client (so RLS applies).
  const supabase = await serverSupabaseClient(event)
  const sbUser = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq?: (col: string, val: string) => {
            single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
          }
        }
      }
    }
  }
  const memberRes = await sbUser
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq?.('user_id', user.sub)
    .single()
  const member = memberRes?.data as { role?: string } | null
  if (!member || !['owner', 'admin'].includes(member.role ?? '')) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can install integrations.' })
  }

  // From here we use the service role: install crosses RLS boundaries
  // (catalog row may be private, install rows are admin-gated).
  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
          eq?: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
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

  // 1. Resolve the catalog row + version.
  const integRes = await sb.from('integrations').select('id, slug, kind, is_first_party, current_version_id').eq('slug', slug).maybeSingle()
  const integration = integRes?.data as {
    id: string
    slug: string
    kind: string
    is_first_party: boolean
    current_version_id?: string | null
  } | null
  if (!integration) {
    throw createError({ statusCode: 404, statusMessage: 'Integration not found.' })
  }
  if (integration.is_first_party) {
    throw createError({ statusCode: 400, statusMessage: 'Use the OAuth flow for first-party connectors.' })
  }
  if (integration.kind !== 'integration') {
    throw createError({ statusCode: 400, statusMessage: `This endpoint installs kind=integration; got kind=${integration.kind}.` })
  }

  const versionRes = await sb.from('integration_versions').select('id, integration_id, version, manifest, status').eq('id', versionId).maybeSingle()
  const version = versionRes?.data as {
    id: string
    integration_id: string
    version: string
    manifest: unknown
    status: string
  } | null
  if (!version || version.integration_id !== integration.id) {
    throw createError({ statusCode: 400, statusMessage: 'integration_version_id does not match the slug.' })
  }
  if (version.status !== 'published') {
    throw createError({ statusCode: 400, statusMessage: `Cannot install non-published version (status=${version.status}).` })
  }

  let manifest
  try {
    manifest = validateManifest(version.manifest)
  }
  catch (err) {
    throw createError({ statusCode: 400, statusMessage: `Stored manifest invalid: ${(err as Error).message}` })
  }

  // 2. Insert the workspace_integrations row. Unique (workspace_id, provider)
  //    will reject duplicates; surface as 409.
  const installInsert = sb.from('workspace_integrations').insert({
    workspace_id: workspaceId,
    provider: slug,
    connected_by: user.sub,
    account_email: null,
    account_display_name: null,
    scopes: manifest.permissions?.scopes ?? [],
    metadata: { manifest_version: manifest.identity.version },
    integration_version_id: version.id,
    status: 'active',
    auto_update_channel: 'pinned',
  })
  const installRes = await installInsert.select?.('id').single()
  if (!installRes || installRes.error || !installRes.data) {
    const msg = installRes?.error?.message ?? ''
    if (msg.includes('duplicate') || msg.includes('unique')) {
      throw createError({ statusCode: 409, statusMessage: 'Integration already installed in this workspace.' })
    }
    console.error('[install] workspace_integrations insert failed', installRes?.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to install integration.' })
  }
  const installId = (installRes.data as { id: string }).id

  // 3. Grant declared scopes. workspace_integration_grants is a join table —
  //    bulk insert all of them, ignore conflicts on the composite PK.
  const scopes = manifest.permissions?.scopes ?? []
  if (scopes.length > 0) {
    await sb.from('workspace_integration_grants').insert(
      scopes.map(scope => ({
        workspace_integration_id: installId,
        scope,
        granted_by: user.sub,
      })),
    )
  }

  // 4. Audit log.
  await sb.from('integration_install_events').insert({
    workspace_id: workspaceId,
    integration_id: integration.id,
    event_type: 'install',
    to_version_id: version.id,
    actor_user_id: user.sub,
    metadata: { slug, version: manifest.identity.version },
  })

  // 5. Best-effort `requires_connectors` check (informational).
  const missing: string[] = []
  if (manifest.requires_connectors && manifest.requires_connectors.length > 0) {
    for (const rc of manifest.requires_connectors) {
      const r = await sb.from('workspace_integrations').select('id').eq('workspace_id', workspaceId).eq?.('provider', rc.provider).maybeSingle()
      if (!r?.data) missing.push(rc.provider)
    }
  }

  const sessionId = getHeader(event, 'x-posthog-session-id')
  const distinctId = getHeader(event, 'x-posthog-distinct-id')
  useServerPostHog().capture({
    distinctId: distinctId ?? user.sub,
    event: 'integration_installed',
    properties: {
      $session_id: sessionId,
      integration_slug: slug,
      integration_version: manifest.identity.version,
      workspace_id: workspaceId,
      missing_required_connectors: missing,
    },
  })

  return {
    ok: true as const,
    workspace_integration_id: installId,
    granted_scopes: scopes,
    missing_required_connectors: missing,
  }
})
