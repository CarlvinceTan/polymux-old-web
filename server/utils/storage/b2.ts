// Backblaze B2 client used by Nuxt endpoints. Mirrors the Go-side
// `polymux/internal/filesystem/b2_backend.go` driver. Every workspace's
// bytes live under a single `{workspace_id}/` namespace inside the polymux
// bucket, so a B2 application key whose namePrefix is `{workspace_id}/`
// gives access to both workspace files and that workspace's artifacts —
// and nothing else. Per-workspace sub-keys are minted by storage/b2KeyManager.ts.
//
//   {workspace_id}/files/{logical_path}              for workspace files
//   {workspace_id}/artifacts/{session_id}/...        for workflow artifacts
//
// Every function here takes a B2Credentials parameter so callers can pick
// per-workspace or master credentials per request. The auth handshake is
// cached per `applicationKeyId` so concurrent same-workspace requests
// share an in-flight authorize call.

interface B2AuthState {
  accountId: string
  authToken: string
  apiUrl: string
  downloadUrl: string
  bucketId: string | null
  expiresAt: number // epoch ms
}

interface B2UploadResponse {
  fileId: string
  fileName: string
  contentSha1: string
  contentLength: number
  contentType: string
}

export interface B2Credentials {
  applicationKeyId: string
  applicationKey: string
}

const REFRESH_BUFFER_MS = 60 * 60 * 1000 // 1 h, matches the Go side
const AUTH_TTL_MS = 24 * 60 * 60 * 1000 // B2 tokens are valid 24 h

// Cache keyed by applicationKeyId so per-workspace sub-keys don't trample
// each other's auth state. The map values are Promises so concurrent
// same-key callers share a single in-flight authorize.
const authCache = new Map<string, Promise<B2AuthState>>()
// Per-credentials bucketId cache. The auth response often carries the
// bucketId for sub-keys (since they're bucket-scoped); only the master
// needs a separate b2_list_buckets round-trip.
const bucketIdCache = new Map<string, string>()

function readBucketName(): string {
  const bucketName = process.env.B2_BUCKET_NAME || ''
  if (!bucketName) {
    throw createError({
      statusCode: 503,
      statusMessage: 'B2 not configured (B2_BUCKET_NAME).',
    })
  }
  return bucketName
}

/**
 * Returns the polymux master credentials from env. Use ONLY for ops paths
 * (key management, migration tooling); every workspace-scoped path should
 * resolve a per-workspace credential via b2KeyManager.getWorkspaceKey()
 * instead so a leak only exposes one workspace's bytes.
 */
export function readMasterCredentials(): B2Credentials {
  const applicationKeyId = process.env.B2_MASTER_KEY_ID || ''
  const applicationKey = process.env.B2_MASTER_KEY || ''
  if (!applicationKeyId || !applicationKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'B2 master not configured (B2_MASTER_KEY_ID / B2_MASTER_KEY).',
    })
  }
  return { applicationKeyId, applicationKey }
}

