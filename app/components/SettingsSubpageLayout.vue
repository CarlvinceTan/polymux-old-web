<script setup lang="ts">
const { t } = useI18n()

defineProps<{ title: string }>()
const emit = defineEmits<{ back: [] }>()
defineSlots<{ default: () => unknown }>()

// Walk up the DOM from `el` and return the first overflow-y auto/scroll ancestor.
function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

const innerRef = ref<HTMLElement>()

// Button position in viewport coordinates — starts off-screen until first measure.
const btnStyle = ref<Record<string, string>>({ top: '-9999px', left: '-9999px' })

let scrollEl: HTMLElement | null = null
let ro: ResizeObserver | null = null
let rafId = 0

function measure() {
  if (!scrollEl) return
  const rect = scrollEl.getBoundingClientRect()
  if (rect.width === 0) return

  const W = rect.width
  const pxPerRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

  // Mirror the CSS layout maths so the button aligns perfectly with the content.
  //
  //   D           = max(minPt, (W − 42rem) / 4)   ← centre of left gutter (== padding-top)
  //   arrow top   = D − (halfBtn − h1HalfLH)       ← arrow centre == title centre
  //   arrow left  = max(4px, D − halfBtn)           ← left edge, button centred on D
  //
  //   size-7          = --spacing-7 = 2.625rem  →  halfBtn     = 1.3125rem
  //   headline-md × leading-tight = 1.75 × 1.25  →  h1HalfLH = 1.09375rem
  //   minPt           = 1.5rem

  const maxContentW = 42 * pxPerRem
  const halfBtn     = (2.625 * pxPerRem) / 2
  const h1HalfLH   = (1.75 * pxPerRem * 1.25) / 2
  const minPt       = 1.5 * pxPerRem

  const D         = Math.max(minPt, (W - maxContentW) / 4)
  const arrowTop  = D - (halfBtn - h1HalfLH)
  const arrowLeft = Math.max(4, D - halfBtn)

  btnStyle.value = {
    top:  `${rect.top  + arrowTop}px`,
    left: `${rect.left + arrowLeft}px`,
  }
}

function scheduleMeasure() {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(measure)
}

onMounted(() => {
  scrollEl = findScrollContainer(innerRef.value ?? null)
  if (!scrollEl) return

  scheduleMeasure()

  // Re-measure whenever the scroll container is resized (panel resize, sidebar toggle…)
  ro = new ResizeObserver(scheduleMeasure)
  ro.observe(scrollEl)
  window.addEventListener('resize', scheduleMeasure)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  ro?.disconnect()
  ro = null
  window.removeEventListener('resize', scheduleMeasure)
  scrollEl = null
})
</script>

<template>
  <!--
    Root: receives flex-1 min-h-0 from TabPanel's *:only: selector.
    Inner wrapper: container-type:inline-size for cqw in the content's padding-top.
    NOTE: container-type applies contain:layout which would scope position:fixed —
    that is exactly why the back button is Teleported out to <body> below.
  -->
  <div class="w-full">
    <div ref="innerRef" class="w-full" style="container-type: inline-size">
      <!--
        Content top padding mirrors the JS calculation so both stay in sync:
          padding-top = max(1.5rem, (panel_width − 42rem) / 4)
        100cqw = panel width because the inner wrapper is the query container.
      -->
      <div
        class="mx-auto w-full max-w-2xl px-4 pb-4 sm:px-5 sm:pb-5"
        style="padding-top: max(1.5rem, calc((100cqw - 42rem) / 4))"
      >
        <h1 class="mb-6 text-headline-md font-semibold leading-tight tracking-tight text-neutral-950">
          {{ title }}
        </h1>
        <slot />
      </div>
    </div>
  </div>

  <!--
    Back button is Teleported to <body> so it lives outside every
    overflow:hidden, contain:layout, and overscroll context.
    position:fixed + viewport coordinates = truly immovable during rubber-band bounce.
  -->
  <Teleport to="body">
    <button
      type="button"
      class="fixed z-50 flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:text-neutral-950 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
      :style="btnStyle"
      :aria-label="t('common.back')"
      @click="emit('back')"
    >
      <UIcon name="i-heroicons-arrow-left-20-solid" class="size-4 shrink-0" />
    </button>
  </Teleport>
</template>
