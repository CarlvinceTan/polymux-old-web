<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Lines shown in sequence; each step folds the top face down onto the front. */
    phrases: string[]
    /** Pause on the front face before the next flip (ms). */
    holdMs?: number
    /** Flip duration (ms). */
    flipMs?: number
  }>(),
  { holdMs: 2800, flipMs: 720 },
)

const n = computed(() => props.phrases.length)

const idx = ref(0)
const isFlipping = ref(false)
/** Skip transition when snapping rotation back to 0 after a flip. */
const instantReset = ref(false)

const frontText = computed(() => {
  if (n.value === 0) return ''
  return props.phrases[idx.value % n.value] ?? ''
})

const topText = computed(() => {
  if (n.value === 0) return ''
  return props.phrases[(idx.value + 1) % n.value] ?? ''
})

let holdTimer: ReturnType<typeof setTimeout> | null = null

function clearHold() {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
}

function scheduleHold() {
  clearHold()
  if (!import.meta.client || n.value <= 1) return
  holdTimer = setTimeout(() => {
    isFlipping.value = true
  }, props.holdMs)
}

function onCubeTransitionEnd(ev: TransitionEvent) {
  if (ev.target !== ev.currentTarget) return
  if (ev.propertyName !== 'transform') return
  if (!isFlipping.value) return

  instantReset.value = true
  isFlipping.value = false
  idx.value = (idx.value + 1) % n.value

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      instantReset.value = false
      scheduleHold()
    })
  })
}

onMounted(() => {
  scheduleHold()
})

onUnmounted(() => {
  clearHold()
})

watch(
  () => props.phrases,
  () => {
    idx.value = 0
    isFlipping.value = false
    instantReset.value = false
    scheduleHold()
  },
  { deep: true },
)

watch(
  () => [props.holdMs, props.flipMs] as const,
  () => {
    idx.value = 0
    isFlipping.value = false
    scheduleHold()
  },
)

// Skip inline style in the default-render case so the SSR HTML stays
// inline-style-free (SEO auditors flag inline styles). The CSS default
// matches the prop default below.
const cubeStyle = computed(() => {
  if (instantReset.value) return { transitionDuration: '0ms' }
  if (props.flipMs === 720) return null
  return { transitionDuration: `${props.flipMs}ms` }
})

const liveLabel = computed(() => frontText.value || topText.value)
</script>

<template>
  <div
    class="rbd-root text-[0.76em] leading-snug tracking-tight sm:text-[0.72em] lg:text-[0.68em]"
    role="status"
    :aria-live="n > 1 ? 'polite' : 'off'"
    :aria-label="liveLabel"
  >
    <div
      v-if="n === 0"
      class="rbd-empty text-neutral-400"
    >
      <slot name="empty">Add phrases to rotate.</slot>
    </div>
    <div
      v-else-if="n === 1"
      class="rbd-single"
    >
      {{ phrases[0] }}
    </div>
    <div
      v-else
      class="rbd-scene"
    >
      <div
        class="rbd-cube"
        :class="{ 'rbd-cube--flip': isFlipping }"
        :style="cubeStyle"
        @transitionend="onCubeTransitionEnd"
      >
        <div class="rbd-face rbd-face--front">
          {{ frontText }}
        </div>
        <div class="rbd-face rbd-face--top">
          {{ topText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rbd-root {
  /* Half of line box height: matches translateZ for a tight “transparent block”. */
  --rbd-depth: 0.575em;
}

.rbd-scene {
  perspective: 22em;
  perspective-origin: 50% 40%;
}

.rbd-cube {
  position: relative;
  height: 1.15em;
  transform-style: preserve-3d;
  transform: rotateX(0deg);
  transition-property: transform;
  /* Matches `flipMs` prop default; cubeStyle override kicks in only on instant-reset or non-default flipMs. */
  transition-duration: 720ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/*
 * Standard cube layout: top face uses +90° on X; parent animates to −90° so the top
 * face meets the screen (reads as folding downward vs the previous +90° / −90° pairing).
 */
.rbd-cube--flip {
  transform: rotateX(-90deg);
}

.rbd-face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
  background: transparent;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.rbd-face--front {
  transform: rotateX(0deg) translateZ(var(--rbd-depth));
}

/* Top of the prism (next line), aligned like a typical CSS cube “top” face. */
.rbd-face--top {
  transform: rotateX(90deg) translateZ(var(--rbd-depth));
}

.rbd-single {
  display: inline-flex;
  align-items: center;
  min-height: 1.15em;
}
</style>
