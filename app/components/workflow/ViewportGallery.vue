<script setup lang="ts">
import { useI18n } from '#imports'
import type { CursorState, ViewportState } from '~/composables/types'
import { promptUpgrade } from '~/composables/account/useUpgradePlanModal'

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
  togglePinViewport: [agentId: string]
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
// Persisted zoom preference. Initial value defaults to the max column count
// (most zoomed out — most viewports on screen), but if the user has previously
// set a zoom this session/profile, restore it so navigating away and back
// doesn't reset the slider. effectiveMaxCols still clamps the live `galleryCols`
// post-mount when the gallery is too small for the saved value; the saved
// preference itself is only overwritten on explicit user input (slider drag),
// not by automatic clamping, so a transient resize or empty state doesn't
// downgrade the user's stored zoom.
const GALLERY_COLS_STORAGE_KEY = 'polymux_viewport_gallery_cols'

function loadSavedGalleryCols(): number {
  if (!import.meta.client) return GALLERY_MAX_COLS
  try {
    const raw = localStorage.getItem(GALLERY_COLS_STORAGE_KEY)
    if (!raw) return GALLERY_MAX_COLS
    const parsed = Number.parseInt(raw, 10)
    if (Number.isNaN(parsed)) return GALLERY_MAX_COLS
    return Math.max(GALLERY_MIN_COLS, Math.min(GALLERY_MAX_COLS, parsed))
  }
  catch {
    return GALLERY_MAX_COLS
  }
}

function persistGalleryCols(cols: number) {
  if (!import.meta.client) return
  try {
    localStorage.setItem(GALLERY_COLS_STORAGE_KEY, String(cols))
  }
  catch {}
}

// `savedZoom` is the user's intended zoom — only changes on explicit slider
// drag (and persists to localStorage). `galleryCols` is the live, clamped
// value actually rendered; it's recomputed from savedZoom whenever the room
// available (effectiveMaxCols) changes, so growing the gallery back out
// restores the user's preferred zoom instead of leaving it stuck at the
// previously-clamped value.
const savedZoom = ref(loadSavedGalleryCols())
const galleryCols = ref(savedZoom.value)

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

// Live cols always equals the saved preference, clamped to the current room.
// When the room grows (viewports arrive, window resizes back up), galleryCols
// snaps back toward savedZoom; when it shrinks, galleryCols clamps down but
// savedZoom stays intact for restoration later.
watch([savedZoom, effectiveMaxCols], ([saved, max]) => {
  const clamped = Math.max(GALLERY_MIN_COLS, Math.min(max, saved))
  if (galleryCols.value !== clamped) galleryCols.value = clamped
}, { immediate: true })
// Slider's continuous value. The thumb glides freely under the user's finger
// even though the underlying galleryCols only moves in integer steps; the
// translation happens via Math.round on the watcher below. Inverted vs cols
// so dragging right = zoom IN (fewer cols, bigger cards) and dragging left =
// zoom OUT (more cols, smaller cards) — matches the minus/plus icon flank.
const sliderDrag = ref<number>(GALLERY_MIN_COLS)

// drag → galleryCols. Snaps to the nearest integer column count whenever the
// user moves the slider. Only writes when the snapped value actually differs
// to keep the watch loop quiet. This is the user-intent path, so persist the
// chosen zoom here rather than from a generic `galleryCols` watcher — the
// effectiveMaxCols clamp watcher also writes to `galleryCols` and we don't
// want a transient clamp (empty viewport list, briefly-resized window) to
// silently downgrade the user's saved preference.
watch(sliderDrag, (drag) => {
  const max = effectiveMaxCols.value
  const inverted = max + GALLERY_MIN_COLS - drag
  const cols = Math.max(GALLERY_MIN_COLS, Math.min(max, Math.round(inverted)))
  if (galleryCols.value !== cols) {
    galleryCols.value = cols
    savedZoom.value = cols
    persistGalleryCols(cols)
  }
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

function onSpawnOrWarn() {
  if (isAtCap.value) {
    promptUpgrade(
      { reason: 'browser_agent_limit', cap: agentCap.value },
      { message: t('browser.agentCapReached') },
    )
    return
  }
  emit('spawnBrowserAgent')
}

function onClose(agentId: string) {
  if (expandedAgentId.value === agentId) expandedAgentId.value = null
  emit('closeViewport', agentId)
}

function onTogglePin(agentId: string) {
  emit('togglePinViewport', agentId)
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
    onTogglePin: () => onTogglePin(agentId),
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
          style="container-type: inline-size"
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
          <!-- Overlay pin + close — only shown in the bar-less thumbnail
               rendering, since the in-bar controls disappear with the bar.
               Keeps a way out for users when the gallery is zoomed past the bar
               threshold. Buttons stay at a fixed size; only the top/right
               offset scales with the card's inline size so the controls hug the
               corner at narrow zoom levels instead of floating toward the
               centre. Pinned cards always show the gold pin in the top-right;
               on hover/focus the tray expands left so the pin slides aside and
               the close button appears in the corner. Unpinned cards keep the
               original hover-only overlay. -->
          <div
            v-if="!showBarInGallery"
            class="absolute z-10 text-neutral-400 ring-0 transition-opacity top-[clamp(0.125rem,2cqi,0.5rem)] right-[clamp(0.125rem,2cqi,0.5rem)]"
            :class="vp.isPinned
              ? 'opacity-100'
              : 'opacity-0 group-hover/gallery:opacity-100 group-focus-within/gallery:opacity-100'"
          >
            <div
              class="flex items-center gap-0.5 overflow-hidden transition-[width] duration-200 ease-out"
              :class="vp.isPinned
                ? 'w-5 group-hover/gallery:w-[calc(var(--spacing-5)*2+0.125rem)] group-focus-within/gallery:w-[calc(var(--spacing-5)*2+0.125rem)]'
                : 'w-[calc(var(--spacing-5)*2+0.125rem)]'"
            >
              <button
                type="button"
                class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-xs leading-none transition-colors focus-visible:outline focus-visible:outline-offset-1 focus-visible:outline-neutral-950/35"
                :class="vp.isPinned ? 'text-gold hover:text-gold' : 'hover:text-neutral-700'"
                :aria-label="vp.isPinned ? t('viewport.unpinBrowser') : t('viewport.pinBrowser')"
                :aria-pressed="!!vp.isPinned"
                @click.stop="onTogglePin(vp.agentId)"
              >
                <UIcon
                  :name="vp.isPinned ? 'i-ph-push-pin-fill' : 'i-ph-push-pin'"
                  class="size-3"
                />
              </button>
              <button
                type="button"
                class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-xs leading-none transition-[opacity,max-width] duration-200 ease-out hover:text-neutral-700 focus-visible:outline focus-visible:outline-offset-1 focus-visible:outline-neutral-950/35"
                :class="vp.isPinned
                  ? 'pointer-events-none max-w-0 opacity-0 group-hover/gallery:pointer-events-auto group-hover/gallery:max-w-5 group-hover/gallery:opacity-100 group-focus-within/gallery:pointer-events-auto group-focus-within/gallery:max-w-5 group-focus-within/gallery:opacity-100'
                  : ''"
                :aria-label="t('browser.closeAgent')"
                @click.stop="onClose(vp.agentId)"
              >
                <UIcon name="i-heroicons-x-mark" class="size-3" />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="group/add flex min-w-0 cursor-pointer flex-col items-stretch self-start overflow-visible rounded-lg border-0 bg-transparent p-1.5 text-left outline-none ring-0 transition-colors hover:bg-neutral-950/4 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
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
          name="gallery-zoom"
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
