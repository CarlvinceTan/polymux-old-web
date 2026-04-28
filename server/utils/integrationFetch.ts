// SSRF-defended HTTPS fetch for integration manifests + webhook dispatches.
//
// Untrusted URLs flow into Polymux from two places: the manifest URL a
// publisher submits, and the `runtime.base_url` baked into a manifest the
// dispatcher then calls. Both go through `safeFetch()`, which:
//   - Requires https:// scheme.
//   - Resolves the host's IPs and rejects loopback / link-local / RFC 1918 /
//     IPv6 ULA / multicast / cloud-metadata addresses (a malicious manifest
//     could otherwise probe the Polymux internal network).
//   - Caps response body size so a slow drip can't pin a Nuxt worker.
//   - Honors a per-call AbortController timeout.
//
// In dev (`import.meta.dev`) we relax the IP guard so authors can point at
// localhost while iterating. Production behavior is locked.

import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const DEFAULT_TIMEOUT_MS = 8000
const MAX_MANIFEST_BYTES = 256 * 1024  // 256 KiB ceiling for manifests
const MAX_RESPONSE_BYTES = 1024 * 1024 // 1 MiB ceiling for webhook responses

export interface SafeFetchOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
  /**
   * If true, allows http:// and IP-literal hosts. Off-by-default; manifest
   * fetching uses the strict path. Webhook calls keep the strict path too —
   * authors must host on a real HTTPS endpoint, even in dev.
   */
  allowInsecure?: boolean
}

export interface SafeFetchResult {
  status: number
  ok: boolean
  headers: Headers
  text: string
}

export class SafeFetchError extends Error {
  constructor(public reason: 'scheme' | 'dns' | 'private_ip' | 'timeout' | 'too_large' | 'http_error' | 'invalid_url', message: string, public statusCode?: number) {
    super(message)
    this.name = 'SafeFetchError'
  }
}

function urlOrThrow(rawUrl: string): URL {
  try {
    return new URL(rawUrl)
  }
  catch {
    throw new SafeFetchError('invalid_url', `Invalid URL: ${rawUrl}`)
  }
}

function isPrivateOrLoopback(ip: string): boolean {
  // IPv4
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(n => parseInt(n, 10))
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true
    const a = parts[0] ?? 0
    const b = parts[1] ?? 0
    if (a === 127) return true                              // loopback
    if (a === 10) return true                               // RFC 1918
    if (a === 172 && b >= 16 && b <= 31) return true        // RFC 1918
    if (a === 192 && b === 168) return true                 // RFC 1918
    if (a === 169 && b === 254) return true                 // link-local + cloud metadata 169.254.169.254
    if (a === 100 && b >= 64 && b <= 127) return true       // CGNAT 100.64.0.0/10
    if (a === 0) return true                                // 0.0.0.0/8
    if (a >= 224) return true                               // multicast + reserved
    return false
  }
  // IPv6
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1') return true                        // loopback
    if (lower === '::') return true                         // unspecified
    if (lower.startsWith('fe80:')) return true              // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // ULA
    if (lower.startsWith('ff')) return true                 // multicast
    return false
  }
  return true // unknown family — refuse
}

async function assertHostnameSafe(url: URL): Promise<void> {
  const host = url.hostname
  if (!host) {
    throw new SafeFetchError('invalid_url', 'URL has no hostname')
  }
  if (host.toLowerCase() === 'localhost') {
    throw new SafeFetchError('private_ip', 'Hostname `localhost` is not allowed')
  }
  // If the host is an IP literal, check it directly.
  if (isIP(host)) {
    if (isPrivateOrLoopback(host)) {
      throw new SafeFetchError('private_ip', `IP ${host} is private/loopback`)
    }
    return
  }
  // Otherwise resolve via DNS and check every returned address.
  let addrs: Awaited<ReturnType<typeof dnsLookup>> | { address: string, family: number }[]
  try {
    addrs = await dnsLookup(host, { all: true })
  }
  catch (err) {
    throw new SafeFetchError('dns', `DNS lookup failed for ${host}: ${(err as Error).message}`)
  }
  if (!addrs || addrs.length === 0) {
    throw new SafeFetchError('dns', `No IPs returned for ${host}`)
  }
  for (const a of addrs) {
    if (isPrivateOrLoopback(a.address)) {
      throw new SafeFetchError('private_ip', `${host} resolves to private/loopback ${a.address}`)
    }
  }
}

/**
 * HTTPS-only fetch with SSRF + timeout + size guards. Returns the response
 * body as text up to `maxBytes`. Caller is responsible for parsing JSON.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const url = urlOrThrow(rawUrl)
  const allowInsecure = opts.allowInsecure === true && import.meta.dev === true
  if (url.protocol !== 'https:' && !allowInsecure) {
    throw new SafeFetchError('scheme', `URL must use https:// (got ${url.protocol})`)
  }
  if (!allowInsecure) {
    await assertHostnameSafe(url)
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: ctl.signal,
      redirect: 'manual',
    })
    if (res.status >= 300 && res.status < 400) {
      // Don't auto-follow redirects — they can pivot to an internal target
      // even after the initial host check passed. Treat as terminal.
      throw new SafeFetchError('http_error', `Refusing to follow redirect from ${url.origin}`, res.status)
    }
    // Read bounded body.
    const reader = res.body?.getReader()
    if (!reader) {
      const text = await res.text()
      if (text.length > maxBytes) {
        throw new SafeFetchError('too_large', `Response body exceeded ${maxBytes} bytes`)
      }
      return { status: res.status, ok: res.ok, headers: res.headers, text }
    }
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.length
        if (total > maxBytes) {
          await reader.cancel().catch(() => {})
          throw new SafeFetchError('too_large', `Response body exceeded ${maxBytes} bytes`)
        }
        chunks.push(value)
      }
    }
    const text = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8')
    return { status: res.status, ok: res.ok, headers: res.headers, text }
  }
  catch (err) {
    if (err instanceof SafeFetchError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SafeFetchError('timeout', `Request to ${url.origin} timed out after ${timeoutMs}ms`)
    }
    throw new SafeFetchError('http_error', `Fetch to ${url.origin} failed: ${(err as Error).message}`)
  }
  finally {
    clearTimeout(timer)
  }
}

/** Convenience wrapper for manifest fetching with a tighter size cap. */
export async function fetchManifest(rawUrl: string): Promise<{ raw: string, parsed: unknown }> {
  const res = await safeFetch(rawUrl, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'polymux-marketplace/1.0' },
    maxBytes: MAX_MANIFEST_BYTES,
    timeoutMs: 8000,
  })
  if (!res.ok) {
    throw new SafeFetchError('http_error', `Manifest fetch returned ${res.status}`, res.status)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(res.text)
  }
  catch (err) {
    throw new SafeFetchError('http_error', `Manifest is not valid JSON: ${(err as Error).message}`)
  }
  return { raw: res.text, parsed }
}
