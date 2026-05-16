import { onUnmounted, readonly, ref } from 'vue'
import type { Ref } from 'vue'
import type { SessionHandle } from '../workflows/useWorkflowSession'
import type {
  BrowserSpawnedPayload,
  BrowserClosedPayload,
  ExtensionReadyPayload,
  PageNavigatedPayload,
  SessionStatePayload,
} from '../types'
import type { PolymuxChromePort } from '~/types/chrome-runtime'
import { NAVIGATION_FREEZE_MS } from './navigationTiming'

/**
 * useExtensionScreencast — chrome.runtime.connect consumer for the polymux
 * MV3 extension's screencast port.
 *
 * The server emits `extension_ready` after a successful spawn in extension
 * mode, carrying a short-lived `port_token` scoped to one sub-agent's tab.
 * We trade that token for a `chrome.runtime.Port` keyed `screencast`,
 * authenticate, and receive a stream of base64-encoded JPEG frames. Each
 * frame is decoded into an object URL and published in the same
 * `agent_id → URL` map shape that `useScreencast` exposes for the
 * WS-binary path, so the workflow page can merge the two without any
 * mode-aware branching in consumers (Viewport / ViewportGallery).
 *
 * Reload recovery: port_tokens are single-use, but the server now re-mints
 * one per running extension-mode agent on every session WS connect (see
 * `reissueExtensionPortTokens` in session_ws.go) and replays them as
 * extension_ready frames. So a page reload simply receives a fresh batch
 * of extension_ready events, our `openPort` teardown logic closes any
 * stale ports, and the new ports re-authenticate transparently — no user
 * action required.
 */
