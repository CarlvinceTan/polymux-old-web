import { Readable } from 'node:stream'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { assertMembership, resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'

// POST /api/workspaces/[id]/files/upload-drive-proxy?session_url=...
//
// Google Drive's resumable-upload session URL does not respond with CORS
// headers for arbitrary browser origins, so the browser can't PUT directly.
// This same-origin endpoint streams the request body straight through to the
// session URL server-side and returns Drive's terminal JSON (`{ id, ... }`).

const DRIVE_UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)

  const sessionUrl = String(getQuery(event).session_url ?? '')
  if (!sessionUrl.startsWith(DRIVE_UPLOAD_PREFIX)) {
    throw createError({ statusCode: 400, statusMessage: 'session_url must be a Drive resumable-upload URL.' })
  }

  const contentType = getHeader(event, 'content-type') || 'application/octet-stream'
  const contentLength = getHeader(event, 'content-length')

  const headers: Record<string, string> = { 'Content-Type': contentType }
  if (contentLength) headers['Content-Length'] = contentLength

  // Stream the incoming request straight to Drive. `duplex: 'half'` is required
  // by undici whenever body is a stream; it isn't yet in the DOM fetch typings.
  const body = Readable.toWeb(event.node.req) as unknown as ReadableStream<Uint8Array>
  const init: RequestInit = { method: 'PUT', headers, body }
  ;(init as { duplex?: string }).duplex = 'half'
  const res = await fetch(sessionUrl, init)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive upload failed: ${res.status} ${text}`.trim(),
    })
  }

  return (await res.json()) as { id: string, name?: string, size?: string, md5Checksum?: string }
})
