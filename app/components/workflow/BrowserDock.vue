<script setup lang="ts">
import type { ViewportState } from '~/composables/types'

defineOptions({ inheritAttrs: false })

const { t } = useI18n()

const props = defineProps<{
  viewportList: ViewportState[]
  frameUrls?: Map<string, string>
  browserAgentCap?: number
  activeAgentId: string | null
  reconnecting?: boolean
}>()

const emit = defineEmits<{
  promoteViewport: [agentId: string]
  demoteActive: []
  closeViewport: [agentId: string]
  spawnBrowserAgent: []
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

const activeViewport = computed(() => {
  if (!props.activeAgentId) return null
  return props.viewportList.find(v => v.agentId === props.activeAgentId) ?? null
})
const activeFrameUrl = computed(() => {
  const vp = activeViewport.value
  return vp ? props.frameUrls?.get(vp.agentId) : undefined
})

const agentCount = computed(() => props.viewportList.length)
const agentCap = computed(() => props.browserAgentCap ?? 0)
const isAtCap = computed(() => agentCount.value >= agentCap.value && agentCap.value > 0)

// Dock layout switch: 'main' keeps the legacy single-viewport-on-top + thumbnail
// strip; 'gallery' replaces both with a scrollable grid driven by the zoom slider.
// Local state — viewMode (chat/viewport/workflow/node) is the cross-tab persisted
// switch and lives one level up; the gallery toggle is a viewport-only sub-mode
// that resets on remount, which is what we want when reopening a workflow.
const dockMode = ref<'main' | 'gallery'>('main')
// Columns in gallery mode. Lower = bigger viewports = fewer per row, higher =
// smaller and more per row. Cards drop their browser chrome (URL bar, traffic
// lights) once the column count crosses GALLERY_BAR_THRESHOLD so a tight grid
// still feels readable instead of squishing the bar across half-pixel widths.
const GALLERY_MIN_COLS = 1
const GALLERY_MAX_COLS = 8
// Bar (URL + traffic lights) only stays legible when each card has the room to
// show roughly the same chrome density as the main-mode viewport — empirically
// that's ~1/2 of the dock width per card. Anything denser (3+ columns) falls
// back to the bar-less thumbnail rendering even though a URL bar would still
// technically fit, because the user can't usefully read it at that scale.
const GALLERY_BAR_THRESHOLD = 2
const galleryCols = ref(3)

// Cap the slider at the smallest column count that already shows every
// viewport on screen at once. Past that point zooming out further only
// shrinks the cards — they were all visible already, so there's nothing to
// gain. The cap is recomputed when the dock resizes or the viewport list
// changes; it can only shrink galleryCols (never expand it) so the user
// keeps wherever they last parked the zoom when new agents arrive.
const galleryContainer = ref<HTMLElement | null>(null)
const dockSize = ref({ width: 0, height: 0 })

watch(galleryContainer, (el, _old, onCleanup) => {
  if (!el) {
    dockSize.value = { width: 0, height: 0 }
    return
  }
  const measure = () => {
    dockSize.value = { width: el.clientWidth, height: el.clientHeight }
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
const FULL_CHROME_PX = 90
const GRID_GAP_PX = 12
const GRID_PAD_X_PX = 32
const GRID_PAD_Y_PX = 28

function gridHeightAt(cols: number): number {
  const n = props.viewportList.length
  const w = dockSize.value.width
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
  const h = dockSize.value.height
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

function toggleDockMode() {
  dockMode.value = dockMode.value === 'main' ? 'gallery' : 'main'
}

const toast = useAppToast()

function onSpawnOrWarn() {
  if (isAtCap.value) {
    toast.show(t('browser.agentCapReached'), 'warning')
    return
  }
  emit('spawnBrowserAgent')
}

function onPromote(agentId: string) {
  emit('promoteViewport', agentId)
}

function onClose(agentId: string) {
  if (expandedAgentId.value === agentId) expandedAgentId.value = null
  emit('closeViewport', agentId)
}

function onDemoteActive() {
  expandedAgentId.value = null
  emit('demoteActive')
}

function onToggleExpand(agentId: string) {
  expandedAgentId.value = expandedAgentId.value === agentId ? null : agentId
}

// Gallery click: promote the picked viewport and drop back to main mode so the
// chosen one fills the dock immediately. Saves the maintainer the round-trip
// of clicking the toggle a second time after a pick.
function onGalleryPick(agentId: string) {
  emit('promoteViewport', agentId)
  dockMode.value = 'main'
}

function activeTrafficHandlers() {
  return {
    onTrafficRed: () => {
      if (props.activeAgentId) onClose(props.activeAgentId)
    },
    onTrafficYellow: () => onDemoteActive(),
    onTrafficGreen: () => {
      if (props.activeAgentId) onToggleExpand(props.activeAgentId)
    },
  }
}

function activeViewportBinds(vp: ViewportState) {
  return {
    ...vp,
    ...activeTrafficHandlers(),
    frameUrl: props.frameUrls?.get(vp.agentId),
    reconnecting: props.reconnecting,
  }
}
</script>

<template>
  <div
    v-bind="$attrs"
    class="relative flex min-h-0 w-full min-w-0 flex-1 flex-col md:w-auto md:min-h-0 md:min-w-0"
  >
    <!-- Dock-mode toggle. Sits over the viewport area's top-right corner so it
         is always reachable in either mode but stays out of the maintainer's
         way until they go looking for it. The slider only renders in gallery
         mode; sharing this anchor keeps the controls grouped. -->
    <div class="absolute right-3 top-3 z-20 flex items-center gap-2">
      <div
        v-if="dockMode === 'gallery' && effectiveMaxCols > GALLERY_MIN_COLS"
        class="group/zoom flex items-center gap-2 rounded-md bg-white/95 px-2 py-1 text-neutral-700 opacity-75 shadow-sm ring-1 ring-neutral-200 backdrop-blur-sm transition-opacity hover:opacity-100 focus-within:opacity-100"
      >
        <UIcon name="i-heroicons-magnifying-glass-minus-20-solid" class="size-3.5" />
        <input
          v-model.number="sliderDrag"
          type="range"
          :min="GALLERY_MIN_COLS"
          :max="effectiveMaxCols"
          step="0.01"
          class="dock-zoom h-1 w-24 cursor-pointer appearance-none bg-neutral-300"
          :aria-label="t('browser.galleryZoom')"
        >
        <UIcon name="i-heroicons-magnifying-glass-plus-20-solid" class="size-3.5 -scale-x-100" />
      </div>
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center rounded-md bg-white/95 px-1 py-1 text-neutral-700 opacity-75 shadow-sm ring-1 ring-neutral-200 backdrop-blur-sm transition-opacity hover:bg-white hover:text-neutral-900 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
        :aria-label="dockMode === 'main' ? t('browser.galleryView') : t('browser.singleView')"
        :title="dockMode === 'main' ? t('browser.galleryView') : t('browser.singleView')"
        @click="toggleDockMode"
      >
        <UIcon
          :name="dockMode === 'main' ? 'i-heroicons-squares-2x2-20-solid' : 'i-heroicons-rectangle-stack-20-solid'"
          class="size-3.5"
        />
      </button>
    </div>

    <!-- Main mode: existing single-viewport-on-top + horizontal thumbnail strip. -->
    <div
      v-if="dockMode === 'main'"
      class="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain"
    >
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-2 pt-3 @container-[size]">
        <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          <div class="mx-auto w-[min(100cqw,max(1px,calc((100cqh-5.5rem)*16/9)))] max-w-full min-w-0 shrink-0">
            <Viewport
              v-if="activeViewport && (activeFrameUrl || reconnecting || !activeViewport.isWorking)"
              class="w-full min-w-0 shrink-0"
              v-bind="activeViewportBinds(activeViewport)"
            />
            <div
              v-else-if="activeViewport"
              class="ghost-panel flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-center"
              style="aspect-ratio: 16 / 9"
              role="status"
              :aria-label="t('browser.launchingAgent')"
            >
              <svg
                class="mb-3 size-8 animate-spin text-neutral-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <p class="px-6 text-sm text-neutral-400">
                {{ t('browser.launchingAgent') }}
              </p>
            </div>
            <div
              v-else
              class="ghost-panel flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-center"
              style="aspect-ratio: 16 / 9"
            >
              <UIcon name="i-heroicons-computer-desktop-20-solid" class="mb-3 size-8 text-neutral-300" />
              <p class="px-6 text-sm text-neutral-400">
                {{ t('browser.noActiveViewport') }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="h-px w-full shrink-0 bg-neutral-200/90" aria-hidden="true" />
      <div class="w-full min-w-0 shrink-0 overflow-visible">
        <div class="scrollbar-hide flex items-center gap-0 overflow-x-auto px-4 pb-3 pt-2">
          <div
            v-for="vp in viewportList"
            :key="vp.agentId"
            role="button"
            tabindex="0"
            class="group/thumb relative flex h-auto min-w-0 w-48 shrink-0 cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 bg-transparent py-0.5 text-left outline-none ring-0 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
            :class="vp.agentId === activeAgentId ? 'bg-neutral-950/6' : 'hover:bg-neutral-950/4'"
            :aria-label="t('chat.showAsMainViewport', { url: vp.url })"
            @click="onPromote(vp.agentId)"
            @keydown.enter="onPromote(vp.agentId)"
            @keydown.space.prevent="onPromote(vp.agentId)"
          >
            <div class="min-w-0 w-full max-w-full p-2">
              <Viewport
                v-bind="{ ...vp, frameUrl: frameUrls?.get(vp.agentId) }"
                thumbnail
                :show-action-text="false"
                :show-bar="false"
                :reconnecting="reconnecting"
                class="max-w-full min-w-0 w-full select-none"
              />
            </div>
            <button
              type="button"
              class="absolute right-2 top-2 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-xs leading-none text-neutral-400 opacity-0 ring-0 transition-colors hover:text-neutral-700 group-hover/thumb:opacity-100"
              :aria-label="t('browser.closeAgent')"
              @click.stop="onClose(vp.agentId)"
            >
              <UIcon name="i-heroicons-x-mark" class="size-3" />
            </button>
          </div>

          <button
            type="button"
            class="group/add flex h-auto min-w-0 w-48 shrink-0 cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 py-0.5 text-left outline-none ring-0 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
            :class="isAtCap ? 'opacity-40' : ''"
            :aria-label="t('browser.addAgent')"
            @click="onSpawnOrWarn"
          >
            <div class="min-w-0 w-full max-w-full p-2 pt-2.5">
              <div class="flex w-full max-w-full flex-none flex-col gap-1.5 overflow-visible select-none">
                <div class="flex w-full max-w-full flex-col overflow-visible rounded-lg">
                  <div class="flex w-full max-w-full flex-col overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 transition-colors group-hover/add:border-neutral-600">
                    <div class="relative w-full overflow-hidden bg-neutral-50" style="aspect-ratio: 16 / 9">
                      <div class="absolute inset-0 flex items-center justify-center">
                        <UIcon name="i-heroicons-plus-20-solid" class="size-6 text-neutral-400 transition-colors group-hover/add:text-neutral-600" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex gap-2 items-center justify-center px-0">
                  <div class="flex min-w-0 items-center font-mono tracking-wide gap-1 text-2xs text-neutral-500 transition-colors group-hover/add:text-neutral-600 sm:text-caption">
                    <span class="font-bold uppercase">{{ agentCount }}</span>
                    <span>/</span>
                    <span class="font-bold uppercase">{{ agentCap }}</span>
                    <span>agents</span>
                  </div>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Gallery mode: scrollable grid of every viewport, column count driven
         by the zoom slider. Compact rendering (no traffic lights / URL bar)
         kicks in once we exceed GALLERY_BAR_THRESHOLD columns so the chrome
         doesn't get crushed at small sizes. The container ref feeds the
         ResizeObserver that recomputes effectiveMaxCols based on actual
         visible space. -->
    <div
      v-else
      ref="galleryContainer"
      class="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain"
    >
      <div
        v-if="viewportList.length === 0"
        class="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center"
      >
        <UIcon name="i-heroicons-squares-2x2-20-solid" class="mb-3 size-8 text-neutral-300" />
        <p class="text-sm text-neutral-400">{{ t('browser.noActiveViewport') }}</p>
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
          class="group/gallery relative flex min-w-0 cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 bg-transparent p-1.5 text-left outline-none ring-0 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
          :class="vp.agentId === activeAgentId ? 'bg-neutral-950/6' : 'hover:bg-neutral-950/4'"
          :aria-label="t('chat.showAsMainViewport', { url: vp.url })"
          @click="onGalleryPick(vp.agentId)"
          @keydown.enter="onGalleryPick(vp.agentId)"
          @keydown.space.prevent="onGalleryPick(vp.agentId)"
        >
          <Viewport
            v-bind="{ ...vp, frameUrl: frameUrls?.get(vp.agentId) }"
            :thumbnail="compactInGallery"
            :show-bar="showBarInGallery"
            :show-action-text="!compactInGallery"
            :reconnecting="reconnecting"
            class="max-w-full min-w-0 w-full select-none"
          />
          <button
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
          class="group/add flex min-w-0 cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 p-1.5 text-left outline-none ring-0 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
          :class="isAtCap ? 'opacity-40' : ''"
          :aria-label="t('browser.addAgent')"
          @click="onSpawnOrWarn"
        >
          <div class="flex w-full max-w-full flex-col overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 transition-colors group-hover/add:border-neutral-600">
            <div class="relative w-full overflow-hidden bg-neutral-50" style="aspect-ratio: 16 / 9">
              <div class="absolute inset-0 flex items-center justify-center">
                <UIcon name="i-heroicons-plus-20-solid" class="size-6 text-neutral-400 transition-colors group-hover/add:text-neutral-600" />
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>

  <ViewportModal
    v-if="expandedViewport"
    :viewport="expandedViewport"
    :frame-url="expandedFrameUrl"
    @close="expandedAgentId = null"
  />
</template>

<style scoped>
/* Native range styling: thin neutral track, square accent thumb that matches
   the dock's mono/Zed-IDE-flavoured aesthetic instead of the chunky default. */
.dock-zoom::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: rgb(38 38 38);
  cursor: pointer;
  border: 0;
}
.dock-zoom::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: rgb(38 38 38);
  cursor: pointer;
  border: 0;
}
.dock-zoom:hover::-webkit-slider-thumb {
  background: rgb(23 23 23);
}
.dock-zoom:hover::-moz-range-thumb {
  background: rgb(23 23 23);
}
</style>
