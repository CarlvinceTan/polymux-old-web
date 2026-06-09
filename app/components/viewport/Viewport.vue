<script setup lang="ts">
import type { CursorState } from '~/composables/types'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  isLoading?: boolean
  url?: string
  agentName?: string
  currentAction?: string
  /** During a workflow run, the node this viewport's agent is executing.
   *  Rendered as a leading step chip so the viewport reflects the current
   *  node — kept separate from `currentAction` (live tool action). */
  currentNodeTitle?: string
  isWorking?: boolean
  isDone?: boolean
  /** Solid red status line — agent ended in failed/stopped/interrupted. */
  isFailed?: boolean
  /** URL bar (default on; set false to hide, e.g. chat thumbnails) */
  showBar?: boolean
  /** When false, status line shows only `agentName` (no `currentAction`) */
  showActionText?: boolean
  /** Tighter typography + status for horizontal thumbnail strips */
  thumbnail?: boolean
  /** Top-bar X icon — kills the browser agent. */
  onClose?: () => void
  /** Pin toggle — keeps this viewport at the top of the gallery. */
  isPinned?: boolean
  onTogglePin?: () => void
  /** Bottom-row run icon (idle state). Should allow the browser to continue
   *  what it was doing. */
  onRun?: () => void
  /** Bottom-row stop icon (running state, shown on hover over the spinner/arc).
   *  Stops the browser agent. */
  onStop?: () => void
  /** Which engine drives the running indicator. 'workflow' renders the
   *  gold progress arc (matches SidePanel); anything else renders the
   *  spinner. Null when nothing is running globally. */
  runningKind?: 'chat' | 'workflow' | null
  /** Object URL for the latest JPEG screencast frame */
  frameUrl?: string
  /** When true, no-frame state shows a centered spinner (WS reconnecting) instead of the skeleton. */
  reconnecting?: boolean
  /** Latest cursor position the driver reported for this agent. Rendered as
   *  an arrow overlay on top of the screencast image when showCursor is on. */
  cursor?: CursorState
  /** Render the cursor overlay. Gated by the user's "Display cursor" setting
   *  upstream — Viewport itself just paints when the flag is on and a
   *  position is available. */
  showCursor?: boolean
}>(), {
  isLoading: true,
  url: 'localhost:3001/instance_alpha/preview/session/very-long-url-to-demonstrate-truncation',
  agentName: 'SUBAGENT 01',
  currentAction: 'REFACTORING...',
  isWorking: true,
  isDone: false,
  isFailed: false,
  isPinned: false,
  currentNodeTitle: '',
  showBar: true,
  showActionText: true,
  thumbnail: false,
  reconnecting: false,
  showCursor: false,
  runningKind: null,
})

// Cursor overlay coordinates as percentages of the image's intrinsic
// dimensions. The viewport panel is locked at 16:9 and the <img> uses
// object-cover, so percentage-of-vw / percentage-of-vh maps essentially
// 1:1 onto the rendered image — the server clamps frames to within 1%
// of 16:9, so any sub-pixel crop is invisible and the cursor lands on
// the right spot. We clamp to [0, 100] so a brief out-of-range coord
// (rare, during a viewport-resize negotiation) doesn't escape the box.
const cursorStyle = computed(() => {
  if (!props.showCursor || !props.cursor || !props.frameUrl) return null
  const { x, y, vw, vh } = props.cursor
  if (!vw || !vh) return null
  const left = Math.max(0, Math.min(100, (x / vw) * 100))
  const top = Math.max(0, Math.min(100, (y / vh) * 100))
  return {
    left: `${left}%`,
    top: `${top}%`,
  }
})

function closeClick(e: Event) {
  e.stopPropagation()
  props.onClose?.()
}

function pinClick(e: Event) {
  e.stopPropagation()
  props.onTogglePin?.()
}

function runStopClick(e: Event) {
  e.stopPropagation()
  if (props.isWorking) props.onStop?.()
  else props.onRun?.()
}
</script>

