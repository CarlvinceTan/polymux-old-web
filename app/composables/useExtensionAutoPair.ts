// Bridge between the Polymux web UI and the browser extension service worker.
//
// On auth-protected page loads (driven by the extension-auto-pair client
// plugin) this composable probes the extension via chrome.runtime.sendMessage
// and, if it's reachable but disconnected, mints a pairing code from the Go
// server and pushes it back so the extension can complete its WebSocket
// handshake without the user typing anything.

type PairStatus = 'unknown' | 'absent' | 'connected' | 'paired' | 'error'

interface ExtensionStatusSnapshot {
  state: 'disconnected' | 'connecting' | 'connected' | 'error'
  user_id?: string
  extension_id: string
  last_error?: string
}

interface BridgeOk<T> {
  ok: true
  result: T
}

interface BridgeErr {
  ok: false
  error: string
}

type BridgeResponse<T> = BridgeOk<T> | BridgeErr

interface PairCodeResponse {
  code: string
  expires_at?: string
}

const PROBE_TIMEOUT_MS = 1000
const SESSION_KEY_PREFIX = 'polymux:extension:probed:'

declare global {
  interface Window {
    chrome?: typeof chrome
  }
}

function sessionKey(userId: string, extensionId: string): string {
  return `${SESSION_KEY_PREFIX}${userId}:${extensionId}`
}

function sendToExtension<T>(
  extensionId: string,
  message: unknown,
): Promise<BridgeResponse<T>> {
  return new Promise((resolve) => {
    const chromeApi = window.chrome
    if (!chromeApi?.runtime?.sendMessage) {
      resolve({ ok: false, error: 'chrome.runtime not available' })
      return
    }
    let settled = false
    const finish = (resp: BridgeResponse<T>): void => {
      if (settled) return
      settled = true
      resolve(resp)
    }
    const timer = window.setTimeout(() => {
      finish({ ok: false, error: 'extension probe timed out' })
    }, PROBE_TIMEOUT_MS)
    try {
      chromeApi.runtime.sendMessage(extensionId, message, (response: BridgeResponse<T>) => {
        window.clearTimeout(timer)
        const lastErr = chromeApi.runtime.lastError
        if (lastErr) {
          finish({ ok: false, error: lastErr.message ?? 'no extension' })
          return
        }
        if (!response) {
          finish({ ok: false, error: 'no response' })
          return
        }
        finish(response)
      })
    } catch (err) {
      window.clearTimeout(timer)
      finish({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export function useExtensionAutoPair() {
  const config = useRuntimeConfig()
  const extensionId = (config.public.extensionId as string | undefined) ?? ''
  const serverUrl = config.public.serverUrl as string
  const { authFetch } = useAuthFetch()
  const supabaseUser = useSupabaseUser()

  const status = useState<PairStatus>('extension-auto-pair:status', () => 'unknown')

  async function pair(): Promise<void> {
    if (!import.meta.client) return
    console.info('polymux: pair() entered', { extensionId, hasUser: !!supabaseUser.value })
    if (!extensionId) {
      console.info('polymux: auto-pair disabled (EXTENSION_ID env var not set)')
      status.value = 'absent'
      return
    }
    const userId = supabaseUser.value?.id
    if (!userId) {
      console.info('polymux: pair() bailed — no user id on supabase ref')
      status.value = 'absent'
      return
    }

    // Skip work if we already paired in this tab.
    const cacheKey = sessionKey(userId, extensionId)
    if (window.sessionStorage.getItem(cacheKey)) {
      console.info('polymux: pair() short-circuit — sessionStorage cache hit', cacheKey)
      status.value = 'paired'
      return
    }

    console.info('polymux: probing extension via runtime.sendMessage', extensionId)
    const ping = await sendToExtension<ExtensionStatusSnapshot>(extensionId, { kind: 'ping' })
    console.info('polymux: probe result', ping)
    if (!ping.ok) {
      console.info(`polymux: extension probe failed — ${ping.error}. Is EXTENSION_ID correct and the extension loaded?`)
      status.value = 'absent'
      return
    }

    if (ping.result.state === 'connected') {
      console.info('polymux: extension already connected, no action needed')
      status.value = 'connected'
      window.sessionStorage.setItem(cacheKey, '1')
      return
    }

    console.info('polymux: minting pairing code via /extension/pair')
    let pairCode: string
    try {
      const resp = await authFetch<PairCodeResponse>('/extension/pair', { method: 'POST' })
      pairCode = resp.code
      console.info('polymux: minted code', pairCode)
    } catch (err) {
      console.warn('polymux: failed to mint extension pairing code', err)
      status.value = 'error'
      return
    }

    console.info('polymux: pushing pair_from_website to extension', { server_url: serverUrl })
    const push = await sendToExtension<ExtensionStatusSnapshot>(extensionId, {
      kind: 'pair_from_website',
      server_url: serverUrl,
      code: pairCode,
    })
    console.info('polymux: push result', push)
    if (!push.ok) {
      console.warn('polymux: extension rejected pairing push', push.error)
      status.value = 'error'
      return
    }

    console.info('polymux: extension paired successfully')
    status.value = 'paired'
    window.sessionStorage.setItem(cacheKey, '1')
  }

  function invalidate(): void {
    if (!import.meta.client) return
    const userId = supabaseUser.value?.id
    if (!userId || !extensionId) return
    window.sessionStorage.removeItem(sessionKey(userId, extensionId))
    status.value = 'unknown'
  }

  return { status, pair, invalidate }
}
