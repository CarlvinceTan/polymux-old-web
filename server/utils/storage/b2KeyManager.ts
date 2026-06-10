// Per-workspace Backblaze B2 application key lifecycle. The master key
// (B2_MASTER_KEY_ID / B2_MASTER_KEY env vars) holds `writeKeys`
// capability; this module uses it ONLY to mint and revoke per-workspace
// sub-keys. Every workspace-scoped B2 operation then uses the sub-key, so
// a leak of one workspace's key cannot reach another workspace's bytes.
//
// Sub-key shape:
//   capabilities: read/write/delete/list/share for the workspace's prefix
//   bucketId    : the global polymux bucket id (resolved once per process)
//   namePrefix  : "{workspace_id}/"
//   keyName     : "polymux-ws-{workspace_id}" (audit-friendly)
//
// Persistence: `workspace_integrations` row with provider='b2'. The
// applicationKey (secret) lives in `access_token_enc`; applicationKeyId
// (non-secret) lives in the dedicated `key_external_id` column added in
// migration 20260514010000_workspace_b2_key.sql.

import type { SupabaseClient } from '@supabase/supabase-js'

import { decryptToken, encryptToken } from '~~/server/utils/security/tokenCrypto'

interface MasterEnv {
  applicationKeyId: string
  applicationKey: string
  bucketName: string
}

function readMasterEnv(): MasterEnv {
  const applicationKeyId = process.env.B2_MASTER_KEY_ID || ''
  const applicationKey = process.env.B2_MASTER_KEY || ''
  const bucketName = process.env.B2_BUCKET_NAME || ''
  if (!applicationKeyId || !applicationKey || !bucketName) {
    throw createError({
      statusCode: 503,
      message: 'B2 not configured (B2_MASTER_KEY_ID / B2_MASTER_KEY / B2_BUCKET_NAME).',
    })
  }
  return { applicationKeyId, applicationKey, bucketName }
}

// Master-auth cache. Same shape as b2.ts but kept separate so the master's
// credentials never co-mingle with a workspace credential cache.
interface MasterAuth {
  accountId: string
  authToken: string
  apiUrl: string
  bucketId: string | null
  expiresAt: number
}

const REFRESH_BUFFER_MS = 60 * 60 * 1000
const AUTH_TTL_MS = 24 * 60 * 60 * 1000

let masterAuthCache: Promise<MasterAuth> | null = null
let masterBucketIdCache: string | null = null

async function authorizeMaster(): Promise<MasterAuth> {
  const { applicationKeyId, applicationKey } = readMasterEnv()
  const credentials = Buffer.from(`${applicationKeyId}:${applicationKey}`).toString('base64')
  const resp = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      message: `b2_authorize_account (master): ${resp.status} ${body.slice(0, 200)}`,
    })
  }
  const payload = await resp.json() as {
    accountId: string
    authorizationToken: string
    apiInfo: { storageApi: { apiUrl: string, bucketId?: string | null } }
  }
  return {
    accountId: payload.accountId,
    authToken: payload.authorizationToken,
    apiUrl: payload.apiInfo.storageApi.apiUrl.replace(/\/$/, ''),
    bucketId: payload.apiInfo.storageApi.bucketId ?? null,
    expiresAt: Date.now() + AUTH_TTL_MS,
  }
}

async function getMasterAuth(): Promise<MasterAuth> {
  if (masterAuthCache) {
    const existing = await masterAuthCache
    if (existing.expiresAt - REFRESH_BUFFER_MS > Date.now()) return existing
  }
  masterAuthCache = authorizeMaster().catch((err) => {
    masterAuthCache = null
    throw err
  })
  return masterAuthCache
}

async function resolveBucketId(auth: MasterAuth): Promise<string> {
  if (auth.bucketId) return auth.bucketId
  if (masterBucketIdCache) return masterBucketIdCache
  const { bucketName } = readMasterEnv()
  const resp = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_buckets`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: auth.accountId, bucketName }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_list_buckets: ${resp.status} ${body.slice(0, 200)}`,
    })
  }
  const payload = await resp.json() as { buckets: { bucketId: string, bucketName: string }[] }
  const match = payload.buckets.find(b => b.bucketName === bucketName)
  if (!match) {
    throw createError({ statusCode: 503, statusMessage: `B2 bucket ${bucketName} not found.` })
  }
  masterBucketIdCache = match.bucketId
  return match.bucketId
}

// Capabilities every per-workspace key needs. Excludes write/delete bucket
// powers and key-management — the master keeps those.
const WORKSPACE_CAPABILITIES = [
  'readFiles',
  'writeFiles',
  'deleteFiles',
  'listFiles',
  'shareFiles',
]

export interface WorkspaceB2Key {
  applicationKeyId: string
  applicationKey: string
}

/**
 * Mints a B2 application key scoped to `{workspaceId}/` under the polymux
 * bucket, persists it in workspace_integrations (encrypted), and returns
 * the credentials. The caller owns the workspace_integrations write; this
 * fn is idempotent across (workspace_id, provider='b2') via the unique
 * constraint, so re-calling it on an existing row REVOKES the old key
 * first to avoid leaking access via stale credentials.
 */
