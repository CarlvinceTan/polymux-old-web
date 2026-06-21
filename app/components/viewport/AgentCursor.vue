<script setup lang="ts">
import type { CursorState } from '~/composables/types'

/**
 * The agent's mouse, painted over a browser screencast. Shape is the Polymux
 * mark distilled to a symmetric chevron "V" (logo-weight arms, flat-cut ends),
 * pointing up-left like a normal cursor. The vertex is the hotspot — it sits
 * exactly on the driver-reported (x, y). A gold aura breathes around the
 * silhouette, and each click flares that edge-glow outward from the V's edges.
 *
 * Gating (showCursor user setting, presence of a frame) lives in the parent;
 * this component just paints when given a cursor.
 */
const props = withDefaults(defineProps<{
  cursor: CursorState
  /** Monotonic per-agent click counter. Each increment remounts the flare so
   *  the edge-glow ripple replays. 0 / undefined → no ripple yet. */
  clickNonce?: number
  /** Rendered glyph size in px (square). Thumbnails pass a smaller value. */
  size?: number
}>(), {
  clickNonce: 0,
  size: 20,
})

// The chevron-V path, shared by the glyph and the click flare.
const V_PATH = 'M18.6 10.2 L5 5 L10.2 18.6'

// Position the wrapper's origin on the reported point (as a percentage of the
// frame so it tracks regardless of how the <img> is scaled), clamped to the
// box. The viewport is locked to 16:9 and the image uses object-cover, so
// percentage-of-vw / percentage-of-vh lands within a sub-pixel of the true
// spot (the server clamps frames to within 1% of 16:9).
const wrapperStyle = computed(() => {
  const { x, y, vw, vh } = props.cursor
  if (!vw || !vh) return null
  const left = Math.max(0, Math.min(100, (x / vw) * 100))
  const top = Math.max(0, Math.min(100, (y / vh) * 100))
  return { left: `${left}%`, top: `${top}%` }
})

// Offset both layers so the glyph's vertex (5,5 in the 0–24 viewBox) lands on
// the wrapper origin (the hotspot). The flare also scales about that vertex so
// its edge-glow blooms outward from the cursor point.
const vertexOff = computed(() => (5 / 24) * props.size)
const glyphStyle = computed(() => ({
  left: `${-vertexOff.value}px`,
  top: `${-vertexOff.value}px`,
}))
const flareStyle = computed(() => ({
  left: `${-vertexOff.value}px`,
  top: `${-vertexOff.value}px`,
  transformOrigin: `${vertexOff.value}px ${vertexOff.value}px`,
}))
</script>

<template>
  <div
    v-if="wrapperStyle"
    class="agent-cursor pointer-events-none absolute z-10 transition-[left,top] duration-75 ease-out"
    :style="wrapperStyle"
    aria-hidden="true"
  >
    <!-- Click flare: a gold echo of the V, rendered behind the glyph, whose
         edge-glow blooms outward from the vertex and fades. Keyed by clickNonce
         so each click remounts it and replays the animation. -->
    <svg
      v-if="clickNonce"
      :key="clickNonce"
      class="agent-cursor__flare"
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      :style="flareStyle"
    >
      <path
        :d="V_PATH"
        stroke="var(--color-gold)"
        stroke-width="5"
        stroke-linecap="butt"
        stroke-linejoin="round"
      />
    </svg>
    <!-- The cursor: symmetric chevron V (mirror-equal arms about the 45°
         diagonal), flat (butt) ends, logo-weight stroke, with a breathing gold
         edge-glow. -->
    <svg
      class="agent-cursor__glyph"
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      :style="glyphStyle"
    >
      <path
        :d="V_PATH"
        stroke="#0a0a0a"
        stroke-width="5"
        stroke-linecap="butt"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

/* Gold aura that hugs the glyph's silhouette and breathes. The first dark
   shadow keeps the black V readable on bright pages; the thin white one is a
   rim for dark pages; the gold layers trace the edge and pulse. */
.agent-cursor__glyph {
  position: absolute;
  overflow: visible;
  animation: agent-cursor-glow 2.4s ease-in-out infinite;
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

/* Click ripple: the gold edge-glow of a V-shaped echo blooms outward from the
   vertex and fades — the ripple follows the cursor's edges, not a circle. */
.agent-cursor__flare {
  position: absolute;
  overflow: visible;
  animation: agent-cursor-flare 0.55s ease-out forwards;
}

@keyframes agent-cursor-flare {
  0% {
    opacity: 0.9;
    transform: scale(1);
    filter:
      drop-shadow(0 0 1px rgba(201, 148, 31, 1))
      drop-shadow(0 0 3px rgba(201, 148, 31, 0.9));
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
    filter:
      drop-shadow(0 0 7px rgba(201, 148, 31, 0.9))
      drop-shadow(0 0 16px rgba(201, 148, 31, 0.55));
  }
}

/* Respect reduced-motion: keep the cursor + a steady gold rim, drop the pulse
   and the click flare. */
@media (prefers-reduced-motion: reduce) {
  .agent-cursor__glyph {
    animation: none;
    filter:
      drop-shadow(0 0 1.3px #fff)
      drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4))
      drop-shadow(0 0 3px rgba(201, 148, 31, 0.8));
  }
  .agent-cursor__flare {
    animation: none;
    display: none;
  }
}
</style>