async function authorize(creds: B2Credentials): Promise<B2AuthState> {
  const credentials = Buffer.from(`${creds.applicationKeyId}:${creds.applicationKey}`).toString('base64')
  const resp = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_authorize_account: ${resp.status} ${body.slice(0, 200)}`,
    })
  }
  const payload = await resp.json() as {
    accountId: string
    authorizationToken: string
    apiInfo: {
      storageApi: {
        apiUrl: string
        downloadUrl: string
        bucketId?: string | null
      }
    }
  }
  return {
    accountId: payload.accountId,
    authToken: payload.authorizationToken,
    apiUrl: payload.apiInfo.storageApi.apiUrl.replace(/\/$/, ''),
    downloadUrl: payload.apiInfo.storageApi.downloadUrl.replace(/\/$/, ''),
    bucketId: payload.apiInfo.storageApi.bucketId ?? null,
    expiresAt: Date.now() + AUTH_TTL_MS,
  }
}

async function getAuth(creds: B2Credentials): Promise<B2AuthState> {
  const existing = authCache.get(creds.applicationKeyId)
  if (existing) {
    const state = await existing
    if (state.expiresAt - REFRESH_BUFFER_MS > Date.now()) return state
  }
  const pending = authorize(creds).catch((err) => {
    authCache.delete(creds.applicationKeyId)
    throw err
  })
  authCache.set(creds.applicationKeyId, pending)
  return pending
}

async function resolveBucketId(creds: B2Credentials, auth: B2AuthState): Promise<string> {
  if (auth.bucketId) return auth.bucketId
  const cached = bucketIdCache.get(creds.applicationKeyId)
  if (cached) return cached
  // Master path (sub-keys come with bucketId baked in).
  const bucketName = readBucketName()
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
  const bucket = payload.buckets.find(b => b.bucketName === bucketName)
  if (!bucket) {
    throw createError({
      statusCode: 503,
      statusMessage: `B2 bucket ${bucketName} not found.`,
    })
  }
  bucketIdCache.set(creds.applicationKeyId, bucket.bucketId)
  return bucket.bucketId
}

/**
 * Mints a short-lived authorization token for downloads under `fileKey`.
 * Returns a fully-formed signed download URL the browser can fetch directly;
 * the auth token is embedded as a query param so no extra headers are
 * required at fetch time.
 */
export async function b2SignedDownloadURL(
  creds: B2Credentials,
  fileKey: string,
  validSeconds = 60 * 60,
): Promise<{ url: string, expiresAt: string }> {
  const bucketName = readBucketName()
  const auth = await getAuth(creds)
  const bucketId = await resolveBucketId(creds, auth)
  const resp = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_download_authorization`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucketId,
      fileNamePrefix: fileKey, // exact match; same prefix means same single file
      validDurationInSeconds: validSeconds,
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_get_download_authorization: ${resp.status} ${body.slice(0, 200)}`,
    })
  }
  const payload = await resp.json() as { authorizationToken: string }
  const encodedKey = fileKey.split('/').map(seg => encodeURIComponent(seg)).join('/')
  const url = `${auth.downloadUrl}/file/${encodeURIComponent(bucketName)}/${encodedKey}?Authorization=${encodeURIComponent(payload.authorizationToken)}`
  return {
    url,
    expiresAt: new Date(Date.now() + validSeconds * 1000).toISOString(),
  }
}

/**
 * Streams the bytes for a specific object key as a Buffer. Used by the
 * artifact-promote handler which needs to re-upload to Drive on the server
 * side.
 */
export async function b2DownloadBytes(creds: B2Credentials, fileKey: string): Promise<Buffer> {
  const bucketName = readBucketName()
  const auth = await getAuth(creds)
  const encodedKey = fileKey.split('/').map(seg => encodeURIComponent(seg)).join('/')
  const url = `${auth.downloadUrl}/file/${encodeURIComponent(bucketName)}/${encodedKey}`
  const resp = await fetch(url, {
    headers: { Authorization: auth.authToken },
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2 download ${fileKey}: ${resp.status} ${body.slice(0, 200)}`,
    })
  }
  return Buffer.from(await resp.arrayBuffer())
}

/**
 * Removes a single B2 file version. B2 requires BOTH the fileId and fileName
 * because file IDs are per-version; we look up the fileId via
 * b2_list_file_names before calling delete. Idempotent: missing files are
 * treated as already-deleted.
 */
export async function b2DeleteByKey(creds: B2Credentials, fileKey: string): Promise<void> {
  const auth = await getAuth(creds)
  const bucketId = await resolveBucketId(creds, auth)
  const listResp = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucketId,
      startFileName: fileKey,
      maxFileCount: 1,
      prefix: fileKey,
    }),
  })
  if (!listResp.ok) {
    const body = await listResp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_list_file_names: ${listResp.status} ${body.slice(0, 200)}`,
    })
  }
  const listPayload = await listResp.json() as { files: { fileId: string, fileName: string }[] }
  const match = listPayload.files.find(f => f.fileName === fileKey)
  if (!match) return // already absent; idempotent.

  const delResp = await fetch(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId: match.fileId, fileName: fileKey }),
  })
  if (!delResp.ok && delResp.status !== 404) {
    const body = await delResp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_delete_file_version: ${delResp.status} ${body.slice(0, 200)}`,
    })
  }
}

