<script setup lang="ts">
import type { CursorState, ViewportState } from '~/composables/types'

defineOptions({ inheritAttrs: false })

const { t } = useI18n()

const props = defineProps<{
  viewportList: ViewportState[]
  frameUrls?: Map<string, string>
  cursorPositions?: Map<string, CursorState>
  showCursor?: boolean
  browserAgentCap?: number
  reconnecting?: boolean
}>()

const emit = defineEmits<{
  closeViewport: [agentId: string]
  spawnBrowserAgent: []
  stopAgent: [agentId: string]
  runAgent: [agentId: string]
}>()

const expandedAgentId = ref<string | null>(null)
const expandedViewport = computed(() => {
  if (!expandedAgentId.value) return null
  return props.viewportList.find(v => v.agentId === expandedAgentId.value) ?? null
})
const expandedFrameUrl = computed(() => {
  const vp = expandedViewport.value
  return vp ? props.frameUrls?.get(vp.agentId) : undefined
})

// Running-kind classifier — drives the per-viewport indicator. 'workflow'
// kicks in only while the workflow_run engine is actively executing the
// persisted node graph; everything else (orchestrator agents working in
// service of chat) falls through to 'chat'. Matches the SidePanel
// running-indicator contract so the two surfaces stay visually aligned.
const workflowRun = inject<{ runStatus: Ref<string | null> } | null>('workflow-run', null)
const runningKind = computed<'chat' | 'workflow' | null>(() => {
  const status = workflowRun?.runStatus.value
  if (status === 'running' || status === 'pending') return 'workflow'
  return 'chat'
})

const agentCount = computed(() => props.viewportList.length)
const agentCap = computed(() => props.browserAgentCap ?? 0)
const isAtCap = computed(() => agentCount.value >= agentCap.value && agentCap.value > 0)

// JS-driven hover state for the zoom pill. CSS :hover bubbling proved
// unreliable here — the bottom of the pill never lit up, likely because
// the slider thumb's pseudo-element doesn't propagate :hover to the
// parent consistently across browsers. Tracking via @mouseenter on the
// outer strip is bulletproof and lets us widen the hit zone trivially.
const zoomHovered = ref(false)
const zoomFocused = ref(false)

// Columns in the grid. Lower = bigger viewports = fewer per row, higher =
// smaller and more per row. Cards drop their browser chrome (URL bar with
// expand + close affordances) once the column count crosses
// GALLERY_BAR_THRESHOLD so a tight grid still feels readable instead of
// squishing the bar across half-pixel widths.
const GALLERY_MIN_COLS = 1
const GALLERY_MAX_COLS = 8
// The URL bar only stays legible when each card has the room to show roughly
// half the gallery width per card. Anything denser (3+ columns) falls back to
// the bar-less thumbnail rendering even though a URL bar would still
// technically fit, because the user can't usefully read it at that scale.
const GALLERY_BAR_THRESHOLD = 2
// Start zoomed out — initialize at the max column count and let the
// effectiveMaxCols watcher clamp down to whatever the gallery can fit. This
// gives the user the most-viewports-on-screen-at-once view by default;
// they can zoom in (fewer columns, bigger cards) via the slider.
const galleryCols = ref(GALLERY_MAX_COLS)

// Cap the slider at the smallest column count that already shows every
// viewport on screen at once. Past that point zooming out further only
// shrinks the cards — they were all visible already, so there's nothing to
// gain. The cap is recomputed when the gallery resizes or the viewport list
// changes; it can only shrink galleryCols (never expand it) so the user
// keeps wherever they last parked the zoom when new agents arrive.
const galleryContainer = ref<HTMLElement | null>(null)
const gallerySize = ref({ width: 0, height: 0 })

watch(galleryContainer, (el, _old, onCleanup) => {
  if (!el) {
    gallerySize.value = { width: 0, height: 0 }
    return
  }
  const measure = () => {
    gallerySize.value = { width: el.clientWidth, height: el.clientHeight }
  }
  measure()
  const obs = new ResizeObserver(measure)
  obs.observe(el)
  onCleanup(() => obs.disconnect())
})

