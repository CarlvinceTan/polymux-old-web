<script setup lang="ts">
const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    /** Video URLs. Empty = three placeholder slides. One URL = single looping video. */
    sources?: string[]
    intervalMs?: number
  }>(),
  {
    sources: () => [],
    intervalMs: 4000,
  },
)

const slides = computed(() => {
  const s = props.sources
  if (s.length === 0) return [null, null, null] as (string | null)[]
  return s.map((x) => (x ? x : null))
})

const isCarousel = computed(() => slides.value.length > 1)

const currentSlide = ref(0)
/** Whole demo (frame + video) — used for in-viewport checks. */
const rootRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const isPointerInside = ref(false)
/**
 * True when this component’s vertical midpoint lies within the visible viewport
 * (layout scroll or nested `#landing-scroll` updates getBoundingClientRect).
 */
const isVerticallyInViewport = ref(false)

let slideTimer: ReturnType<typeof setInterval> | null = null
let wheelAccum = 0
let detachStageWheel: (() => void) | null = null
let intersectionObserver: IntersectionObserver | null = null
let detachLandingScroll: (() => void) | null = null

const WHEEL_SLIDE_STEP = 52

function recomputeVerticalPlayState() {
  if (import.meta.server) return
  const el = rootRef.value
  if (!el) {
    isVerticallyInViewport.value = false
    return
  }
  const r = el.getBoundingClientRect()
  const midY = r.top + r.height / 2
  const h = window.visualViewport?.height ?? window.innerHeight
  isVerticallyInViewport.value = midY >= 0 && midY <= h
}

function stopAutoAdvance() {
  if (slideTimer) {
    clearInterval(slideTimer)
    slideTimer = null
  }
}

function startAutoAdvance() {
  if (
    import.meta.server
    || !isCarousel.value
    || isPointerInside.value
    || !isVerticallyInViewport.value
  ) {
    return
  }
  stopAutoAdvance()
  slideTimer = setInterval(() => {
    const n = slides.value.length
    if (n < 2) return
    currentSlide.value = (currentSlide.value + 1) % n
  }, props.intervalMs)
}

function syncVideoPlayback() {
  const root = stageRef.value
  if (!root) return
  const vids = [...root.querySelectorAll('video')]
  if (!isVerticallyInViewport.value) {
    vids.forEach((v) => v.pause())
    return
  }
  if (!isCarousel.value) {
    const v = vids[0]
    if (v) v.play().catch(() => {})
    return
  }
  vids.forEach((v, i) => {
    if (i === currentSlide.value) v.play().catch(() => {})
    else v.pause()
  })
}

function indexFromPointer(clientX: number) {
  const root = stageRef.value
  if (!root) return 0
  const n = slides.value.length
  const rect = root.getBoundingClientRect()
  const t = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
  const idx = Math.floor(Math.max(0, Math.min(1, t)) * n)
  return Math.min(n - 1, Math.max(0, idx))
}

function onPointerEnter() {
  if (!isCarousel.value) return
  isPointerInside.value = true
  stopAutoAdvance()
}

function onPointerLeave() {
  if (!isCarousel.value) return
  isPointerInside.value = false
  if (isVerticallyInViewport.value) startAutoAdvance()
}

function onPointerMove(e: PointerEvent) {
  if (!isCarousel.value || !isPointerInside.value) return
  currentSlide.value = indexFromPointer(e.clientX)
}

watch(
  () => slides.value.length,
  (len) => {
    if (currentSlide.value >= len) currentSlide.value = 0
  },
)

watch([currentSlide, slides, isCarousel, isVerticallyInViewport], async () => {
  await nextTick()
  syncVideoPlayback()
})

watch(
  [isCarousel, isVerticallyInViewport, isPointerInside],
  () => {
    if (isCarousel.value && isVerticallyInViewport.value && !isPointerInside.value) {
      startAutoAdvance()
    } else {
      stopAutoAdvance()
    }
  },
  { immediate: true },
)

