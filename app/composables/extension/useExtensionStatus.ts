import { computed, readonly, ref } from 'vue'
import type { PolymuxExtensionAck } from '~/types/chrome-runtime'

/**
 * useExtensionStatus — reactive picker-facing view of whether the polymux
 * Chrome MV3 extension is installed and paired with this user.
 *
 * Three states:
 *   - 'unavailable' — no EXTENSION_ID env, no chrome.runtime, or the ping
 *     threw (extension not installed / not on externally_connectable list).
 *   - 'disconnected' — extension responded but its WS to the polymux server
 *     is not in the 'connected' state (token expired, server unreachable,
 *     auto-pair hasn't fired yet).
 *   - 'connected' — paired and ready to drive sub-agents.
 *
 * Pairing itself is owned by plugins/extension-pair.client.ts — this
 * composable only inspects state. State is module-scoped so every consumer
 * (picker popover, error toast, etc.) sees the same value.
 *
 * Single-flight ping with a short cache so the UI can call refresh() on
 * popover open without hammering the extension service worker.
 */

type ExtensionState = 'unavailable' | 'disconnected' | 'connected'

const state = ref<ExtensionState>('unavailable')
const version = ref<string>('')
const lastCheckedAt = ref<number>(0)
let inflight: Promise<void> | null = null
let authListenerInstalled = false

const PING_CACHE_MS = 4000
// Delay between a Supabase auth event and our re-ping. The auto-pair plugin
// re-runs on SIGNED_IN / TOKEN_REFRESHED and needs a round-trip + WS
// handshake to land before its status flips to 'connected'; pinging too
// eagerly would just record an out-of-date 'disconnected'.
const AUTH_REFRESH_DELAY_MS = 1500

function sendPing(extensionId: string): Promise<PolymuxExtensionAck> {
  return new Promise((resolve, reject) => {
    const chrome = window.chrome
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('chrome.runtime.sendMessage unavailable'))
      return
    }
    try {
      chrome.runtime.sendMessage(extensionId, { kind: 'ping' }, (response) => {
        const lastErr = chrome.runtime?.lastError
        if (lastErr) {
          reject(new Error(lastErr.message ?? 'extension unreachable'))
          return
        }
        resolve(response ?? { ok: false, error: 'no response' })
      })
    }
    catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

function readState(result: Record<string, unknown> | undefined): ExtensionState | null {
  const s = result?.state
  if (s === 'connected') return 'connected'
  if (s === 'disconnected' || s === 'connecting' || s === 'error') return 'disconnected'
  return null
}

function readVersion(result: Record<string, unknown> | undefined): string {
  const v = result?.version
  return typeof v === 'string' ? v : ''
}

export function useExtensionStatus() {
  const cfg = useRuntimeConfig()
  const extensionId = computed<string>(() => (cfg.public.extensionId as string | undefined) ?? '')

  async function refresh(force = false): Promise<void> {
    if (inflight) return inflight
    if (!force && lastCheckedAt.value && Date.now() - lastCheckedAt.value < PING_CACHE_MS) {
      return
    }
    inflight = (async () => {
      try {
        if (!import.meta.client) {
          state.value = 'unavailable'
          return
        }
        const id = extensionId.value
        if (!id || typeof window === 'undefined' || !window.chrome?.runtime?.sendMessage) {
          state.value = 'unavailable'
          return
        }
        const ping = await sendPing(id)
        if (!ping.ok) {
          state.value = 'unavailable'
          return
        }
        const v = readVersion(ping.result)
        if (v) version.value = v
        state.value = readState(ping.result) ?? 'disconnected'
      }
      catch {
        state.value = 'unavailable'
      }
      finally {
        lastCheckedAt.value = Date.now()
        inflight = null
      }
    })()
    return inflight
  }

  // Install the Supabase auth listener once per app lifetime. The auto-pair
  // plugin (plugins/extension-pair.client.ts) already re-pairs on the same
  // events; we follow up with a forced re-ping so the picker reflects the
  // post-pair state instead of whatever was cached before sign-in.
  if (import.meta.client && !authListenerInstalled) {
    authListenerInstalled = true
    try {
      const supabase = useSupabaseClient()
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setTimeout(() => {
            void refresh(true)
          }, AUTH_REFRESH_DELAY_MS)
        }
      })
    }
    catch {
      // useSupabaseClient throws outside a Nuxt context (e.g. SSR edge cases)
      // — silently skip; the menu-open refresh still keeps things current.
    }
  }

  if (import.meta.client && !lastCheckedAt.value && !inflight) {
    void refresh()
  }

  return {
    state: readonly(state),
    version: readonly(version),
    extensionId,
    refresh,
  }
}
