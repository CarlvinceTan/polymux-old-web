// Auto-pair the Polymux browser extension with this user's session.
//
// On sign-in (or app boot when already signed in) we ask the Nuxt server
// for a one-time pairing code, then push it to the extension via
// chrome.runtime.sendMessage. The extension uses the code to complete its
// WebSocket handshake against the Polymux server, persists the bearer
// token, and silently reconnects on subsequent visits.
//
// This is a best-effort flow: missing extension, missing EXTENSION_ID, or
// a closed extension service worker all surface as a console warn and a
// no-op — the user can still hand-pair via the popup's Advanced section.

import type { PolymuxExtensionAck } from '~/types/chrome-runtime'

interface PairResponse {
  code: string
  expires_at: string
  server_url: string
}

function sendToExtension(extensionId: string, message: unknown): Promise<PolymuxExtensionAck> {
  return new Promise((resolve, reject) => {
    const chrome = window.chrome
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('chrome.runtime.sendMessage unavailable'))
      return
    }
    try {
      chrome.runtime.sendMessage(extensionId, message, (response: PolymuxExtensionAck) => {
        const lastErr = chrome.runtime?.lastError
        if (lastErr) {
          reject(new Error(lastErr.message ?? 'extension unreachable'))
          return
        }
        resolve(response ?? { ok: false, error: 'no response' })
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

export default defineNuxtPlugin(async () => {
  const cfg = useRuntimeConfig()
  const extensionId = (cfg.public.extensionId as string | undefined) ?? ''
  if (!extensionId) return
  if (typeof window === 'undefined' || !window.chrome?.runtime?.sendMessage) return

  const supabase = useSupabaseClient()

  // attemptPair runs the full auto-pair flow once. We swallow errors so a
  // transient network blip during boot doesn't surface as an unhandled
  // rejection — the popup's Advanced fallback covers the recovery path.
  let inflight: Promise<void> | null = null
  async function attemptPair() {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const { isExtensionModeGloballyAllowed } = useMeFeatures()
        if (!isExtensionModeGloballyAllowed()) return

        // Probe the extension first. If it's not installed or not on this
        // build's externally_connectable list, sendMessage will throw and
        // we should bail before burning a pairing code.
        const ping = await sendToExtension(extensionId, { kind: 'ping' })
        if (!ping.ok) {
          console.warn('[polymux] extension ping failed', ping.error)
          return
        }
        if (ping.result && ping.result['state'] === 'connected') return

        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return

        const pair = await $fetch<PairResponse>('/api/extension/pair', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })

        const ack = await sendToExtension(extensionId, {
          kind: 'pair_from_website',
          server_url: pair.server_url,
          code: pair.code,
        })
        if (!ack.ok) {
          console.warn('[polymux] extension pair rejected', ack.error)
        }
      } catch (err) {
        // Keep this quiet — many users won't have the extension installed.
        if (import.meta.dev) console.warn('[polymux] extension auto-pair skipped', err)
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  // Pair on initial mount when already signed in.
  void attemptPair()

  // Re-pair on any subsequent sign-in. Sign-out is a no-op here; the
  // extension keeps its bearer token until the user hits Reset in the
  // popup or the server expires it.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      void attemptPair()
    }
  })
})