// Per-card height budget (px). Tracks Viewport.vue's structure: optional URL
// bar + 16:9 preview + label/status row + per-cell click padding. Compact
// (bar-less) cards are noticeably shorter, so the budget swaps based on
// whether the bar is showing at the candidate column count.
const COMPACT_CHROME_PX = 36
const FULL_CHROME_PX = 70
const GRID_GAP_PX = 12
const GRID_PAD_X_PX = 32
const GRID_PAD_Y_PX = 28

function gridHeightAt(cols: number): number {
  const n = props.viewportList.length
  const w = gallerySize.value.width
  if (n === 0 || w <= 0 || cols <= 0) return 0
  const cardWidth = (w - GRID_PAD_X_PX - GRID_GAP_PX * (cols - 1)) / cols
  if (cardWidth <= 0) return Infinity
  const chrome = cols > GALLERY_BAR_THRESHOLD ? COMPACT_CHROME_PX : FULL_CHROME_PX
  const cardHeight = cardWidth * (9 / 16) + chrome
  const rows = Math.ceil(n / cols)
  return rows * cardHeight + Math.max(0, rows - 1) * GRID_GAP_PX + GRID_PAD_Y_PX
}

const effectiveMaxCols = computed(() => {
  const n = props.viewportList.length
  if (n === 0) return GALLERY_MIN_COLS
  const cap = Math.min(GALLERY_MAX_COLS, n)
  const h = gallerySize.value.height
  // No measurement yet (gallery hasn't mounted): fall back to the
  // viewport-count cap so the slider is usable from the first paint.
  if (h <= 0) return cap
  for (let c = 1; c <= cap; c++) {
    if (gridHeightAt(c) <= h) return c
  }
  return cap
})

watch(effectiveMaxCols, (max) => {
  if (galleryCols.value > max) galleryCols.value = max
}, { immediate: true })
// Slider's continuous value. The thumb glides freely under the user's finger
// even though the underlying galleryCols only moves in integer steps; the
// translation happens via Math.round on the watcher below. Inverted vs cols
// so dragging right = zoom IN (fewer cols, bigger cards) and dragging left =
// zoom OUT (more cols, smaller cards) — matches the minus/plus icon flank.
const sliderDrag = ref<number>(GALLERY_MIN_COLS)

// drag → galleryCols. Snaps to the nearest integer column count whenever the
// user moves the slider. Only writes when the snapped value actually differs
// to keep the watch loop quiet.
watch(sliderDrag, (drag) => {
  const max = effectiveMaxCols.value
  const inverted = max + GALLERY_MIN_COLS - drag
  const cols = Math.max(GALLERY_MIN_COLS, Math.min(max, Math.round(inverted)))
  if (galleryCols.value !== cols) galleryCols.value = cols
})

// galleryCols → drag. Sync the thumb only when an external change to
// galleryCols (clamping after a viewport closes, max recomputed on resize)
// would land on a different integer than where the thumb is currently
// resting; otherwise leave the analogue position alone so a mid-drag value
// like 2.4 doesn't snap to 2 when galleryCols stays at 4.
watch([galleryCols, effectiveMaxCols], ([cols, max]) => {
  const inverted = max + GALLERY_MIN_COLS - sliderDrag.value
  const dragSnapped = Math.max(GALLERY_MIN_COLS, Math.min(max, Math.round(inverted)))
  if (dragSnapped !== cols) {
    sliderDrag.value = max + GALLERY_MIN_COLS - cols
  }
}, { immediate: true })
const showBarInGallery = computed(() => galleryCols.value <= GALLERY_BAR_THRESHOLD)
const compactInGallery = computed(() => galleryCols.value > GALLERY_BAR_THRESHOLD)

const toast = useAppToast()

function onSpawnOrWarn() {
  if (isAtCap.value) {
    toast.show(t('browser.agentCapReached'), 'warning')
    return
  }
  emit('spawnBrowserAgent')
}

function onClose(agentId: string) {
  if (expandedAgentId.value === agentId) expandedAgentId.value = null
  emit('closeViewport', agentId)
}

