<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { CursorState } from '~/composables/types'

/**
 * The agent's mouse, painted over a browser screencast. Shape is the Polymux
 * mark distilled to a symmetric bold dart — its two back points are the chevron
 * "V"'s arm-ends, so the tip + arm angles match the brand mark; the back closes
 * into a filled arrowhead with a notch. The tip is the hotspot, anchored on the
 * driver-reported (x, y).
 *
 * A gold aura breathes around the silhouette. On a click the dart fills gold
 * from the back wings inward to the tip, then releases. While dragging it holds
 * fully gold and pulses, then drains back out on drop.
 *
 * Gating (showCursor user setting, presence of a frame) lives in the parent;
 * this component just paints when given a cursor.
 */
const props = withDefaults(defineProps<{
  cursor: CursorState
  /** Monotonic per-agent click counter. Each increment plays a one-shot fill. */
  clickNonce?: number
  /** True while the agent is mid-drag (mouse held + moving). Holds the fill. */
  dragging?: boolean
  /** Rendered glyph size in px (square). Thumbnails pass a smaller value. */
  size?: number
}>(), {
  clickNonce: 0,
  dragging: false,
  size: 20,
})

// The dart path, shared by the black base and the gold fill layer.
const DART = 'M5 5 L18.6 10.2 L13 13 L10.2 18.6 Z'
// Unique gradient id per instance (multiple cursors share the page).
const gradId = useId()

// Position the wrapper origin on the reported point (percentage of the frame so
// it tracks regardless of <img> scaling), clamped to the box.
const wrapperStyle = computed(() => {
  const { x, y, vw, vh } = props.cursor
  if (!vw || !vh) return null
  const left = Math.max(0, Math.min(100, (x / vw) * 100))
  const top = Math.max(0, Math.min(100, (y / vh) * 100))
  return { left: `${left}%`, top: `${top}%` }
})

// Offset the glyph so the dart's tip (5,5 in the 0–24 viewBox) lands on the
// wrapper origin (the hotspot).
const glyphStyle = computed(() => {
  const off = (5 / 24) * props.size
  return { left: `${-off}px`, top: `${-off}px` }
})

// Gold fill amount [0,1] along the back→tip axis. The gradient is gold on
// [0, fillB] (back side) and black beyond, so fillB 0→1 sweeps gold to the tip.
const fillB = ref(0)
const pulsing = ref(false)

let rafId: number | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
}

// rAF tween of fillB toward `to` over `ms`, then run `onDone`.
function tween(to: number, ms: number, onDone?: () => void) {
  if (rafId !== null) cancelAnimationFrame(rafId)
  const from = fillB.value
  let start: number | null = null
  function step(ts: number) {
    if (start === null) start = ts
    const p = ms <= 0 ? 1 : Math.min(1, (ts - start) / ms)
    fillB.value = from + (to - from) * p
    if (p < 1) { rafId = requestAnimationFrame(step) }
    else { rafId = null; onDone?.() }
  }
  rafId = requestAnimationFrame(step)
}

// Click: fill in → brief hold → drain. Ignored while dragging (drag owns the fill).
watch(() => props.clickNonce, (n, prev) => {
  if (!import.meta.client || !n || n === prev || props.dragging) return
  if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
  pulsing.value = false
  tween(1, 320, () => {
    holdTimer = setTimeout(() => {
      if (!props.dragging) tween(0, 320)
    }, 150)
  })
})

// Drag: fill in then hold gold + pulse; on release, drain back out.
watch(() => props.dragging, (d) => {
  if (!import.meta.client) return
  if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
  if (d) {
    tween(1, 320, () => { pulsing.value = true })
  }
  else {
    pulsing.value = false
    tween(0, 320)
  }
})

onUnmounted(clearTimers)
</script>