/**
 * Returns a fresh B2 upload URL + token pair the browser can POST to
 * directly. The browser must compute the SHA1 of the bytes and include it
 * as `X-Bz-Content-Sha1` along with `X-Bz-File-Name` (URL-encoded segments,
 * `/` preserved).
 */
export async function b2GetUploadURL(
  creds: B2Credentials,
): Promise<{ uploadUrl: string, authorizationToken: string }> {
  const auth = await getAuth(creds)
  const bucketId = await resolveBucketId(creds, auth)
  const resp = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_get_upload_url: ${resp.status} ${body.slice(0, 200)}`,
    })
  }
  return await resp.json() as { uploadUrl: string, authorizationToken: string }
}

/**
 * Server-side copy of an existing B2 object to a new key. Because B2 objects
 * are keyed by their logical path (b2WorkspaceKey), a "rename"/"move" of a
 * Cloud file is a copy-to-new-key followed by a delete-of-the-old-key — there
 * is no native rename. Mirrors the Go driver's B2Backend.Move (b2_copy_file
 * with the default COPY metadata directive, which preserves content-type and
 * server-side encryption). Does NOT delete the source; callers delete the old
 * key (b2DeleteByKey) after the metadata flip so a copy failure leaves the
 * original intact. B2's single-call b2_copy_file caps at ~5 GB; larger objects
 * would need b2_copy_part (not implemented — callers should guard on size).
 */
export async function b2CopyFile(
  creds: B2Credentials,
  sourceFileId: string,
  destKey: string,
): Promise<B2UploadResponse> {
  if (!sourceFileId) {
    throw createError({ statusCode: 400, statusMessage: 'b2 copy requires a source fileId.' })
  }
  const auth = await getAuth(creds)
  const resp = await fetch(`${auth.apiUrl}/b2api/v3/b2_copy_file`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceFileId, fileName: destKey }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_copy_file: ${resp.status} ${body.slice(0, 200)}`,
    })
  }
  return await resp.json() as B2UploadResponse
}

/**
 * Returns the canonical workspace-files object key for a logical path. Mirrors
 * the Go driver's workspaceObjectKey so server + client agree.
 */
export function b2WorkspaceKey(workspaceId: string, logicalPath: string): string {
  return `${workspaceId}/files/${logicalPath}`
}

/**
 * Uploads `bytes` to the given object key. Returns the B2 response metadata.
 * Used by server-side flows that need to write directly (rather than minting
 * a presigned URL handed to a client). Browser uploads should instead call
 * b2GetUploadURL and POST themselves.
 */
export async function b2UploadBytes(
  creds: B2Credentials,
  fileKey: string,
  contentType: string,
  bytes: Buffer,
): Promise<B2UploadResponse> {
  const auth = await getAuth(creds)
  const bucketId = await resolveBucketId(creds, auth)
  const urlResp = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: 'POST',
    headers: { 'Authorization': auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId }),
  })
  if (!urlResp.ok) {
    const body = await urlResp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_get_upload_url: ${urlResp.status} ${body.slice(0, 200)}`,
    })
  }
  const urlPayload = await urlResp.json() as { uploadUrl: string, authorizationToken: string }

  const { createHash } = await import('node:crypto')
  const sha1 = createHash('sha1').update(bytes).digest('hex')

  const encodedKey = fileKey.split('/').map(seg => encodeURIComponent(seg)).join('/')
  const uploadResp = await fetch(urlPayload.uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': urlPayload.authorizationToken,
      'X-Bz-File-Name': encodedKey,
      'Content-Type': contentType || 'b2/x-auto',
      'X-Bz-Content-Sha1': sha1,
      'X-Bz-Server-Side-Encryption': 'AES256',
      'Content-Length': String(bytes.length),
    },
    // fetch() BodyInit excludes Node Buffer in dom lib typings; coerce to U8Array.
    body: new Uint8Array(bytes),
  })
  if (!uploadResp.ok) {
    const body = await uploadResp.text()
    throw createError({
      statusCode: 502,
      statusMessage: `b2_upload_file: ${uploadResp.status} ${body.slice(0, 200)}`,
    })
  }
  return await uploadResp.json() as B2UploadResponse
}
