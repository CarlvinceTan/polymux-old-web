import { serverSupabaseServiceRole } from '#supabase/server'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { requirePolymuxSecret } from '~~/server/utils/security/internalAuth'
import { artifactCap, cloudCap, fileCap } from '~~/server/utils/billing/planLimits'
import { decryptToken } from '~~/server/utils/security/tokenCrypto'
import { resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'

// POST /api/internal/workspaces/[id]/filesystem/session-open
// Body: { user_id: string }  (the invoking user — for autonomous runs this is the workspace owner)
//
// Called by Go at session start. Returns everything needed to seed the
// in-memory file index and evaluate permissions for the duration of the
// session:
//
// - `files`: every file row for the workspace (metadata only — no bytes;
//   the agent fetches bytes on demand via ReadFile)
// - `permissions`: user role + raw grants, so Go can compute effective
//   permission for any path using the same walk-toward-root algorithm as the
//   `effective_file_permission` RPC
// - `drive`: decrypted Drive access token, if a connection exists
// - `plan` + `plan_limits`: drives `max_file_bytes`, `max_artifact_bytes`,
//   and `max_cloud_bytes`
//
// Supabase access keys are not included — Go already has its own credentials
// for any backend it talks to directly (B2 today; Drive via the token above).

interface Body {
  user_id?: unknown
}

interface GrantRow {
  path: string
  user_id: string | null
  grant_level: 'read' | 'write' | 'none'
}

interface FileRow {
  path: string
  kind: 'file' | 'folder'
  size_bytes: number | null
  backend: 'google-drive' | 'local' | 'b2'
  backend_ref: string | null
  etag: string | null
  backend_mtime: string | null
  content_type: string | null
}

export default defineEventHandler(async (event) => {
  await requirePolymuxSecret(event)

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'user_id is required.' })
  }

  const admin = serverSupabaseServiceRole(event)

  // 1. Workspace membership + role (gives the role-default in the permission algorithm).
  const { data: member, error: memberErr } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()
  if (memberErr || !member) {
    throw createError({ statusCode: 403, statusMessage: 'User is not a member of this workspace.' })
  }

  // 2. Workspace plan (drives max_file_bytes / max_artifact_bytes / max_cloud_bytes).
  const { data: workspace, error: wsErr } = await admin
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()
  if (wsErr || !workspace) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load workspace plan.' })
  }
  const plan = typeof workspace.plan === 'string' ? workspace.plan : 'free'

  // 3. All file rows.
  const { data: fileRowsRaw, error: filesErr } = await admin
    .from('files')
    .select('path, kind, size_bytes, backend, backend_ref, etag, backend_mtime, content_type')
    .eq('workspace_id', workspaceId)
  if (filesErr) {
    console.error('[internal/session-open] files query error', filesErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load file index.' })
  }
  const files: FileRow[] = (fileRowsRaw ?? []) as FileRow[]

  // 4. All permission grants for the workspace. Go walks these locally using
  // the same algorithm as effective_file_permission. The map stays small
  // (bounded by admin-authored grants), so we ship raw rows + role default.
  const { data: grantRowsRaw, error: grantsErr } = await admin
    .from('workspace_file_permissions')
    .select('path, user_id, grant_level')
    .eq('workspace_id', workspaceId)
  if (grantsErr) {
    console.error('[internal/session-open] grants query error', grantsErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load permission grants.' })
  }
  const grants: GrantRow[] = (grantRowsRaw ?? []) as GrantRow[]

  // 5. Drive connection (if present). Decrypt access token; Go calls
  // /refresh-token when expires_at approaches.
  const { data: driveRow } = await admin
    .from('workspace_integrations')
    .select('access_token_enc, expires_at, root_folder_id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google-drive')
    .maybeSingle()

  let drive: { access_token: string, expires_at: string | null, root_folder_id: string | null } | null = null
  if (driveRow && driveRow.access_token_enc) {
    try {
      drive = {
        access_token: decryptToken(driveRow.access_token_enc),
        expires_at: driveRow.expires_at ?? null,
        root_folder_id: driveRow.root_folder_id ?? null,
      }
    }
    catch (err) {
      console.error('[internal/session-open] drive token decrypt failed', err)
      // Don't fail the whole request — just omit Drive.
    }
  }

  // 6. Current artifact bucket usage (workspace-wide). Go uses this as the
  // optimistic seed for in-session cap checks; the Nuxt-side insert in
  // /api/internal/artifacts is the authoritative gate.
  const { data: artifactRows } = await admin
    .from('artifacts')
    .select('size_bytes')
    .eq('workspace_id', workspaceId)
  let artifactUsage = 0
  for (const row of artifactRows ?? []) {
    const n = Number((row as { size_bytes?: number | null }).size_bytes ?? 0)
    if (Number.isFinite(n) && n > 0) artifactUsage += Math.floor(n)
  }

  // 7. Current Cloud (B2-backed workspace files) usage. Counted separately
  // from total files because Drive / OPFS bytes don't compete with the
  // polymux-managed cap.
  let cloudUsage = 0
  for (const file of files) {
    if (file.backend === 'b2' && file.size_bytes != null) {
      cloudUsage += Math.floor(file.size_bytes)
    }
  }
  const planCloudCap = cloudCap(plan)

  // 8. Per-workspace B2 sub-key. Auto-mints on first session-open if the
  // workspace doesn't have one yet. The decrypted credential ships in this
  // response so the Go agent's B2Backend can use it (instead of the env-var
  // master key) — every B2 call from a session is scoped to its workspace
  // via the key's namePrefix. Non-fatal on failure: Go falls back to the
  // env-var master key for backward compat during deploy.
  let b2: { application_key_id: string, application_key: string } | null = null
  try {
    const key = await ensureWorkspaceKey(admin, workspaceId, userId)
    b2 = {
      application_key_id: key.applicationKeyId,
      application_key: key.applicationKey,
    }
  }
  catch (err) {
    console.warn('[internal/session-open] b2 key mint failed; Go will use master key fallback', err)
  }

  return {
    files,
    permissions: {
      role: member.role as 'owner' | 'admin' | 'member',
      grants,
    },
    drive,
    b2,
    plan,
    plan_limits: {
      max_file_bytes: fileCap(plan),
      max_artifact_bytes: artifactCap(plan),
      max_cloud_bytes: planCloudCap,
    },
    artifact_usage_bytes: artifactUsage,
    cloud_usage_bytes: cloudUsage,
    // Cloud is available when the plan grants a non-zero cap. Workspaces
    // opt-in via the storage-settings UI for ordering, but availability is
    // plan-driven — there's no separate DB toggle yet.
    cloud_enabled: planCloudCap > 0,
  }
})