<template>
  <div
    v-if="wrapperStyle"
    class="agent-cursor pointer-events-none absolute z-10 transition-[left,top] duration-75 ease-out"
    :style="wrapperStyle"
    aria-hidden="true"
  >
    <svg
      class="agent-cursor__glyph"
      :class="{ 'agent-cursor__glyph--drag': dragging }"
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      :style="glyphStyle"
    >
      <defs>
        <!-- Fill axis runs PAST both ends (back 15,15 → past-tip 2.5,2.5) so the
             tip + its stroke sit inside [0,1] and fully fill gold. Hard edge at
             offset fillB: [0, fillB] gold (back side), beyond is black. -->
        <linearGradient
          :id="gradId"
          gradientUnits="userSpaceOnUse"
          x1="15"
          y1="15"
          x2="2.5"
          y2="2.5"
        >
          <stop offset="0" stop-color="#c9941f" />
          <stop :offset="fillB" stop-color="#c9941f" />
          <stop :offset="fillB" stop-color="#0a0a0a" />
          <stop offset="1" stop-color="#0a0a0a" />
        </linearGradient>
      </defs>
      <!-- Black base — the resting cursor; the gold layer sits on top. -->
      <path class="agent-cursor__base" :d="DART" />
      <!-- Gold fill layer; the gradient reveals it back→tip, opacity pulses on drag. -->
      <path
        class="agent-cursor__fill"
        :class="{ 'agent-cursor__fill--pulsing': pulsing }"
        :d="DART"
        :fill="`url(#${gradId})`"
        :stroke="`url(#${gradId})`"
      />
    </svg>
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

/* Gold aura that hugs the dart silhouette and breathes. The first dark shadow
   keeps the black dart readable on bright pages; the thin white one is a rim
   for dark pages; the gold layers trace the edge and pulse. */
.agent-cursor__glyph {
  position: absolute;
  overflow: visible;
  animation: agent-cursor-glow 2.4s ease-in-out infinite;
}

.agent-cursor__base,
.agent-cursor__fill {
  stroke-width: 3.4;
  stroke-linejoin: round;
  stroke-linecap: round;
  paint-order: stroke;
}

.agent-cursor__base {
  fill: #0a0a0a;
  stroke: #0a0a0a;
}

.agent-cursor__fill {
  opacity: 1;
}

.agent-cursor__fill--pulsing {
  animation: agent-cursor-pulse 0.9s ease-in-out infinite;
}

@keyframes agent-cursor-glow {
  0%, 100% {
    filter:
      drop-shadow(0 0 1.3px #fff)
      drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4))
      drop-shadow(0 0 2px rgba(201, 148, 31, 0.85))
      drop-shadow(0 0 4px rgba(201, 148, 31, 0.45));
  }
  50% {
    filter:
      drop-shadow(0 0 1.3px #fff)
      drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4))
      drop-shadow(0 0 4px rgba(201, 148, 31, 1))
      drop-shadow(0 0 9px rgba(201, 148, 31, 0.65))
      drop-shadow(0 0 13px rgba(201, 148, 31, 0.35));
  }
}

/* Stronger, faster glow while dragging. */
.agent-cursor__glyph--drag {
  animation: agent-cursor-glow-strong 1.6s ease-in-out infinite;
}

@keyframes agent-cursor-glow-strong {
  0%, 100% {
    filter:
      drop-shadow(0 0 1.3px #fff)
      drop-shadow(0 0 2px rgba(201, 148, 31, 1))
      drop-shadow(0 0 6px rgba(201, 148, 31, 0.7));
  }
  50% {
    filter:
      drop-shadow(0 0 1.3px #fff)
      drop-shadow(0 0 4px rgba(201, 148, 31, 1))
      drop-shadow(0 0 12px rgba(201, 148, 31, 0.85));
  }
}

@keyframes agent-cursor-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* Reduced-motion: steady cursor + gold rim, no breathing / fill churn. */
@media (prefers-reduced-motion: reduce) {
  .agent-cursor__glyph,
  .agent-cursor__glyph--drag {
    animation: none;
    filter:
      drop-shadow(0 0 1.3px #fff)
      drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4))
      drop-shadow(0 0 3px rgba(201, 148, 31, 0.8));
  }
  .agent-cursor__fill--pulsing {
    animation: none;
  }
}
</style>
