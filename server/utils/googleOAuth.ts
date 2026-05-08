// Google OAuth + Drive REST helpers used by the connect/callback routes,
// the token-refresh internal endpoint, and the migration job.
//
// Why raw fetch and not googleapis: ops are few (token exchange, userinfo,
// files.create folder, files.list/create/get/update/delete) and the official
// SDK pulls a large transitive surface that doesn't pay for itself here.
// We do all of it with Drive v3 REST + node:crypto.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_ABOUT_ENDPOINT = 'https://www.googleapis.com/drive/v3/about'

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

// Gmail uses gmail.modify (read + send + label management) — wide enough to
// cover summarization, drafting, and label routing without granting full
// admin access (which would require gmail.full).
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export interface GoogleOAuthCreds {
  clientId: string
  clientSecret: string
}

export function googleCreds(): GoogleOAuthCreds {
  const cfg = useRuntimeConfig()
  if (!cfg.googleClientId || !cfg.googleClientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured on the server.',
    })
  }
  return { clientId: cfg.googleClientId, clientSecret: cfg.googleClientSecret }
}

// Per-provider redirect URI. Google requires each one to be pre-registered in
// the GCP OAuth client; using the provider id in the path keeps each
// connection's flow independent (and matches the [provider] route file).
export function googleRedirectUri(provider: string): string {
  const appUrl = useRuntimeConfig().public.appUrl
  return `${appUrl.replace(/\/+$/, '')}/api/integrations/${provider}/callback`
}

export function googleDriveRedirectUri(): string {
  return googleRedirectUri('google-drive')
}

export function buildGoogleAuthUrl(state: string, options: { provider?: string, scopes?: string[] } = {}): string {
  const { clientId } = googleCreds()
  const provider = options.provider ?? 'google-drive'
  const scopes = options.scopes ?? GOOGLE_DRIVE_SCOPES
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(provider),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: scopes.join(' '),
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

export async function exchangeAuthCode(code: string, provider = 'google-drive'): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = googleCreds()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleRedirectUri(provider),
    grant_type: 'authorization_code',
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Google token exchange failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as GoogleTokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = googleCreds()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Google token refresh failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as GoogleTokenResponse
}

export interface GoogleUserInfo {
  sub: string
  email?: string
  name?: string
  picture?: string
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Google userinfo failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as GoogleUserInfo
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  parents?: string[]
  md5Checksum?: string
}

export function quotaUserHeader(workspaceId?: string): Record<string, string> {
  return workspaceId ? { 'X-Goog-Quota-User': workspaceId } : {}
}

export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
  workspaceId?: string,
): Promise<DriveFile> {
  const res = await fetch(`${DRIVE_FILES_ENDPOINT}?fields=id,name,mimeType,parents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...quotaUserHeader(workspaceId),
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive folder create failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as DriveFile
}

export interface DriveListOptions {
  parentId?: string
  query?: string
  pageSize?: number
  pageToken?: string
  workspaceId?: string
}

export interface DriveListResult {
  files: DriveFile[]
  nextPageToken?: string
}

export async function listDriveFiles(
  accessToken: string,
  opts: DriveListOptions = {},
): Promise<DriveListResult> {
  const clauses: string[] = []
  if (opts.parentId) clauses.push(`'${opts.parentId}' in parents`)
  clauses.push('trashed = false')
  if (opts.query) clauses.push(opts.query)

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, md5Checksum)',
    pageSize: String(opts.pageSize ?? 100),
  })
  if (opts.pageToken) params.set('pageToken', opts.pageToken)

  const res = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...quotaUserHeader(opts.workspaceId),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive files.list failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as DriveListResult
}

// Mint a resumable upload session URL. The browser PUTs bytes directly to this
// URL; Nuxt only does the handshake. See:
// https://developers.google.com/drive/api/guides/manage-uploads#resumable
export async function createResumableUploadSession(
  accessToken: string,
  metadata: { name: string, parents?: string[], mimeType?: string },
  totalBytes: number,
  workspaceId?: string,
): Promise<string> {
  const res = await fetch(
    `${DRIVE_FILES_ENDPOINT.replace('/drive/v3/files', '/upload/drive/v3/files')}?uploadType=resumable&fields=id,name,size,md5Checksum`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': metadata.mimeType ?? 'application/octet-stream',
        'X-Upload-Content-Length': String(totalBytes),
        ...quotaUserHeader(workspaceId),
      },
      body: JSON.stringify(metadata),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive resumable session create failed: ${res.status} ${text}`.trim(),
    })
  }
  const location = res.headers.get('location')
  if (!location) {
    throw createError({ statusCode: 502, statusMessage: 'Drive did not return an upload URL.' })
  }
  return location
}