function onExpand(agentId: string) {
  expandedAgentId.value = expandedAgentId.value === agentId ? null : agentId
}

function onStop(agentId: string) {
  emit('stopAgent', agentId)
}

function onRun(agentId: string) {
  emit('runAgent', agentId)
}

// Per-viewport handler binding. We pre-bind agentId here so the Viewport
// component receives stable closures via its onClose / onStop / onRun
// props. Expansion is driven from the gallery card's own @click (clicking
// anywhere on the panel pops the modal) rather than a dedicated icon, so
// onExpand is not threaded through Viewport.
function viewportHandlers(agentId: string) {
  return {
    onClose: () => onClose(agentId),
    onStop: () => onStop(agentId),
    onRun: () => onRun(agentId),
  }
}
</script>

<template>
  <div
    v-bind="$attrs"
    class="relative flex min-h-0 w-full min-w-0 flex-1 flex-col md:w-auto md:min-h-0 md:min-w-0"
  >
    <!-- Gallery: scrollable grid of every viewport, column count driven
         by the zoom slider. Compact rendering (no URL bar)
         kicks in once we exceed GALLERY_BAR_THRESHOLD columns so the chrome
         doesn't get crushed at small sizes. The container ref feeds the
         ResizeObserver that recomputes effectiveMaxCols based on actual
         visible space. -->
    <div
      ref="galleryContainer"
      class="scrollbar-hide flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain"
    >
      <!-- Empty state: surface the add-browser-agent affordance directly so the
           viewport layout always offers a single, obvious call to action. The
           in-grid + tile (rendered below alongside existing viewports) is
           reused here at a centered, bounded size so the empty state IS the
           action rather than a passive placeholder pointing at one. -->
      <div
        v-if="viewportList.length === 0"
        class="flex flex-1 flex-col items-center justify-center px-6 py-10"
      >
        <button
          type="button"
          class="group/add flex w-full max-w-md cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 bg-transparent p-1.5 text-left outline-none ring-0 transition-colors hover:bg-neutral-950/4 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
          :class="isAtCap ? 'opacity-40' : ''"
          :aria-label="t('browser.addAgent')"
          @click="onSpawnOrWarn"
        >
          <div class="flex w-full max-w-full flex-col overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
            <div class="relative w-full overflow-hidden bg-neutral-50" style="aspect-ratio: 16 / 9">
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                <UIcon name="i-heroicons-plus-20-solid" class="size-8 text-neutral-400 transition-colors group-hover/add:text-neutral-600" />
                <span class="text-sm text-neutral-400 transition-colors group-hover/add:text-neutral-600">{{ t('browser.addAgent') }}</span>
                <span
                  v-if="agentCap > 0"
                  class="text-xs tabular-nums text-neutral-400 transition-colors group-hover/add:text-neutral-600"
                >{{ t('browser.browsersCount', { active: agentCount, cap: agentCap }) }}</span>
              </div>
            </div>
          </div>
        </button>
      </div>
      <div
        v-else
        class="grid gap-3 px-4 pb-4 pt-3"
        :style="{ gridTemplateColumns: `repeat(${galleryCols}, minmax(0, 1fr))` }"
      >
        <div
          v-for="vp in viewportList"
          :key="vp.agentId"
          role="button"
          tabindex="0"
          class="group/gallery relative flex min-w-0 cursor-pointer flex-col items-stretch overflow-visible rounded-lg outline-none ring-0 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
          :aria-label="t('viewport.expandPreview')"
          @click="onExpand(vp.agentId)"
          @keydown.enter="onExpand(vp.agentId)"
          @keydown.space.prevent="onExpand(vp.agentId)"
        >
          <Viewport
            v-bind="{ ...vp, ...viewportHandlers(vp.agentId), frameUrl: frameUrls?.get(vp.agentId), cursor: cursorPositions?.get(vp.agentId), showCursor }"
            :thumbnail="compactInGallery"
            :show-bar="showBarInGallery"
            :show-action-text="!compactInGallery"
            :reconnecting="reconnecting"
            :running-kind="runningKind"
            class="max-w-full min-w-0 w-full select-none"
          />
          <!-- Overlay close button — only shown in the bar-less thumbnail
               rendering, since the in-bar X disappears with the bar. Keeps a
               way out for users when the gallery is zoomed past the bar
               threshold. -->
          <button
            v-if="!showBarInGallery"
            type="button"
            class="absolute right-2 top-2 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-xs leading-none text-neutral-400 opacity-0 ring-0 transition-colors hover:text-neutral-700 group-hover/gallery:opacity-100"
            :aria-label="t('browser.closeAgent')"
            @click.stop="onClose(vp.agentId)"
          >
            <UIcon name="i-heroicons-x-mark" class="size-3" />
          </button>
        </div>

        <button
          type="button"
          class="group/add flex min-w-0 cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 bg-transparent p-1.5 text-left outline-none ring-0 transition-colors hover:bg-neutral-950/4 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
          :class="isAtCap ? 'opacity-40' : ''"
          :aria-label="t('browser.addAgent')"
          @click="onSpawnOrWarn"
        >
          <div class="flex w-full max-w-full flex-col overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
            <div class="relative w-full overflow-hidden bg-neutral-50" style="aspect-ratio: 16 / 9">
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <UIcon name="i-heroicons-plus-20-solid" class="size-6 text-neutral-400 transition-colors group-hover/add:text-neutral-600" />
                <span
                  v-if="agentCap > 0"
                  class="text-xs tabular-nums text-neutral-400 transition-colors group-hover/add:text-neutral-600"
                >{{ t('browser.browsersCount', { active: agentCount, cap: agentCap }) }}</span>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Gallery zoom slider — bottom-center, absolutely positioned so it
         overlays without reserving layout space. Hover state is tracked
         in JS on the outer strip (full-width, tall trigger zone) so we
         don't depend on CSS :hover bubbling up through the slider thumb
         pseudo-element. The gallery parent's pb-32 keeps this clear of the
         floating prompt input below. -->
    <div
      v-if="effectiveMaxCols > GALLERY_MIN_COLS"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pt-3 pb-2"
    >
      <div
        class="pointer-events-auto flex items-center gap-2 rounded-md bg-white/95 px-2 py-1 text-neutral-700 shadow-sm ring-1 ring-neutral-200 backdrop-blur-sm transition-opacity"
        :class="(zoomHovered || zoomFocused) ? 'opacity-100' : 'opacity-30'"
        @mouseenter="zoomHovered = true"
        @mouseleave="zoomHovered = false"
        @focusin="zoomFocused = true"
        @focusout="zoomFocused = false"
      >
        <UIcon name="i-heroicons-magnifying-glass-minus-20-solid" class="size-3.5" />
        <input
          v-model.number="sliderDrag"
          type="range"
          :min="GALLERY_MIN_COLS"
          :max="effectiveMaxCols"
          step="0.01"
          class="gallery-zoom h-1 w-24 cursor-pointer appearance-none bg-neutral-300"
          :aria-label="t('browser.galleryZoom')"
          @mouseup="($event.currentTarget as HTMLElement).blur()"
        >
        <UIcon name="i-heroicons-magnifying-glass-plus-20-solid" class="size-3.5 -scale-x-100" />
      </div>
    </div>
  </div>

  <ViewportModal
    v-if="expandedViewport"
    :viewport="expandedViewport"
    :frame-url="expandedFrameUrl"
    :cursor="cursorPositions?.get(expandedViewport.agentId)"
    :show-cursor="showCursor"
    @close="expandedAgentId = null"
  />
</template>

<style scoped>
/* Native range styling: thin neutral track, square accent thumb that matches
   the gallery's mono/Zed-IDE-flavoured aesthetic instead of the chunky default. */
.gallery-zoom::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: rgb(38 38 38);
  cursor: pointer;
  border: 0;
}
.gallery-zoom::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: rgb(38 38 38);
  cursor: pointer;
  border: 0;
}
.gallery-zoom:hover::-webkit-slider-thumb {
  background: rgb(23 23 23);
}
.gallery-zoom:hover::-moz-range-thumb {
  background: rgb(23 23 23);
}
</style>