export async function mintWorkspaceKey(
  admin: SupabaseClient,
  workspaceId: string,
  connectedBy: string,
): Promise<WorkspaceB2Key> {
  // If a key already exists for this workspace, revoke it first so we don't
  // accumulate dormant credentials. Idempotency over re-runs is the design
  // contract here; the caller doesn't have to check existence.
  await revokeWorkspaceKey(admin, workspaceId).catch((err) => {
    console.warn('[b2KeyManager] revoke-before-mint failed (continuing)', err)
  })

  const auth = await getMasterAuth()
  const bucketId = await resolveBucketId(auth)
  const namePrefix = `${workspaceId}/`
  const keyName = `polymux-ws-${workspaceId}`.slice(0, 100) // B2 caps key names at 100 chars

  const resp = await fetch(`${auth.apiUrl}/b2api/v3/b2_create_key`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: auth.accountId,
      capabilities: WORKSPACE_CAPABILITIES,
      keyName,
      bucketId,
      namePrefix,
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      message: `b2_create_key: ${resp.status} ${body.slice(0, 200)}`,
    })
  }
  const payload = await resp.json() as {
    applicationKeyId: string
    applicationKey: string
  }

  const { error: upsertErr } = await admin
    .from('workspace_integrations')
    .upsert({
      workspace_id: workspaceId,
      provider: 'b2',
      connected_by: connectedBy,
      key_external_id: payload.applicationKeyId,
      access_token_enc: encryptToken(payload.applicationKey),
      scopes: WORKSPACE_CAPABILITIES,
    }, { onConflict: 'workspace_id,provider' })

  if (upsertErr) {
    // Try to clean up the orphaned B2 key so we don't leak it.
    await deleteB2Key(payload.applicationKeyId).catch(() => {})
    throw createError({
      statusCode: 500,
      message: `Failed to persist workspace B2 key: ${upsertErr.message}`,
    })
  }

  return {
    applicationKeyId: payload.applicationKeyId,
    applicationKey: payload.applicationKey,
  }
}

/**
 * Fetches + decrypts the workspace's B2 sub-key, minting one on-the-fly if
 * the row is missing. Use this from hot paths (upload-url, download-url,
 * artifact endpoints) so workspaces created before this feature shipped
 * get a key on their first B2-touching operation.
 *
 * The `connected_by` column on the mint path resolves to the workspace
 * owner via workspaces.created_by; if that's gone too, falls back to the
 * provided `actorUserId` (typically the authenticated caller).
 */
export async function ensureWorkspaceKey(
  admin: SupabaseClient,
  workspaceId: string,
  actorUserId: string,
): Promise<WorkspaceB2Key> {
  const existing = await getWorkspaceKey(admin, workspaceId)
  if (existing) return existing

  const { data: ws } = await admin
    .from('workspaces')
    .select('created_by')
    .eq('id', workspaceId)
    .maybeSingle()
  const owner = (ws?.created_by as string | undefined) || actorUserId
  return mintWorkspaceKey(admin, workspaceId, owner)
}

/**
 * Fetches + decrypts the workspace's B2 sub-key. Returns null when the
 * workspace has no row yet (callers MAY backfill via mintWorkspaceKey,
 * or use ensureWorkspaceKey for auto-backfill).
 */
export async function getWorkspaceKey(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceB2Key | null> {
  const { data, error } = await admin
    .from('workspace_integrations')
    .select('key_external_id, access_token_enc')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'b2')
    .maybeSingle()
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to load workspace B2 key: ${error.message}`,
    })
  }
  if (!data || !data.key_external_id || !data.access_token_enc) return null
  return {
    applicationKeyId: data.key_external_id as string,
    applicationKey: decryptToken(data.access_token_enc as string),
  }
}

/**
 * Revokes the workspace's B2 key by deleting it via b2_delete_key, then
 * removes the workspace_integrations row. Idempotent: returns silently if
 * no row exists. Best-effort: a B2 API failure logs + continues so the DB
 * row is always removed at the end — orphaned B2 keys can be reaped later
 * via b2_list_keys + correlation against workspace IDs.
 */
export async function revokeWorkspaceKey(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  const { data } = await admin
    .from('workspace_integrations')
    .select('key_external_id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'b2')
    .maybeSingle()
  if (!data?.key_external_id) return

  try {
    await deleteB2Key(data.key_external_id as string)
  }
  catch (err) {
    console.warn('[b2KeyManager] b2_delete_key failed; row still being removed', err)
  }

  await admin
    .from('workspace_integrations')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('provider', 'b2')
}

async function deleteB2Key(applicationKeyId: string): Promise<void> {
  const auth = await getMasterAuth()
  const resp = await fetch(`${auth.apiUrl}/b2api/v3/b2_delete_key`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationKeyId }),
  })
  if (!resp.ok && resp.status !== 404) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      message: `b2_delete_key: ${resp.status} ${body.slice(0, 200)}`,
    })
  }
}