export function useExtensionScreencast(session: SessionHandle, extensionId: Ref<string>) {
  const frameUrls = ref<Map<string, string>>(new Map())

  // session_name → agent_id reverse lookup. The frame envelope carries only
  // session_name; the rest of the UI keys by agent_id. Populated from
  // browser_spawned events (live spawns) and from the session_state echo on
  // reconnect (so previously-known agents still resolve before any new
  // spawn fires).
  const sessionToAgent = new Map<string, string>()

  // session_name → active port. Used so subsequent extension_ready frames
  // for the same session (e.g. a re-spawn or token refresh) tear down the
  // stale port before opening a new one.
  const ports = new Map<string, PolymuxChromePort>()

  // Navigation freeze deadlines, mirroring useScreencast — covers chromium's
  // blank-paint window between Page.frameNavigated and the first meaningful
  // paint of the new page.
  const freezeUntil = new Map<string, number>()

  function publishFrame(agentId: string, blob: Blob) {
    const url = URL.createObjectURL(blob)
    const prev = frameUrls.value.get(agentId)
    const next = new Map(frameUrls.value)
    next.set(agentId, url)
    frameUrls.value = next
    if (prev) URL.revokeObjectURL(prev)
  }

  function decodeBase64(b64: string): Uint8Array {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }

  function teardownPort(sessionName: string) {
    const port = ports.get(sessionName)
    if (!port) return
    ports.delete(sessionName)
    try {
      port.disconnect()
    } catch {
      /* ignore */
    }
  }

  function teardownAllPorts() {
    for (const sessionName of [...ports.keys()]) {
      teardownPort(sessionName)
    }
  }

  function revokeAll() {
    for (const url of frameUrls.value.values()) {
      URL.revokeObjectURL(url)
    }
    frameUrls.value = new Map()
  }

  function openPort(payload: ExtensionReadyPayload) {
    const id = extensionId.value
    if (!id) return
    const { session_name: sessionName, port_token: portToken } = payload
    if (!sessionName || !portToken) return
    const connectFn = window.chrome?.runtime?.connect
    if (typeof window === 'undefined' || !connectFn) return

    teardownPort(sessionName)

    let port: PolymuxChromePort
    try {
      port = connectFn(id, { name: 'screencast' })
    }
    catch (err) {
      console.warn('[ext-screencast] chrome.runtime.connect failed', err)
      return
    }
    ports.set(sessionName, port)

    port.onMessage.addListener((raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return
      const msg = raw as Record<string, unknown>
      if (msg.kind === 'frame' && typeof msg.dataB64 === 'string' && typeof msg.frameId === 'string') {
        const incomingSession = typeof msg.sessionName === 'string' ? msg.sessionName : sessionName
        const agentId = sessionToAgent.get(incomingSession)
        port.postMessage({ kind: 'ack', frameId: msg.frameId })
        if (!agentId) return
        const deadline = freezeUntil.get(agentId)
        if (deadline !== undefined) {
          if (Date.now() < deadline) return
          freezeUntil.delete(agentId)
        }
        try {
          const bytes = decodeBase64(msg.dataB64 as string)
          // bytes.buffer is ArrayBuffer; passing the Uint8Array directly
          // trips TypeScript's new strictness around ArrayBufferLike vs
          // ArrayBuffer in lib.dom.d.ts for Blob constructor parts.
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/jpeg' })
          publishFrame(agentId, blob)
        }
        catch (err) {
          console.warn('[ext-screencast] frame decode failed', err)
        }
        return
      }
      if (msg.kind === 'error') {
        console.warn('[ext-screencast] port error', msg.message)
      }
    })

    port.onDisconnect.addListener(() => {
      ports.delete(sessionName)
      if (window.chrome?.runtime?.lastError) {
        console.warn('[ext-screencast] port disconnected', window.chrome.runtime.lastError.message)
      }
    })

    try {
      port.postMessage({ kind: 'auth', portToken })
    }
    catch (err) {
      console.warn('[ext-screencast] auth post failed', err)
      teardownPort(sessionName)
    }
  }

  function handleExtensionReady(p: ExtensionReadyPayload) {
    if (!p.session_name || !p.port_token) {
      // Connect-time announcement carrying only extension_id — nothing to
      // wire yet, but we record it so future frames can resolve once a
      // browser_spawned brings in the agent_id mapping.
      return
    }
    openPort(p)
  }

  function handleBrowserSpawned(p: BrowserSpawnedPayload) {
    if (!p.session_name) return
    sessionToAgent.set(p.session_name, p.agent_id)
  }

  function handleSessionState(p: SessionStatePayload) {
    for (const a of p.browser_agents ?? []) {
      if (a.session_name) sessionToAgent.set(a.session_name, a.agent_id)
    }
  }

  function handleBrowserClosed(p: BrowserClosedPayload) {
    // The agent is gone — drop any stale session-name mapping and revoke
    // its last frame so the gallery doesn't show a frozen image.
    for (const [sessionName, agentId] of sessionToAgent.entries()) {
      if (agentId === p.agent_id) {
        sessionToAgent.delete(sessionName)
        teardownPort(sessionName)
        break
      }
    }
    const prev = frameUrls.value.get(p.agent_id)
    if (prev) {
      const next = new Map(frameUrls.value)
      next.delete(p.agent_id)
      frameUrls.value = next
      URL.revokeObjectURL(prev)
    }
    freezeUntil.delete(p.agent_id)
  }

  function handlePageNavigated(p: PageNavigatedPayload) {
    if (!p.agent_id) return
    freezeUntil.set(p.agent_id, Date.now() + NAVIGATION_FREEZE_MS)
  }

  session.on<ExtensionReadyPayload>('extension_ready', handleExtensionReady)
  session.on<BrowserSpawnedPayload>('browser_spawned', handleBrowserSpawned)
  session.on<SessionStatePayload>('session_state', handleSessionState)
  session.on<BrowserClosedPayload>('browser_closed', handleBrowserClosed)
  session.on<PageNavigatedPayload>('page_navigated', handlePageNavigated)

  function cleanup() {
    session.off('extension_ready', handleExtensionReady)
    session.off('browser_spawned', handleBrowserSpawned)
    session.off('session_state', handleSessionState)
    session.off('browser_closed', handleBrowserClosed)
    session.off('page_navigated', handlePageNavigated)
    teardownAllPorts()
    freezeUntil.clear()
    sessionToAgent.clear()
    revokeAll()
  }

  onUnmounted(cleanup)

  return {
    frameUrls: readonly(frameUrls),
    cleanup,
  }
}

export type ExtensionScreencastHandle = ReturnType<typeof useExtensionScreencast>
