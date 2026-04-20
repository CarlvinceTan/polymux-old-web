import { ref, readonly, watch, onUnmounted } from 'vue'
import type { SessionHandle } from './useSession'

const decoder = new TextDecoder()

/**
 * Receives binary screencast frames from the session WebSocket and exposes
 * per-agent object URLs that can be bound to an <img> element.
 *
 * Binary frame format: [1 byte: ID length][N bytes: agent ID][rest: JPEG data]
 */
export function useScreencast(session: SessionHandle) {
  const frameUrls = ref<Map<string, string>>(new Map())

  function revokeAll() {
    for (const url of frameUrls.value.values()) {
      URL.revokeObjectURL(url)
    }
    frameUrls.value = new Map()
  }

  function handleBinaryFrame(data: ArrayBuffer) {
    if (data.byteLength < 2) return

    const view = new Uint8Array(data)
    const idLen = view[0]!
    if (data.byteLength < 1 + idLen + 1) return

    const agentId = decoder.decode(view.subarray(1, 1 + idLen))
    const jpegBlob = new Blob([view.subarray(1 + idLen)], { type: 'image/jpeg' })
    const url = URL.createObjectURL(jpegBlob)

    const prev = frameUrls.value.get(agentId)
    const next = new Map(frameUrls.value)
    next.set(agentId, url)
    frameUrls.value = next

    if (prev) URL.revokeObjectURL(prev)
  }

  session.onBinary(handleBinaryFrame)

  // Clear stale frames when the session resets (navigation to a different
  // session sets sessionState to null before the new session connects).
  watch(
    () => session.sessionState.value,
    (state) => {
      if (!state) revokeAll()
    },
  )

  function cleanup() {
    session.offBinary(handleBinaryFrame)
    revokeAll()
  }

  onUnmounted(cleanup)

  return {
    frameUrls: readonly(frameUrls),
    cleanup,
  }
}