<template>
  <div
    class="flex w-full max-w-full flex-none flex-col"
    :class="thumbnail ? 'gap-1.5 overflow-visible' : 'gap-2'"
  >
    <!-- Single panel wrapper: ghost-shadow paints the soft lift outside
         this box; rounded-lg + overflow-hidden clip the bar and preview
         to the rounded corners. Uses the border-less .ghost-shadow
         variant so the screenshare reads as a clean edge — the bar
         already frames the panel chrome on its own. -->
    <div
      class="ghost-shadow flex w-full max-w-full flex-col overflow-hidden rounded-lg bg-white"
    >
        <!-- Slim browser title bar: URL aligned left, close icon on the
             right. Expand-to-modal is no longer a dedicated icon — clicking
             anywhere on the panel itself triggers it (wired by the parent
             gallery card via onExpand), so the bar stays as a thin chrome
             strip. -->
        <div
          v-if="showBar"
          class="relative flex h-6 items-center gap-2 bg-[#e8e8e8] px-2.5"
        >
          <div class="flex min-w-0 flex-1 justify-start">
            <span
              class="max-w-full truncate font-mono text-body-md text-secondary"
            >
              {{ url }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-0.5 text-neutral-400">
            <button
              v-if="onTogglePin"
              type="button"
              class="flex size-4 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 ring-0 transition-colors"
              :class="isPinned ? 'text-gold hover:text-gold' : 'hover:text-neutral-700'"
              :aria-label="isPinned ? t('viewport.unpinBrowser') : t('viewport.pinBrowser')"
              :aria-pressed="isPinned"
              @click="pinClick"
            >
              <UIcon
                :name="isPinned ? 'i-ph-push-pin-fill' : 'i-ph-push-pin'"
                class="size-3"
              />
            </button>
            <button
              v-if="onClose"
              type="button"
              class="flex size-4 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 ring-0 transition-colors hover:text-red-600"
              :aria-label="t('viewport.closeBrowser')"
              @click="closeClick"
            >
              <UIcon name="i-heroicons-x-mark" class="size-3" />
            </button>
          </div>
        </div>

        <!-- Preview: fixed 16:9 to match the browser screencast ratio. -->
        <div
          class="relative w-full overflow-hidden bg-white transition-[box-shadow]"
          :class="isDone
            ? 'ring-2 ring-inset ring-emerald-400'
            : 'ring-1 ring-inset ring-transparent group-hover/gallery:ring-neutral-300'"
          style="aspect-ratio: 16 / 9"
        >
          <div
            v-if="!frameUrl && reconnecting"
            class="absolute inset-0 flex items-center justify-center"
            role="status"
            :aria-label="t('viewport.reconnecting')"
          >
            <svg
              class="animate-spin text-neutral-400"
              :class="thumbnail ? 'size-4' : 'size-8'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <!-- No-frame fallthrough: leave the preview area empty (parent's
               bg-white shows). Previously rendered a photo-icon glyph (or,
               earlier still, a pulsing-bar skeleton when isWorking), but both
               read as visual noise next to the URL bar + status row chrome.
               A plain canvas is the most consistent stand-in until the first
               screencast frame lands. -->
          <img
            v-if="frameUrl"
            :src="frameUrl"
            alt=""
            class="absolute inset-0 h-full w-full object-cover"
          >
          <!-- Driver cursor overlay. Anchored at the tip of the arrow (the
               default macOS-style cursor's hotspot is the top-left corner)
               via translate(-1px, -1px) — keeps the arrow tip on the
               reported (x, y) instead of the SVG's bounding box origin. The
               drop-shadow keeps the arrow visible against bright page
               backgrounds. pointer-events-none so it never eats clicks
               targeted at modal traffic-light buttons that overlap the
               preview area. -->
          <div
            v-if="cursorStyle"
            class="pointer-events-none absolute z-10 -translate-x-px -translate-y-px transition-[left,top] duration-75 ease-out"
            :style="cursorStyle"
            aria-hidden="true"
          >
            <svg
              :width="thumbnail ? 10 : 18"
              :height="thumbnail ? 10 : 18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style="filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));"
            >
              <path
                d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 19.7 L12 13.5 L18 13.5 Z"
                fill="white"
                stroke="black"
                stroke-width="1.4"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <slot />
        </div>
    </div>

    <!-- Below the rounded panel -->
    <div
      class="flex w-full items-center justify-between gap-2"
      :class="thumbnail ? 'px-0' : 'px-1'"
    >
      <div
        class="flex min-w-0 flex-1 items-center font-mono tracking-wide"
        :class="thumbnail ? 'gap-1 text-2xs text-neutral-600 sm:text-caption' : 'gap-3 text-body-md'"
      >
        <div class="flex min-w-0 items-baseline gap-1">
          <!-- Workflow step chip — which node this viewport is currently
               executing. Shown only during a workflow run (currentNodeTitle
               set); truncates so it never crowds out the agent label. -->
          <span
            v-if="currentNodeTitle"
            class="max-w-[45%] shrink-0 truncate self-center rounded bg-neutral-100 px-1 py-px font-medium normal-case text-neutral-600"
            :class="thumbnail ? 'text-2xs' : 'text-2xs sm:text-caption'"
            :title="currentNodeTitle"
          >{{ currentNodeTitle }}</span>
          <span
            class="shrink-0 truncate font-bold uppercase"
            :class="thumbnail ? 'text-neutral-600' : 'text-secondary'"
          >{{ agentName }}<template v-if="showActionText">:</template></span>
          <span
            v-if="showActionText"
            class="min-w-0 truncate font-medium uppercase"
            :class="thumbnail ? 'text-neutral-500' : 'text-secondary/80'"
          >{{ currentAction }}</span>
        </div>
      </div>

      <!-- Run / stop indicator. Replaces the dot-matrix StatusLine so each
           card carries an actionable control: while the agent is working
           we show either a workflow_run progress arc (gold, matches the
           SidePanel running indicator) or a generic chat-driven spinner.
           Hovering swaps the indicator for a stop icon; clicking calls
           onStop. When idle the button shows a play glyph and clicking
           calls onRun. -->
      <button
        type="button"
        class="group/run relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 ring-0 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        :class="thumbnail ? 'size-4' : 'size-5'"
        :disabled="isWorking ? !onStop : !onRun"
        :aria-label="isWorking ? t('viewport.stopAgent') : t('viewport.runAgent')"
        @click="runStopClick"
      >
        <template v-if="isWorking">
          <span class="absolute inset-0 flex items-center justify-center group-hover/run:hidden">
            <svg
              v-if="runningKind === 'workflow'"
              class="-rotate-90"
              :class="thumbnail ? 'size-3' : 'size-3.5'"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="6" fill="none" stroke="var(--color-gold)" stroke-opacity="0.25" stroke-width="2" />
              <circle
                class="wf-progress-arc"
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="var(--color-gold)"
                stroke-width="2"
                stroke-linecap="butt"
                pathLength="100"
                stroke-dasharray="100 100"
              />
            </svg>
            <span
              v-else
              class="animate-spin rounded-full border-2 border-gold/25 border-t-gold"
              :class="thumbnail ? 'size-3' : 'size-3.5'"
              aria-hidden="true"
            />
          </span>
          <UIcon
            name="i-heroicons-stop-20-solid"
            class="hidden text-red-600 group-hover/run:block"
            :class="thumbnail ? 'size-3' : 'size-3.5'"
          />
        </template>
        <UIcon
          v-else
          name="i-heroicons-play-20-solid"
          class="text-emerald-600 group-hover/run:text-emerald-500"
          :class="thumbnail ? 'size-3' : 'size-3.5'"
        />
      </button>
    </div>
  </div>
</template>
