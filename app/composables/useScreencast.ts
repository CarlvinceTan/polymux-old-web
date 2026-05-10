import { ref, readonly, watch, onUnmounted } from 'vue'
import type { SessionHandle } from './auth/useSession'
import type { CursorPositionPayload, CursorState, PageNavigatedPayload } from './types'
import { NAVIGATION_FREEZE_MS } from './navigationTiming'

const decoder = new TextDecoder()

/**
 * Receives binary screencast frames from the session WebSocket and exposes
 * per-agent object URLs that can be bound to an <img> element.
 *
 * Binary frame format: [1 byte: ID length][N bytes: agent ID][rest: JPEG data]
 */
export function useScreencast(session: SessionHandle) {
  const frameUrls = ref<Map<string, string>>(new Map())
  // Per-agent cursor positions. Updates are forwarded as fast as midas
  // reports them — we let Vue's reactivity coalesce paints. Cleared when an
  // agent's screencast frame URL goes away (close / navigation reset).
  const cursorPositions = ref<Map<string, CursorState>>(new Map())

  function revokeAll() {
    for (const url of frameUrls.value.values()) {
      URL.revokeObjectURL(url)
    }
    frameUrls.value = new Map()
  }

  const seenAgents = new Set<string>()

  // Per-agent navigation freeze deadlines. While `now < deadline`, incoming
  // screencast frames are dropped so the previously-painted frame stays on
  // screen. This masks chromium's blank/partial-paint frames that arrive
  // between `Page.frameNavigated` (URL committed) and the new page's first
  // meaningful paint, so navigations feel like a clean old-page → new-page
  // swap instead of glitching through a white intermediate state.
  const freezeUntil = new Map<string, number>()

  function handleBinaryFrame(data: ArrayBuffer) {
    if (data.byteLength < 2) return

    const view = new Uint8Array(data)
    const idLen = view[0]!
    if (data.byteLength < 1 + idLen + 1) return

    const agentId = decoder.decode(view.subarray(1, 1 + idLen))

    const deadline = freezeUntil.get(agentId)
    if (deadline !== undefined) {
      if (Date.now() < deadline) return
      freezeUntil.delete(agentId)
    }

    const jpegBlob = new Blob([view.subarray(1 + idLen)], { type: 'image/jpeg' })
    const url = URL.createObjectURL(jpegBlob)

    if (!seenAgents.has(agentId)) {
      seenAgents.add(agentId)
      // eslint-disable-next-line no-console
      console.debug('[screencast] first frame for agent', agentId, 'bytes:', data.byteLength - 1 - idLen)
    }

    const prev = frameUrls.value.get(agentId)
    const next = new Map(frameUrls.value)
    next.set(agentId, url)
    frameUrls.value = next

    if (prev) URL.revokeObjectURL(prev)
  }

  function handlePageNavigated(p: PageNavigatedPayload) {
    if (!p.agent_id) return
    freezeUntil.set(p.agent_id, Date.now() + NAVIGATION_FREEZE_MS)
    // Drop the stale cursor on navigation — the new page might never see a
    // cursor event before its first paint, and a stranded arrow on the old
    // coordinates looks like a bug.
    if (cursorPositions.value.has(p.agent_id)) {
      const next = new Map(cursorPositions.value)
      next.delete(p.agent_id)
      cursorPositions.value = next
    }
  }

  function handleCursorPosition(p: CursorPositionPayload) {
    if (!p.agent_id || !p.vw || !p.vh) return
    const next = new Map(cursorPositions.value)
    next.set(p.agent_id, { x: p.x, y: p.y, vw: p.vw, vh: p.vh })
    cursorPositions.value = next
  }

  session.onBinary(handleBinaryFrame)
  session.on<PageNavigatedPayload>('page_navigated', handlePageNavigated)
  session.on<CursorPositionPayload>('cursor_position', handleCursorPosition)

  // Clear stale frames when the session resets (navigation to a different
  // session sets sessionState to null before the new session connects).
  watch(
    () => session.sessionState.value,
    (state) => {
      if (!state) {
        revokeAll()
        freezeUntil.clear()
        cursorPositions.value = new Map()
      }
    },
  )

  function cleanup() {
    session.offBinary(handleBinaryFrame)
    session.off('page_navigated', handlePageNavigated)
    session.off('cursor_position', handleCursorPosition)
    freezeUntil.clear()
    revokeAll()
    cursorPositions.value = new Map()
  }

  onUnmounted(cleanup)

  return {
    frameUrls: readonly(frameUrls),
    cursorPositions: readonly(cursorPositions),
    cleanup,
  }
}