// Upload bytes directly (for server-side migration / artifact promotion).
export async function uploadDriveFileBytes(
  accessToken: string,
  metadata: { name: string, parents?: string[], mimeType?: string },
  body: ArrayBuffer | Uint8Array | Buffer,
  workspaceId?: string,
): Promise<DriveFile> {
  // multipart/related: metadata + binary in one round-trip; fine for files we
  // already have in memory. Migration uses streaming via resumable for large
  // files.
  const boundary = `polymuxupload-${Math.random().toString(36).slice(2)}`
  const meta = JSON.stringify(metadata)
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType ?? 'application/octet-stream'}\r\n\r\n`
  const tail = `\r\n--${boundary}--`
  const bin = Buffer.isBuffer(body) ? body : Buffer.from(body as ArrayBuffer)
  const payload = Buffer.concat([Buffer.from(head, 'utf8'), bin, Buffer.from(tail, 'utf8')])

  const res = await fetch(
    `${DRIVE_FILES_ENDPOINT.replace('/drive/v3/files', '/upload/drive/v3/files')}?uploadType=multipart&fields=id,name,size,md5Checksum,modifiedTime,mimeType`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(payload.length),
        ...quotaUserHeader(workspaceId),
      },
      body: payload,
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive file upload failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as DriveFile
}

export async function downloadDriveFileBytes(
  accessToken: string,
  fileId: string,
  workspaceId?: string,
): Promise<Buffer> {
  const res = await fetch(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...quotaUserHeader(workspaceId),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive download failed: ${res.status} ${text}`.trim(),
    })
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function updateDriveFile(
  accessToken: string,
  fileId: string,
  metadata: { name?: string },
  addParents?: string,
  removeParents?: string,
  workspaceId?: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({ fields: 'id,name,parents' })
  if (addParents) params.set('addParents', addParents)
  if (removeParents) params.set('removeParents', removeParents)

  const res = await fetch(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...quotaUserHeader(workspaceId),
    },
    body: JSON.stringify(metadata),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive file update failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as DriveFile
}

export async function copyDriveFile(
  accessToken: string,
  sourceFileId: string,
  name: string,
  parentId?: string,
  workspaceId?: string,
): Promise<DriveFile> {
  // Drive-side copy — no bytes re-uploaded, just a new entry pointing at the
  // same underlying blob. `fields` mirrors createDriveFolder's shape so callers
  // can read id/size/mime the same way.
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,size,md5Checksum,modifiedTime,parents',
  })
  const body: Record<string, unknown> = { name }
  if (parentId) body.parents = [parentId]

  const res = await fetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(sourceFileId)}/copy?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...quotaUserHeader(workspaceId),
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive file copy failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as DriveFile
}

export async function deleteDriveFile(
  accessToken: string,
  fileId: string,
  workspaceId?: string,
): Promise<void> {
  const res = await fetch(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...quotaUserHeader(workspaceId),
    },
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive file delete failed: ${res.status} ${text}`.trim(),
    })
  }
}

// Google reports these as decimal strings because the numbers can overflow a
// 32-bit int (2GB+). `limit` is absent when the account has no quota cap
// (e.g. some Workspace tiers with pooled/unlimited storage).
export interface DriveStorageQuota {
  usage: number
  limit: number | null
  usageInDrive: number | null
}

export async function fetchDriveStorageQuota(
  accessToken: string,
  workspaceId?: string,
): Promise<DriveStorageQuota> {
  const res = await fetch(`${DRIVE_ABOUT_ENDPOINT}?fields=storageQuota`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...quotaUserHeader(workspaceId),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive about.get failed: ${res.status} ${text}`.trim(),
    })
  }
  const data = (await res.json()) as {
    storageQuota?: { usage?: string, limit?: string, usageInDrive?: string }
  }
  const q = data.storageQuota ?? {}
  return {
    usage: toNumber(q.usage) ?? 0,
    limit: toNumber(q.limit),
    usageInDrive: toNumber(q.usageInDrive),
  }
}

function toNumber(value: string | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
