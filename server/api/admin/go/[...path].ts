import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'

// Web → Go admin bridge.
//
// Forwards `/api/admin/go/<path>` to the Go backend's `/admin/<path>`, carrying
// the maintainer's Bearer JWT (the client attaches it via useAdminGo; Go runs
// its own /admin/me maintainer check). Web's requireMaintainer gates the bridge
// itself for defense-in-depth. This bridges web's cookie session to Go's
// Bearer-token admin gate, so the Go-backed console pages (metrics, benchmarks,
// governance, maintenance) can be ported to the web admin area.
//
// Streaming endpoints (the metrics WebSocket) are NOT proxied here — clients
// open those straight to Go, same as the console does.

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)

  const auth = getRequestHeader(event, 'authorization')
  if (!auth) {
    throw createError({ statusCode: 401, statusMessage: 'Missing Authorization bearer token.' })
  }

  const path = (getRouterParam(event, 'path') || '').replace(/^\/+/, '')
  const base = (useRuntimeConfig().public.serverUrl || '').replace(/\/+$/, '')
  if (!base) {
    throw createError({ statusCode: 500, statusMessage: 'Backend URL (SERVER_URL) is not configured.' })
  }

  const qs = new URLSearchParams(getQuery(event) as Record<string, string>).toString()
  const url = `${base}/admin/${path}${qs ? `?${qs}` : ''}`
  const method = event.method

  const headers: Record<string, string> = { authorization: auth }
  let body: BodyInit | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const raw = await readRawBody(event)
    if (raw != null) {
      body = raw as BodyInit
      headers['content-type'] = getRequestHeader(event, 'content-type') || 'application/json'
    }
  }

  let res: Response
  try {
    res = await fetch(url, { method, headers, body })
  }
  catch (err) {
    throw createError({ statusCode: 502, statusMessage: `Backend unreachable: ${(err as Error).message}` })
  }

  setResponseStatus(event, res.status)
  const ct = res.headers.get('content-type') || ''
  if (ct) setResponseHeader(event, 'content-type', ct)
  const text = await res.text()
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text)
    }
    catch {
      return text
    }
  }
  return text
})
