import type { Ref } from 'vue'
import type { ThinkingState, ViewportState } from '../types'

export interface ChatActivitySources {
  isStreaming: Ref<boolean>
  thinking: Ref<ThinkingState | null>
  waitingForAgent: Ref<boolean>
  viewports: Ref<readonly ViewportState[]>
}

/**
 * Unified chat activity signals for the side-panel spinner and the chat
 * three-dot working indicator. Keeps both surfaces in sync.
 */
export function useChatActivity(sources: ChatActivitySources) {
  const browserAgentsActive = computed(() =>
    sources.viewports.value.some(v => v.isWorking),
  )

  /** Any orchestrator / browser work in flight (spinner, running badge). */
  const chatActive = computed(() => {
    if (sources.isStreaming.value) return true
    if (sources.thinking.value != null) return true
    if (sources.waitingForAgent.value) return true
    if (browserAgentsActive.value) return true
    return false
  })

  /**
   * Three-dot indicator: visible during silent gaps inside a turn. Hidden
   * while partial agent text is actively streaming (the bubble is the signal).
   */
  const showWorkingIndicator = computed(() => {
    if (sources.isStreaming.value) return false
    if (sources.thinking.value != null) return true
    if (sources.waitingForAgent.value) return true
    if (browserAgentsActive.value) return true
    return false
  })

  return { browserAgentsActive, chatActive, showWorkingIndicator }
}