function bindCarouselWheel(el: HTMLElement) {
  detachStageWheel?.()
  const onWheel = (e: WheelEvent) => {
    if (!isCarousel.value) return
    const n = slides.value.length
    if (n < 2) return

    const rawDx = e.deltaX
    const rawDy = e.deltaY
    let dx = rawDx
    if (dx === 0 && e.shiftKey) dx = rawDy

    if (Math.abs(dx) < 0.5) return
    if (!e.shiftKey && Math.abs(rawDy) > Math.abs(dx)) return

    e.preventDefault()
    e.stopPropagation()

    wheelAccum += dx
    while (wheelAccum >= WHEEL_SLIDE_STEP) {
      wheelAccum -= WHEEL_SLIDE_STEP
      currentSlide.value = (currentSlide.value + 1) % n
    }
    while (wheelAccum <= -WHEEL_SLIDE_STEP) {
      wheelAccum += WHEEL_SLIDE_STEP
      currentSlide.value = (currentSlide.value - 1 + n) % n
    }
  }

  el.addEventListener('wheel', onWheel, { passive: false })
  detachStageWheel = () => {
    el.removeEventListener('wheel', onWheel)
    detachStageWheel = null
  }
}

watch(
  [isCarousel, stageRef],
  async () => {
    await nextTick()
    detachStageWheel?.()
    wheelAccum = 0
    if (import.meta.server || !isCarousel.value) return
    const el = stageRef.value
    if (el) bindCarouselWheel(el)
  },
  { immediate: true },
)

onMounted(() => {
  recomputeVerticalPlayState()

  const el = rootRef.value
  if (el && !import.meta.server) {
    intersectionObserver = new IntersectionObserver(
      () => recomputeVerticalPlayState(),
      { threshold: [0, 0.05, 0.25, 0.5, 0.75, 1], root: null, rootMargin: '0px' },
    )
    intersectionObserver.observe(el)
  }

  window.addEventListener('resize', recomputeVerticalPlayState)
  window.addEventListener('scroll', recomputeVerticalPlayState, { passive: true })

  const landing = document.getElementById('landing-scroll')
  if (landing) {
    landing.addEventListener('scroll', recomputeVerticalPlayState, { passive: true })
    detachLandingScroll = () => {
      landing.removeEventListener('scroll', recomputeVerticalPlayState)
      detachLandingScroll = null
    }
  }

  nextTick(() => syncVideoPlayback())
})

onUnmounted(() => {
  intersectionObserver?.disconnect()
  intersectionObserver = null
  window.removeEventListener('resize', recomputeVerticalPlayState)
  window.removeEventListener('scroll', recomputeVerticalPlayState)
  detachLandingScroll?.()
  detachStageWheel?.()
  stopAutoAdvance()
})
</script>

<template>
  <div ref="rootRef" class="relative">
    <div class="ghost-panel overflow-hidden rounded-xl bg-white">
      <!-- Single clip: loop only, no carousel -->
      <div v-if="!isCarousel" class="relative aspect-video bg-neutral-50">
        <div ref="stageRef" class="absolute inset-0 flex flex-col">
          <video
            v-if="slides[0]"
            class="h-full w-full flex-1 object-cover"
            :src="slides[0]!"
            muted
            playsinline
            loop
            preload="metadata"
          />
          <div
            v-else
            class="flex h-full flex-col items-center justify-center gap-3 text-neutral-300"
          >
            <svg
              class="size-12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="0.75"
            >
              <polygon points="5 3 19 12 5 21" />
            </svg>
            <span class="text-sm font-medium">{{ t('viewport.demoLabel') }}</span>
          </div>
        </div>
      </div>

      <!-- Multiple slides: auto-advance + horizontal hover scrub (no dot indicators) -->
      <div
        v-else
        ref="stageRef"
        class="relative aspect-video cursor-ew-resize bg-neutral-50 select-none"
        @pointerenter="onPointerEnter"
        @pointerleave="onPointerLeave"
        @pointermove="onPointerMove"
      >
        <div
          v-for="(src, i) in slides"
          :key="i"
          class="absolute inset-0 flex items-center justify-center transition-opacity duration-700"
          :class="
            currentSlide === i ? 'opacity-100' : 'opacity-0 pointer-events-none'
          "
        >
          <video
            v-if="src"
            class="h-full w-full object-cover"
            :src="src"
            muted
            playsinline
            loop
            preload="metadata"
          />
          <div v-else class="flex flex-col items-center gap-3 text-neutral-300">
            <svg
              class="size-12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="0.75"
            >
              <polygon points="5 3 19 12 5 21" />
            </svg>
            <span class="text-sm font-medium">{{ t('viewport.demoLabelN', { n: i + 1 }) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
