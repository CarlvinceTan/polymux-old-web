import { serverSupabaseServiceRole } from '#supabase/server'
import { requirePolymuxSecret } from '~~/server/utils/security/internalAuth'
import { resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'
import { resolvePluginCredential, type ResolvedCredential } from '~~/server/utils/integrations/pluginCredentials'

// GET /api/internal/workspaces/[id]/plugins/[slug]/credentials
//
// Returns the resolved plugin credentials for a workspace + integration, each
// secret field decrypted. Resolution per credential is workspace-override →
// managed default (see pluginCredentials.ts). Polymux Go calls this with the
// shared internal secret so the runtime can broker OAuth / inject credentials
// without ever holding the encryption key — mirrors the BYOK llm-keys endpoint.
//
// Response:
//   { integration_id, credentials: [{ key, type, source, fields, scopes }],
//     unsatisfied: ["<declared key with no provisioned credential>", …] }
//
// `unsatisfied` lists manifest-declared credentials that neither the workspace
// nor Polymux has provisioned — the connect flow must prompt for those.

interface CredentialsResponse {
  integration_id: string
  credentials: ResolvedCredential[]
  unsatisfied: string[]
}

export default defineEventHandler(async (event): Promise<CredentialsResponse> => {
  await requirePolymuxSecret(event)
  const workspaceId = resolveWorkspaceId(event)
  // Slugs are namespaced (e.g. "author/plugin"); callers encode the slash as
  // %2F to keep it a single route segment, so decode it here.
  const slug = decodeURIComponent(getRouterParam(event, 'slug') ?? '')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })
  }

  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as { from: (t: string) => any }

  const integ = await sb
    .from('integrations')
    .select('id, current_version_id')
    .eq('slug', slug)
    .maybeSingle()
  const integration = integ.data as { id?: string, current_version_id?: string | null } | null
  if (!integration?.id) {
    throw createError({ statusCode: 404, statusMessage: `Unknown plugin '${slug}'.` })
  }

  // Read the declared credential keys from the current version's manifest. We
  // read loosely rather than validateManifest() because first-party seed
  // manifests use a legacy category the validator rejects.
  let declared: string[] = []
  if (integration.current_version_id) {
    const ver = await sb
      .from('integration_versions')
      .select('manifest')
      .eq('id', integration.current_version_id)
      .maybeSingle()
    const manifest = (ver.data as { manifest?: unknown } | null)?.manifest as { credentials?: unknown } | undefined
    if (manifest && Array.isArray(manifest.credentials)) {
      declared = (manifest.credentials as Array<Record<string, unknown>>)
        .map(c => (typeof c?.key === 'string' ? c.key : null))
        .filter((k): k is string => k !== null)
    }
  }

  const credentials: ResolvedCredential[] = []
  const unsatisfied: string[] = []
  for (const key of declared) {
    const resolved = await resolvePluginCredential(admin, {
      workspaceId,
      integrationId: integration.id,
      credentialKey: key,
    })
    if (resolved) credentials.push(resolved)
    else unsatisfied.push(key)
  }

  return { integration_id: integration.id, credentials, unsatisfied }
})
